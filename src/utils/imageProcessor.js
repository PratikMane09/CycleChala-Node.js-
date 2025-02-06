import sharp from "sharp";

export const processImage = async (buffer) => {
  return sharp(buffer)
    .webp({ quality: 80 })
    .resize(1024, 1024, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
};
