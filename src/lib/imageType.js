// Looks at the first bytes of a file to see what it really is (the file name can lie).
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageType(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_START)) return { ext: 'png', mime: 'image/png' };
  return null;
}
