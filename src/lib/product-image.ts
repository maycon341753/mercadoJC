import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-images";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

/** Faz upload da imagem do produto e devolve uma URL assinada de longa duração. */
export async function uploadProductImage(file: File, key?: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${key || crypto.randomUUID()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  const { data, error: se } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS);
  if (se || !data) throw se ?? new Error("Falha ao gerar URL da imagem");
  return data.signedUrl;
}

export type BarcodeLookup = {
  name?: string;
  brand?: string;
  image_url?: string;
  unit?: string;
};

/** Busca dados públicos do produto pelo código de barras (Open Food Facts). */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookup | null> {
  const code = barcode.trim();
  if (!code) return null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_pt,brands,image_front_url,image_url,quantity`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: Record<string, string | undefined>;
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    return {
      name: p['product_name_pt'] || p['product_name'] || undefined,
      brand: p['brands'] || undefined,
      image_url: p['image_front_url'] || p['image_url'] || undefined,
    };
  } catch {
    return null;
  }
}
