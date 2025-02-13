import sharp from "sharp";
export const processImage = async (buffer) => {
  // Add image compression/optimization logic
  const processedBuffer = await sharp(buffer)
    .webp({ quality: 80 }) // Compress and convert to WebP
    .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  return processedBuffer;
};
