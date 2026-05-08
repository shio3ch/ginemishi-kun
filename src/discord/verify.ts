/**
 * Discord Interaction の署名を検証する
 * https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export async function verifyDiscordSignature(
  request: Request,
  publicKey: string,
): Promise<boolean> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return false;
  }

  const body = await request.text();

  const key = await crypto.subtle.importKey(
    "raw",
    hexToUint8Array(publicKey),
    { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
    false,
    ["verify"],
  );

  const isValid = await crypto.subtle.verify(
    "NODE-ED25519",
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + body),
  );

  return isValid;
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
