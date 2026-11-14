import { $ } from './dom.js';
import { state, emit, imageFor } from './state.js';
import { uploadImage } from './api.js';

const MAX_SIDE = 1600; // longest side in pixels after resizing
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// Shrinks the picked image and turns it into a JPEG. Doing it here keeps uploads small
// and drops hidden details (like where a photo was taken) because only the pixels are kept.
export async function shrink(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Please choose a JPG, PNG or WebP image.');
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is too big. Please choose one under 25 MB.');

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
  if (!blob) throw new Error('We couldn’t read that image. Try another one.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('That image is still too big after resizing. Try a simpler one.');
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

// Called when the user schedules: uploads each image that is needed once and remembers
// its address, so the cover image shared by several posts is only uploaded one time.
export async function ensureImagesUploaded(posts) {
  const needed = new Set(posts.map(imageFor).filter(Boolean));
  for (const img of needed) {
    if (img.uploadedUrl) continue;
    const result = await uploadImage(img.blob);
    if (!result.ok) return result;
    img.uploadedUrl = result.data.url;
  }
  return { ok: true };
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