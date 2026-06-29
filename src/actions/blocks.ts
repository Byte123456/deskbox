import { invoke } from "@tauri-apps/api/core";
import type { Block } from "../types";
import { blockState } from "../state";
import { showBlockDetail } from "../views/block-detail";
import { showBlocksView } from "../views/blocks-view";
import { toast } from "../utils";

export async function doRestoreItem(bid: string, iid: string): Promise<void> {
  try { await invoke("restore_item", { blockId: bid, itemId: iid }); toast("已还原 ✓"); showBlockDetail(bid); }
  catch (e) { toast(`还原失败: ${e}`); }
}

export async function doRestoreAllBlock(bid: string): Promise<void> {
  const block = (await invoke<Block[]>("get_blocks")).find(b => b.id === bid);
  if (!block || block.items.length === 0) { toast("没有可还原的"); return; }
  try { const r = await invoke<any>("restore_block", { blockId: bid }); toast(`已还原 ${r.restored} 个 ✓`); showBlockDetail(bid); }
  catch (e) { toast(`失败: ${e}`); }
}

export async function doDeleteItem(bid: string, iid: string): Promise<void> {
  if (!confirm("永久删除？")) return;
  try { await invoke("delete_stored_item", { blockId: bid, itemId: iid }); toast("已删除"); showBlockDetail(bid); }
  catch (e) { toast(`失败: ${e}`); }
}

export async function deleteBlock(blockId: string): Promise<void> {
  try { await invoke("delete_block", { blockId }); toast("方块已删除 ✓"); showBlocksView(); }
  catch (err) { toast(`删除失败: ${err}`); }
}
