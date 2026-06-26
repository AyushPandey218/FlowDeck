import { useWebSocketStore } from './websocketStore';
import { parseWSMessage } from './events';
import { NETWORK } from '@flowdeck/shared';
import { CustomAlert } from '../../components/AlertSystem';
import * as ExpoClipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { useTransferStore } from './transferStore';
import { startDownload, startUpload, cancelActiveTransfer, ensureFlowDeckDir } from './transferService';
import { navigate } from '../../navigation/navigationRef';
import { haptics } from '../haptics';
import * as FileSystem from 'expo-file-system/legacy';

// Console logging is handled by React Native's standard console.
// Logs are automatically stripped in release builds by the bundler.

const MAX_PAYLOAD_BYTES = 100 * 1024; // 100 KB
const CLIPBOARD_POLL_INTERVAL_MS = 1000;

async function sha256Hex(text: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    text,
  );
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private activePairingToken: string | null = null;
  private clipboardPollTimer: ReturnType<typeof setInterval> | null = null;
  private lastLocalClipboard: string | null = null;
  private pendingDownloadHash: string | null = null;
  private pendingUploadUri: string | null = null;

  constructor() {
    ensureFlowDeckDir().catch((err) => console.error('[SOCKET] Failed to ensure Flow Deck directory:', err));
  }

  public executeAction(actionId: string) {
    console.log(`[SOCKET] Sending EXECUTE_ACTION for ID: ${actionId}`);
    const message = {
      type: 'EXECUTE_ACTION',
      payload: {
        actionId,
      },
      timestamp: Date.now(),
    };
    this.send(message);
  }

  public openTaskManager() {
    console.log(`[SOCKET] Sending OPEN_TASK_MANAGER`);
    const message = {
      type: 'OPEN_TASK_MANAGER',
      payload: {},
      timestamp: Date.now(),
    };
    this.send(message);
  }

  public connect(pairingToken?: string) {
    this.cleanup();
    this.isExplicitlyClosed = false;
    
    if (pairingToken) {
      this.activePairingToken = pairingToken;
    }

    const { hostIp, hostPort, setConnectionStatus, setLastError } = useWebSocketStore.getState();
    const url = `ws://${hostIp}:${hostPort}`;

    console.log(`[SOCKET] Connecting to ${url}...`);
    // Keep status as 'connecting' during the WebSocket connection and protocol handshake
    setConnectionStatus('connecting');

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[SOCKET] TCP connected, sending PAIR_REQUEST...');
        const { deviceId, deviceName, deviceNickname } = useWebSocketStore.getState();
        
        // Construct PAIR_REQUEST payload
        const pairRequest = {
          type: 'PAIR_REQUEST',
          payload: {
            deviceId,
            deviceName,
            deviceNickname,
            pairingToken: this.activePairingToken || undefined,
          },
          timestamp: Date.now(),
        };

        this.send(pairRequest);
      };

      this.ws.onmessage = (event) => {
        const envelope = parseWSMessage(event.data);
        if (!envelope) return;

        console.log(`[SOCKET] Received message type: ${envelope.type}`);

        if (envelope.type === 'PAIR_RESPONSE') {
          const success = envelope.payload?.success;
          if (success) {
            this.reconnectAttempts = 0; // Reset connection attempts on success
            console.log('[SOCKET] Pairing/Handshake succeeded!');
            setConnectionStatus('connected');
            haptics.triggerSuccess();
            setLastError('None');

            // If we successfully paired using a token, save this host permanently
            if (this.activePairingToken) {
              const { hostIp: currentIp, hostPort: currentPort, setPairedHost } = useWebSocketStore.getState();
              setPairedHost({ hostIp: currentIp, hostPort: currentPort });
              this.activePairingToken = null;
            }

            // Start clipboard monitoring once connected
            this.startClipboardMonitor();
          } else {
            const err = envelope.payload?.error || 'Authorization rejected';
            console.log(`[SOCKET] Pairing/Handshake rejected: ${err}`);
            setLastError(err);
            haptics.triggerError();
            this.disconnect();
          }
        } else if (envelope.type === 'PING') {
          console.log('[PING] Received PING, returning PONG');
          const pong = {
            type: 'PONG',
            payload: null,
            timestamp: Date.now(),
          };
          this.send(pong);
        } else if (envelope.type === 'SERVER_STATUS') {
          console.log('[SOCKET] Received SERVER_STATUS:', JSON.stringify(envelope.payload));
          const { feedbackGithubUrl, feedbackEmail } = envelope.payload || {};
          const store = useWebSocketStore.getState();
          if (typeof feedbackGithubUrl === 'string') {
            store.setFeedbackGithubUrl(feedbackGithubUrl);
          }
          if (typeof feedbackEmail === 'string') {
            store.setFeedbackEmail(feedbackEmail);
          }
        } else if (envelope.type === 'ACTIONS_SYNC') {
          console.log('[SOCKET] Received ACTIONS_SYNC:', JSON.stringify(envelope.payload));
          const actions = envelope.payload?.actions;
          if (Array.isArray(actions)) {
            useWebSocketStore.getState().setActions(actions);
          }
        } else if (envelope.type === 'LAYOUT_SYNC') {
          console.log('[SOCKET] Received LAYOUT_SYNC:', JSON.stringify(envelope.payload));
          const { pages, layoutVersion } = envelope.payload || {};
          if (Array.isArray(pages)) {
            useWebSocketStore.getState().setPages(pages);
          }
          if (typeof layoutVersion === 'number') {
            useWebSocketStore.getState().setLayoutVersion(layoutVersion);
          }
        } else if (envelope.type === 'ACTION_STATUS') {
          console.log('[SOCKET] Received ACTION_STATUS:', JSON.stringify(envelope.payload));
          const { success, message: statusMsg } = envelope.payload || {};
          if (success) {
            haptics.triggerSuccess();
          } else {
            haptics.triggerError();
            CustomAlert.alert('Action Execution Failed', statusMsg || 'Unknown error occurred.');
          }
        } else if (envelope.type === 'SYSTEM_STATS') {
          const stats = envelope.payload;
          if (stats) {
            useWebSocketStore.getState().setSystemStats(stats);
          }
        } else if (envelope.type === 'CLIPBOARD_SYNC') {
          this.handleIncomingClipboardSync(envelope.payload);
        } else if (envelope.type === 'FILE_TRANSFER_REQUEST') {
          console.log('[SOCKET] Received FILE_TRANSFER_REQUEST:', JSON.stringify(envelope.payload));
          const { transferId, fileName, fileSize, fileHash } = envelope.payload || {};
          const store = useTransferStore.getState();
          if (store.activeTransfer) {
            const rejectMsg = {
              type: 'FILE_TRANSFER_REJECT',
              payload: { transferId, reason: 'Another transfer is already active.' },
              timestamp: Date.now(),
            };
            this.send(rejectMsg);
            return;
          }
          if (fileSize > 100 * 1024 * 1024) {
            const rejectMsg = {
              type: 'FILE_TRANSFER_REJECT',
              payload: { transferId, reason: 'File exceeds size limit of 100 MB' },
              timestamp: Date.now(),
            };
            this.send(rejectMsg);
            return;
          }
          store.setActiveTransfer({
            transferId,
            fileName,
            fileSize,
            direction: 'desktop_to_mobile',
            bytesTransferred: 0,
            avgSpeed: 0,
            peakSpeed: 0,
            durationMs: 0,
            status: 'pending',
          });
          this.pendingDownloadHash = fileHash;
          
          // Automatically navigate to Transfers screen so the user sees the Accept/Decline dialog
          setTimeout(() => {
            navigate('Transfers');
          }, 50);
        } else if (envelope.type === 'FILE_TRANSFER_ACCEPT') {
          console.log('[SOCKET] Received FILE_TRANSFER_ACCEPT:', JSON.stringify(envelope.payload));
          const { transferId, port, hostIp, transferToken } = envelope.payload || {};
          const store = useTransferStore.getState();
          const active = store.activeTransfer;
          if (!active || active.transferId !== transferId) return;

          if (active.direction === 'desktop_to_mobile') {
            const expectedHash = this.pendingDownloadHash || '';
            this.pendingDownloadHash = null;
            startDownload(
              { transferId, port, hostIp, transferToken },
              active.fileName,
              active.fileSize,
              expectedHash,
              (success, err) => {
                if (success) {
                  this.send({
                    type: 'FILE_TRANSFER_COMPLETE',
                    payload: { transferId },
                    timestamp: Date.now(),
                  });
                } else {
                  this.send({
                    type: 'FILE_TRANSFER_CANCEL',
                    payload: { transferId, reason: err || 'Download failed' },
                    timestamp: Date.now(),
                  });
                }
              }
            );
          } else if (active.direction === 'mobile_to_desktop') {
            const fileUri = this.pendingUploadUri || '';
            this.pendingUploadUri = null;
            if (!fileUri) {
              console.error('[SOCKET] No pending upload file URI found');
              return;
            }
            startUpload(
              { transferId, port, hostIp, transferToken },
              fileUri,
              active.fileName,
              active.fileSize,
              (success, err) => {
                if (success) {
                  this.send({
                    type: 'FILE_TRANSFER_COMPLETE',
                    payload: { transferId },
                    timestamp: Date.now(),
                  });
                } else {
                  this.send({
                    type: 'FILE_TRANSFER_CANCEL',
                    payload: { transferId, reason: err || 'Upload failed' },
                    timestamp: Date.now(),
                  });
                }
              }
            );
          }
        } else if (envelope.type === 'FILE_TRANSFER_REJECT') {
          console.log('[SOCKET] Received FILE_TRANSFER_REJECT:', JSON.stringify(envelope.payload));
          haptics.triggerError();
          const { transferId, reason } = envelope.payload || {};
          const store = useTransferStore.getState();
          const active = store.activeTransfer;
          if (active && active.transferId === transferId) {
            this.cleanupPendingUpload();
            store.addHistoryEntry({
              id: Math.random().toString(36).substring(2, 9),
              fileName: active.fileName,
              direction: active.direction,
              fileSize: active.fileSize,
              avgSpeed: null,
              peakSpeed: null,
              durationMs: null,
              status: 'rejected',
              timestamp: Date.now(),
              integrityVerified: false,
            });
            store.setActiveTransfer(null);
            CustomAlert.alert('Transfer Rejected', reason || 'The request was rejected by Desktop.');
          }
        } else if (envelope.type === 'FILE_TRANSFER_CANCEL') {
          console.log('[SOCKET] Received FILE_TRANSFER_CANCEL:', JSON.stringify(envelope.payload));
          haptics.triggerError();
          const { transferId, reason } = envelope.payload || {};
          const store = useTransferStore.getState();
          const active = store.activeTransfer;
          if (active && active.transferId === transferId) {
            this.cleanupPendingUpload();
            cancelActiveTransfer();
            CustomAlert.alert('Transfer Cancelled', reason || 'The transfer was cancelled.');
          }
        } else if (envelope.type === 'FILE_TRANSFER_COMPLETE') {
          console.log('[SOCKET] Received FILE_TRANSFER_COMPLETE:', JSON.stringify(envelope.payload));
          const { transferId } = envelope.payload || {};
          const store = useTransferStore.getState();
          const active = store.activeTransfer;
          if (active && active.transferId === transferId) {
            this.cleanupPendingUpload();
            store.setActiveTransfer(null);
          }
        } else if (envelope.type === 'FACTORY_RESET') {
          console.log('[SOCKET] Received FACTORY_RESET signal. Wiping all data...');
          haptics.triggerWarning();
          
          import('@react-native-async-storage/async-storage').then(AsyncStorage => {
            AsyncStorage.default.clear().then(() => {
              console.log('[SOCKET] AsyncStorage cleared.');
              const store = useWebSocketStore.getState();
              store.setConnectionStatus('disconnected');
              store.setPages([]);
              store.setActions([]);
              store.setPairedHost(null);
              store.setOnboardingCompleted(false);
              store.setClipboardSyncEnabled(false);
              
              this.isExplicitlyClosed = true;
              if (this.ws) {
                this.ws.close();
                this.ws = null;
              }
              
              navigate('Onboarding', undefined);
            });
          });
        }
      };

      this.ws.onerror = (e: any) => {
        console.log('[SOCKET] Connection error');
        setLastError(e.message || 'Connection failed');
      };

      this.ws.onclose = () => {
        console.log('[SOCKET] Connection closed');
        setConnectionStatus('disconnected');
        if (!this.isExplicitlyClosed) {
          haptics.triggerError();
        }
        useWebSocketStore.getState().setSystemStats(null);
        this.stopClipboardMonitor();
        this.cleanupPendingUpload();
        
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err: any) {
      console.error('[SOCKET] Failed to instantiate WebSocket:', err);
      setConnectionStatus('disconnected');
      setLastError(err.message || 'Failed to initialize WebSocket');
      this.scheduleReconnect();
    }
  }

  private async handleIncomingClipboardSync(payload: any) {
    const { clipboardSyncEnabled, lastSyncId, lastClipboardHash, addClipboardEntry, setLastSyncId, setLastClipboardHash } = useWebSocketStore.getState();

    if (!clipboardSyncEnabled) {
      console.log('[CLIPBOARD] Ignoring incoming sync – clipboard sync disabled');
      return;
    }

    const text = payload?.text;
    const syncId = payload?.syncId || '';
    const direction = payload?.direction || 'desktop_to_mobile';
    const sourceDeviceId = payload?.sourceDeviceId || 'desktop';
    const timestamp = payload?.timestamp || Date.now();
    const version = payload?.version || 1;

    if (!text || typeof text !== 'string') return;

    // Enforce 100 KB limit
    if (text.length > MAX_PAYLOAD_BYTES) {
      console.log(`[CLIPBOARD] Rejecting incoming sync: text size (${text.length} bytes) exceeds 100 KB limit`);
      return;
    }

    // Loop prevention #1: check syncId
    if (syncId && lastSyncId === syncId) {
      console.log('[CLIPBOARD] Ignoring incoming sync – syncId matches (loop prevention)');
      return;
    }

    // Loop prevention #2: check content hash
    const contentHash = await sha256Hex(text);
    if (lastClipboardHash && lastClipboardHash === contentHash) {
      console.log('[CLIPBOARD] Ignoring incoming sync – content hash matches (loop prevention)');
      return;
    }

    // Write to device clipboard
    try {
      await ExpoClipboard.setStringAsync(text);
      console.log(`[CLIPBOARD] Applied incoming clipboard text (${text.length} bytes) from ${sourceDeviceId}`);
    } catch (e) {
      console.error('[CLIPBOARD] Failed to write to device clipboard:', e);
      return;
    }

    // Add to local history
    addClipboardEntry({ text, sourceDeviceId, timestamp, syncId, version, direction });

    // Update loop prevention state
    setLastSyncId(syncId);
    setLastClipboardHash(contentHash);

    // Update local clipboard tracker to avoid re-syncing this value back
    this.lastLocalClipboard = text;
  }

  private startClipboardMonitor() {
    this.stopClipboardMonitor();

    // Seed with current clipboard to avoid immediate sync
    ExpoClipboard.getStringAsync().then((text) => {
      if (text) this.lastLocalClipboard = text;
    }).catch(() => {});

    this.clipboardPollTimer = setInterval(async () => {
      const { clipboardSyncEnabled, lastClipboardHash, deviceId, addClipboardEntry, setLastSyncId, setLastClipboardHash } = useWebSocketStore.getState();

      if (!clipboardSyncEnabled) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      try {
        const currentText = await ExpoClipboard.getStringAsync();
        if (!currentText) return;

        // Detect change
        if (currentText === this.lastLocalClipboard) return;
        this.lastLocalClipboard = currentText;

        // Enforce 100 KB limit
        if (currentText.length > MAX_PAYLOAD_BYTES) {
          console.log(`[CLIPBOARD] Skipping outbound sync: text size (${currentText.length} bytes) exceeds 100 KB limit`);
          return;
        }

        const contentHash = await sha256Hex(currentText);

        // Loop prevention: don't re-send what we just received
        if (lastClipboardHash && lastClipboardHash === contentHash) return;

        const syncId = `mobile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const payload = {
          text: currentText,
          sourceDeviceId: deviceId,
          timestamp: Date.now(),
          syncId,
          version: 1,
          direction: 'mobile_to_desktop' as const,
        };

        const message = {
          type: 'CLIPBOARD_SYNC',
          payload,
          timestamp: Date.now(),
        };

        this.send(message);
        console.log(`[CLIPBOARD] Sent clipboard change to desktop (${currentText.length} bytes)`);

        // Add to local history
        addClipboardEntry(payload);

        // Update loop prevention state
        setLastSyncId(syncId);
        setLastClipboardHash(contentHash);
      } catch (e) {
        // Clipboard read errors are expected when app is in background
      }
    }, CLIPBOARD_POLL_INTERVAL_MS);
  }

  private stopClipboardMonitor() {
    if (this.clipboardPollTimer) {
      clearInterval(this.clipboardPollTimer);
      this.clipboardPollTimer = null;
    }
  }

  public unpair() {
    console.log('[SOCKET] Unpairing and disconnecting...');
    const { deviceId, deviceName, deviceNickname } = useWebSocketStore.getState();
    
    const unpairMsg = {
      type: 'PAIR_REQUEST',
      payload: {
        deviceId,
        deviceName,
        deviceNickname,
        unpair: true,
      },
      timestamp: Date.now(),
    };

    this.send(unpairMsg);

    // Briefly wait for socket send buffer, then disconnect
    setTimeout(() => {
      this.disconnect();
    }, 150);
  }

  public disconnect() {
    console.log('[SOCKET] Disconnecting explicitly');
    this.isExplicitlyClosed = true;
    this.activePairingToken = null;
    this.stopClipboardMonitor();
    this.cleanupPendingUpload();
    this.cleanup();
    
    const { setConnectionStatus, setLastError } = useWebSocketStore.getState();
    setConnectionStatus('disconnected');
    setLastError('None');
    useWebSocketStore.getState().setSystemStats(null);
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        console.error('[SOCKET] Failed to stringify and send message:', e);
      }
    } else {
      console.warn('[SOCKET] Cannot send message: socket not open');
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    let delay = 3000;
    if (this.reconnectAttempts === 2) {
      delay = 5000;
    } else if (this.reconnectAttempts === 3) {
      delay = 10000;
    } else if (this.reconnectAttempts >= 4) {
      delay = 15000;
    }

    console.log(`[RECONNECT] Scheduling reconnect attempt #${this.reconnectAttempts} in ${delay / 1000}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[RECONNECT] Attempting to reconnect...');
      this.connect();
    }, delay);
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopClipboardMonitor();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  public requestUpload(fileUri: string, fileName: string, fileSize: number, fileHash: string) {
    const transferId = `mobile-upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const store = useTransferStore.getState();
    store.setActiveTransfer({
      transferId,
      fileName,
      fileSize,
      direction: 'mobile_to_desktop',
      bytesTransferred: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      durationMs: 0,
      status: 'pending',
    });

    this.pendingUploadUri = fileUri;

    const requestMsg = {
      type: 'FILE_TRANSFER_REQUEST',
      payload: {
        transferId,
        fileName,
        fileSize,
        mimeType: 'application/octet-stream',
        fileHash,
        direction: 'mobile_to_desktop',
      },
      timestamp: Date.now(),
    };
    this.send(requestMsg);
    console.log('[SOCKET] Sent FILE_TRANSFER_REQUEST for upload:', fileName);
  }

  public acceptIncomingTransfer(transferId: string) {
    const acceptMsg = {
      type: 'FILE_TRANSFER_ACCEPT',
      payload: { transferId },
      timestamp: Date.now(),
    };
    this.send(acceptMsg);
    console.log('[SOCKET] Accepted incoming transfer request:', transferId);
  }

  public rejectIncomingTransfer(transferId: string) {
    const rejectMsg = {
      type: 'FILE_TRANSFER_REJECT',
      payload: { transferId, reason: 'Rejected by user.' },
      timestamp: Date.now(),
    };
    this.send(rejectMsg);
    
    const store = useTransferStore.getState();
    const active = store.activeTransfer;
    if (active && active.transferId === transferId) {
      store.addHistoryEntry({
        id: Math.random().toString(36).substring(2, 9),
        fileName: active.fileName,
        direction: active.direction,
        fileSize: active.fileSize,
        avgSpeed: null,
        peakSpeed: null,
        durationMs: null,
        status: 'rejected',
        timestamp: Date.now(),
        integrityVerified: false,
      });
      store.setActiveTransfer(null);
    }
    console.log('[SOCKET] Rejected incoming transfer request:', transferId);
  }

  public cancelTransfer(transferId: string) {
    const cancelMsg = {
      type: 'FILE_TRANSFER_CANCEL',
      payload: { transferId, reason: 'Cancelled by user.' },
      timestamp: Date.now(),
    };
    this.send(cancelMsg);
    this.cleanupPendingUpload();
    cancelActiveTransfer();
  }

  private cleanupPendingUpload() {
    if (this.pendingUploadUri) {
      const uri = this.pendingUploadUri;
      this.pendingUploadUri = null;
      if (uri.includes('/cache/upload_')) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch((err) => {
          console.error('[SOCKET] Failed to delete pending upload file:', err);
        });
      }
    }
  }
}

export const websocketManager = new WebSocketManager();
