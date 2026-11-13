import { $ } from './dom.js';
import { state, emit } from './state.js';
import { uploadImage } from './api.js';

const MAX_SIDE = 1600; // longest side in pixels after resizing
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// Shrinks the picked image and turns it into a JPEG. Doing it here keeps uploads small
// and drops hidden details (like where a photo was taken) because only the pixels are kept.
async function shrink(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG or WebP image.');
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is very large. Choose one under 25 MB.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // PNGs with see-through areas get a white background
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not read that image. Try another one.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('That image is still too large after resizing. Try a simpler one.');
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

function clearImage() {
  if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
  state.image = null;
  $('image').value = '';
  $('imageBox').hidden = true;
  $('imageNote').textContent = '';
  emit('image-changed');
}

// Called when the user schedules: uploads the image once and remembers its address.
export async function ensureImageUploaded() {
  if (!state.image) return { ok: true };
  if (state.image.uploadedUrl) return { ok: true };
  const result = await uploadImage(state.image.blob);
  if (result.ok) state.image.uploadedUrl = result.data.url;
  return result;
}

export function initImage() {
  $('image').addEventListener('change', async () => {
    const file = $('image').files[0];
    if (!file) return;
    $('imageNote').textContent = '';
    try {
      const prepared = await shrink(file);
      if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
      state.image = { ...prepared, uploadedUrl: null };
      $('imagePreview').src = prepared.previewUrl;
      $('imageBox').hidden = false;
      emit('image-changed');
    } catch (err) {
      $('imageNote').textContent = err.message;
      $('image').value = '';
    }
  });
  $('imageRemove').addEventListener('click', clearImage);
}
