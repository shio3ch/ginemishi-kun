export type VpsJob =
  | { type: "start"; serverId: string }
  | { type: "stop"; serverId: string };
