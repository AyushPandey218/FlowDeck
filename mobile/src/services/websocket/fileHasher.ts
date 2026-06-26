import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from 'js-sha256';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

function base64ToBytes(base64: string): Uint8Array {
  // Clean up any potential whitespace/newlines in the base64 string
  const cleaned = base64.replace(/[\s\r\n=]/g, '');
  let bufferLength = cleaned.length * 0.75;
  
  const bytes = new Uint8Array(Math.floor(bufferLength));
  let p = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const encoded1 = lookup[cleaned.charCodeAt(i)] || 0;
    const encoded2 = lookup[cleaned.charCodeAt(i + 1)] || 0;
    const encoded3 = lookup[cleaned.charCodeAt(i + 2)] || 0;
    const encoded4 = lookup[cleaned.charCodeAt(i + 3)] || 0;

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bytes.length) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (p < bytes.length) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }
  return bytes;
}

export async function computeFileHash(
  fileUri: string,
  onProgress?: (pct: number) => void
): Promise<{ hash: string; size: number }> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    throw new Error('File does not exist');
  }
  const fileSize = fileInfo.size;
  const hasher = sha256.create();

  // Process in 2MB chunks for lower memory footprint in React Native JS thread
  const chunkSize = 2 * 1024 * 1024;
  let position = 0;

  while (position < fileSize) {
    const length = Math.min(chunkSize, fileSize - position);
    const base64Chunk = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position,
      length,
    });

    const bytes = base64ToBytes(base64Chunk);
    hasher.update(bytes);

    position += length;
    if (onProgress) {
      onProgress(position / fileSize);
    }
  }

  return { hash: hasher.hex(), size: fileSize };
}

