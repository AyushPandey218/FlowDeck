import * as FileSystem from 'expo-file-system/legacy';
import { useTransferStore, TransferHistoryEntry } from './transferStore';
import { computeFileHash } from './fileHasher';
import { haptics } from '../haptics';

export const FLOW_DECK_DIR = `${FileSystem.documentDirectory}Flow Deck/`;

let activeDownloadTask: FileSystem.DownloadResumable | null = null;
let activeUploadTask: FileSystem.UploadTask | null = null;

export async function ensureFlowDeckDir() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(FLOW_DECK_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(FLOW_DECK_DIR, { intermediates: true });
      console.log('[FILE_SYSTEM] Created Flow Deck directory on mobile:', FLOW_DECK_DIR);
    }
  } catch (err) {
    console.error('[FILE_SYSTEM] Failed to create Flow Deck directory:', err);
  }
}

export function cancelActiveTransfer() {
  const store = useTransferStore.getState();
  const active = store.activeTransfer;
  
  if (active) {
    console.log(`[TRANSFER_SERVICE] Cancelling active transfer: ${active.transferId}`);
    
    if (activeDownloadTask) {
      activeDownloadTask.cancelAsync().catch((err: any) => console.log('Cancel download task error:', err));
      activeDownloadTask = null;
    }
    
    if (activeUploadTask) {
      activeUploadTask.cancelAsync().catch((err: any) => console.log('Cancel upload task error:', err));
      activeUploadTask = null;
    }

    // Log to history
    store.addHistoryEntry({
      id: Math.random().toString(36).substring(2, 9),
      fileName: active.fileName,
      direction: active.direction,
      fileSize: active.fileSize,
      avgSpeed: active.avgSpeed > 0 ? active.avgSpeed : null,
      peakSpeed: active.peakSpeed > 0 ? active.peakSpeed : null,
      durationMs: active.durationMs > 0 ? active.durationMs : null,
      status: 'cancelled',
      timestamp: Date.now(),
      integrityVerified: false,
    });
    
    store.setActiveTransfer(null);
  }
}

export async function startDownload(
  payload: { transferId: string; port: number; hostIp: string; transferToken: string },
  fileName: string,
  fileSize: number,
  expectedHash: string,
  onFinished: (success: boolean, error?: string) => void
) {
  await ensureFlowDeckDir();
  const store = useTransferStore.getState();
  
  store.setActiveTransfer({
    transferId: payload.transferId,
    fileName,
    fileSize,
    direction: 'desktop_to_mobile',
    bytesTransferred: 0,
    avgSpeed: 0,
    peakSpeed: 0,
    durationMs: 0,
    status: 'transferring',
  });

  const uri = `http://${payload.hostIp}:${payload.port}/${payload.transferId}`;
  const fileUri = `${FLOW_DECK_DIR}${fileName}`;

  const startTime = Date.now();
  let lastCheck = Date.now();
  let lastBytes = 0;
  let peakSpeed = 0;

  activeDownloadTask = FileSystem.createDownloadResumable(
    uri,
    fileUri,
    {
      headers: {
        'X-Transfer-Token': payload.transferToken,
      },
    },
    (progress) => {
      const bytesTransferred = progress.totalBytesWritten;
      const elapsed = Date.now() - startTime;
      const durationSec = elapsed / 1000;
      const avgSpeed = durationSec > 0 ? (bytesTransferred / (1024 * 1024)) / durationSec : 0;

      const now = Date.now();
      if (now - lastCheck >= 500) {
        const deltaBytes = bytesTransferred - lastBytes;
        const deltaSec = (now - lastCheck) / 1000;
        const currentSpeed = deltaSec > 0 ? (deltaBytes / (1024 * 1024)) / deltaSec : 0;
        peakSpeed = Math.max(peakSpeed, currentSpeed);

        lastBytes = bytesTransferred;
        lastCheck = now;
      }

      store.updateActiveProgress(bytesTransferred, avgSpeed, peakSpeed, elapsed);
    }
  );

  try {
    const result = await activeDownloadTask.downloadAsync();
    activeDownloadTask = null;

    if (result && result.uri) {
      console.log('[TRANSFER_SERVICE] Download finished, calculating SHA-256...');
      
      // Calculate SHA256 of downloaded file
      const { hash } = await computeFileHash(result.uri);
      const isMatch = hash.toLowerCase() === expectedHash.toLowerCase();
      
      const elapsed = Date.now() - startTime;
      const durationSec = elapsed / 1000;
      const finalAvgSpeed = durationSec > 0 ? (fileSize / (1024 * 1024)) / durationSec : 0;

      console.log(`[TRANSFER_SERVICE] Expected Hash: ${expectedHash}, Computed: ${hash}, Match: ${isMatch}`);

      const status = isMatch ? 'completed' : 'failed';
      const historyEntry: TransferHistoryEntry = {
        id: Math.random().toString(36).substring(2, 9),
        fileName,
        direction: 'desktop_to_mobile',
        fileSize,
        avgSpeed: finalAvgSpeed,
        peakSpeed: peakSpeed > 0 ? peakSpeed : finalAvgSpeed,
        durationMs: elapsed,
        status,
        timestamp: Date.now(),
        integrityVerified: isMatch,
      };

      store.addHistoryEntry(historyEntry);
      store.setActiveTransfer(null);
      
      if (isMatch) {
        haptics.triggerSuccess();
        onFinished(true);
      } else {
        haptics.triggerError();
        // Remove corrupted file
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        onFinished(false, 'Integrity check failed. File was deleted.');
      }
    } else {
      throw new Error('Download task returned no result');
    }
  } catch (err: any) {
    activeDownloadTask = null;
    const elapsed = Date.now() - startTime;
    console.error('[TRANSFER_SERVICE] Download failed:', err);

    store.addHistoryEntry({
      id: Math.random().toString(36).substring(2, 9),
      fileName,
      direction: 'desktop_to_mobile',
      fileSize,
      avgSpeed: null,
      peakSpeed: null,
      durationMs: elapsed,
      status: 'failed',
      timestamp: Date.now(),
      integrityVerified: false,
    });
    
    haptics.triggerError();
    store.setActiveTransfer(null);
    onFinished(false, err.message || 'Network download error');
  }
}

export async function startUpload(
  payload: { transferId: string; port: number; hostIp: string; transferToken: string },
  fileUri: string,
  fileName: string,
  fileSize: number,
  onFinished: (success: boolean, error?: string) => void
) {
  const store = useTransferStore.getState();

  store.setActiveTransfer({
    transferId: payload.transferId,
    fileName,
    fileSize,
    direction: 'mobile_to_desktop',
    bytesTransferred: 0,
    avgSpeed: 0,
    peakSpeed: 0,
    durationMs: 0,
    status: 'transferring',
  });

  const uri = `http://${payload.hostIp}:${payload.port}/${payload.transferId}`;
  
  const startTime = Date.now();
  let lastCheck = Date.now();
  let lastBytes = 0;
  let peakSpeed = 0;

  const uploadTask = FileSystem.createUploadTask(
    uri,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'X-Transfer-Token': payload.transferToken,
        'Content-Type': 'application/octet-stream',
      },
    },
    (progress) => {
      const bytesTransferred = progress.totalBytesSent;
      const elapsed = Date.now() - startTime;
      const durationSec = elapsed / 1000;
      const avgSpeed = durationSec > 0 ? (bytesTransferred / (1024 * 1024)) / durationSec : 0;

      const now = Date.now();
      if (now - lastCheck >= 500) {
        const deltaBytes = bytesTransferred - lastBytes;
        const deltaSec = (now - lastCheck) / 1000;
        const currentSpeed = deltaSec > 0 ? (deltaBytes / (1024 * 1024)) / deltaSec : 0;
        peakSpeed = Math.max(peakSpeed, currentSpeed);

        lastBytes = bytesTransferred;
        lastCheck = now;
      }

      store.updateActiveProgress(bytesTransferred, avgSpeed, peakSpeed, elapsed);
    }
  );
  activeUploadTask = uploadTask;

  try {
    const result = await uploadTask.uploadAsync();
    activeUploadTask = null;

    const elapsed = Date.now() - startTime;
    const durationSec = elapsed / 1000;
    const finalAvgSpeed = durationSec > 0 ? (fileSize / (1024 * 1024)) / durationSec : 0;

    let success = false;
    let errorMsg = 'Upload failed';

    if (result && (result.status === 200 || result.status === 201)) {
      success = true;
    } else {
      if (result) {
        errorMsg = `Server returned status: ${result.status} ${result.body || ''}`;
      }
    }

    const status = success ? 'completed' : 'failed';
    store.addHistoryEntry({
      id: Math.random().toString(36).substring(2, 9),
      fileName,
      direction: 'mobile_to_desktop',
      fileSize,
      avgSpeed: finalAvgSpeed,
      peakSpeed: peakSpeed > 0 ? peakSpeed : finalAvgSpeed,
      durationMs: elapsed,
      status,
      timestamp: Date.now(),
      integrityVerified: success, // Server validates integrity of upload, so if it returns 200 it's verified
    });

    // Clean up temporary upload copy if necessary
    if (fileUri.includes('/cache/upload_')) {
      FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    }

    if (success) {
      haptics.triggerSuccess();
    } else {
      haptics.triggerError();
    }

    store.setActiveTransfer(null);
    onFinished(success, success ? undefined : errorMsg);
  } catch (err: any) {
    activeUploadTask = null;
    const elapsed = Date.now() - startTime;
    console.error('[TRANSFER_SERVICE] Upload failed:', err);

    store.addHistoryEntry({
      id: Math.random().toString(36).substring(2, 9),
      fileName,
      direction: 'mobile_to_desktop',
      fileSize,
      avgSpeed: null,
      peakSpeed: null,
      durationMs: elapsed,
      status: 'failed',
      timestamp: Date.now(),
      integrityVerified: false,
    });

    // Clean up temporary upload copy if necessary
    if (fileUri.includes('/cache/upload_')) {
      FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    }

    haptics.triggerError();
    store.setActiveTransfer(null);
    onFinished(false, err.message || 'Network upload error');
  }
}
