// worker-configuration.d.ts
interface Env {
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_BOT_TOKEN: string
  CONOHA_USERNAME: string
  CONOHA_PASSWORD: string
  CONOHA_TENANT_ID: string
  CONOHA_IDENTITY_ENDPOINT: string
  CONOHA_COMPUTE_ENDPOINT: string
  CONOHA_IMAGE_ENDPOINT: string
  GAME_SERVER_IMAGE_ID: string
  GAME_SERVER_FLAVOR_ID: string
  DISCORD_NOTIFY_CHANNEL_ID: string
  VPS_QUEUE: Queue<import('./src/queue/types').VpsJob>
}
