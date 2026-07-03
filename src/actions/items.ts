import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, Block } from "../types";
import { blockState } from "../state";
import { pickBlock } from "../components/modal";
import { showBlockDetail } from "../views/block-detail";
import { pushUndo } from "./undo";
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

export async function doMoveItem(fromBid: string, iid: string): Promise<void> {
  const toBid = await pickBlock(); if (toBid === null || toBid === fromBid) return;
  try {
    const blocks = await invoke<Block[]>("get_blocks");
    const target = blocks.find(b => b.id === toBid);
    const toIndex = target?.items.length ?? 0;
    await invoke("move_item", { fromBlockId: fromBid, itemId: iid, toBlockId: toBid, toIndex });
    pushUndo({ type: "move_item", data: { fromBlockId: fromBid, toBlockId: toBid, itemId: iid, toIndex } });
    toast("已转移 ✓");
    showBlockDetail(fromBid);
  } catch (e) { toast(`转移失败: ${e}`); }
}

export async function doCopyItem(fromBid: string, iid: string): Promise<void> {
  const toBid = await pickBlock(); if (toBid === null) return;
  try {
    await invoke("copy_item", { fromBlockId: fromBid, itemId: iid, toBlockId: toBid });
    toast("已复制 ✓");
    showBlockDetail(fromBid);
  } catch (e) { toast(`复制失败: ${e}`); }
}
