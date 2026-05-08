export type VpsAction = 'start' | 'stop' | 'status'
export type VpsState = 'starting' | 'stopping' | 'imaging' | 'deleting' | 'done'

export type VpsJob = {
  action: VpsAction
  state: VpsState
  serverId?: string
  imageId?: string
  interactionToken: string
  channelId: string
  enqueuedAt: string
}
