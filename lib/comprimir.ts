/**
 * En el navegador: achica las fotos antes de subirlas (una foto de celular pesa 3–6 MB;
 * así queda en ~300–600 KB y la IA la lee igual de bien). Los PDF van tal cual.
 */
export async function prepararArchivo(f: File, lado = 2000): Promise<File> {
  if (!f.type.startsWith("image/")) return f;
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    // Si ya era liviana (y de un formato que la IA acepta), se deja como estaba
    if (!blob || (blob.size >= f.size && ["image/jpeg", "image/png", "image/webp"].includes(f.type))) return f;
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Formato que el navegador no sabe abrir (ej. HEIC en algunos celulares): se manda tal cual
    return f;
  }
}

export const MAX_SUBIDA = 4 * 1024 * 1024;

export const pesoTexto = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
