const DISCORD_API_BASE = "https://discord.com/api/v10";

/**
 * Followup メッセージを送信する（Deferred response 後の更新）
 */
export async function sendFollowupMessage(
  applicationId: string,
  interactionToken: string,
  content: string,
  botToken: string,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to send followup message: ${res.status}`);
  }
}

/**
 * Interaction の初期レスポンスを更新する
 */
export async function editOriginalMessage(
  applicationId: string,
  interactionToken: string,
  content: string,
  botToken: string,
): Promise<void> {
  const res = await fetch(
    `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to edit original message: ${res.status}`);
  }
}
