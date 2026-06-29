import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, Block } from "../types";
import { toast } from "../utils";

export function openItem(item: DesktopItem): void {
  let target = item.path, args: string | undefined, wd: string | undefined;
  if (item.item_type === "shortcut" && item.lnk_info?.target_path) {
    target = item.lnk_info.target_path;
    args = item.lnk_info.arguments || undefined;
    wd = item.lnk_info.working_dir || undefined;
  } else if (item.item_type === "url" && item.lnk_info?.target_path) {
    target = item.lnk_info.target_path;
  }
  openWith(target, args, wd);
}

export async function openStoredItem(bid: string, iid: string): Promise<void> {
  const allBlocks = await invoke<Block[]>("get_blocks");
  const block = allBlocks.find(b => b.id === bid);
  const item = block?.items.find(i => i.id === iid);
  if (!item) { toast("找不到该物品"); return; }
  let target = item.storage_path, args: string | undefined, wd: string | undefined;
  if (item.item_type === "shortcut" && item.lnk_info?.target_path) {
    target = item.lnk_info.target_path;
    args = item.lnk_info.arguments || undefined;
    wd = item.lnk_info.working_dir || undefined;
  } else if (item.item_type === "url" && item.lnk_info?.target_path) {
    target = item.lnk_info.target_path;
  }
  openWith(target, args, wd);
}

export async function openWith(target: string, args?: string, wd?: string): Promise<void> {
  try { await invoke("open_file", { path: target, args: args || null, workDir: wd || null }); }
  catch (e) { toast(`打开失败: ${e}`); }
}
