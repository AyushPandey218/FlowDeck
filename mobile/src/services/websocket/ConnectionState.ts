export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface ConnectionConfig {
  hostIp: string;
  hostPort: number;
}
