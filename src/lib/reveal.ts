import { invoke } from "@tauri-apps/api/core";

export function revealScopedItem(path: string): Promise<void> {
  return invoke("reveal_scoped_item", { path });
}
