import fs from 'fs/promises';

// TmodFile starts with TMOD, a BinaryWriter string, SHA1, signature and data length.
export async function modHeader(file: string) {
  const fd = await fs.open(file, 'r');
  try {
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(4096), 0, 4096, 0);
    if (buffer.toString('ascii', 0, 4) !== 'TMOD') return null;
    let offset = 4;
    function readString() {
      let length = 0;
      for (let shift = 0; shift < 28 && offset < bytesRead; shift += 7) {
        const byte = buffer[offset++];
        length += (byte & 127) * 2 ** shift;
        if (byte < 128) {
          if (!length || offset + length > bytesRead) break;
          const value = buffer.toString('utf8', offset, offset + length);
          offset += length;
          return value;
        }
      }
      throw new Error('Incomplete mod header');
    }
    const loader = readString();
    offset += 280;
    const name = readString();
    const version = readString();
    return { name, version, loader };
  } catch {
    return null;
  } finally {
    await fd.close();
  }
}
