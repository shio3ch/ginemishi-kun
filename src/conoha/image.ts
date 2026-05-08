import { getToken } from "./auth";

export interface ImageDetail {
  id: string;
  name: string;
  status: string;
}

/**
 * イメージ一覧を取得する
 */
export async function listImages(env: Env): Promise<ImageDetail[]> {
  const token = await getToken(env);
  const res = await fetch(`${env.CONOHA_IMAGE_ENDPOINT}/images`, {
    headers: { "X-Auth-Token": token.id },
  });

  if (!res.ok) {
    throw new Error(`Failed to list images: ${res.status}`);
  }

  const data = (await res.json()) as { images: ImageDetail[] };
  return data.images;
}

/**
 * イメージの詳細を取得する
 */
export async function getImage(env: Env, imageId: string): Promise<ImageDetail> {
  const token = await getToken(env);
  const res = await fetch(`${env.CONOHA_IMAGE_ENDPOINT}/images/${imageId}`, {
    headers: { "X-Auth-Token": token.id },
  });

  if (!res.ok) {
    throw new Error(`Failed to get image: ${res.status}`);
  }

  return res.json() as Promise<ImageDetail>;
}
