import { invoke } from "@tauri-apps/api/core";
import { dragState, blockPreviews, blockState } from "../state";
import { showBlocksView } from "../views/blocks-view";
import { showBlockDetail } from "../views/block-detail";
import { toast } from "../utils";

export async function handleBlockCardDrop(from: HTMLElement, to: HTMLElement): Promise<void> {
  const fromBid = from.dataset.bid!, toBid = to.dataset.bid!;
  if (fromBid === toBid) return;
  const ids = blockPreviews.map(b => b.id);
  const fromIdx = ids.indexOf(fromBid), toIdx = ids.indexOf(toBid);
  if (fromIdx >= 0 && toIdx >= 0) {
    ids.splice(fromIdx, 1); ids.splice(toIdx, 0, fromBid);
    try { await invoke("reorder_blocks", { blockIds: ids }); showBlocksView(); }
    catch (err) { toast(`排序失败: ${err}`); }
  }
}

export async function handleBlockItemDrop(from: HTMLElement, to: HTMLElement): Promise<void> {
  const fromIid = from.dataset.iid!, toIid = to.dataset.iid!;
  const toIdx = blockState.current!.items.findIndex(i => i.id === toIid);
  try {
    await invoke("move_item", { fromBlockId: blockState.current!.id, itemId: fromIid, toBlockId: blockState.current!.id, toIndex: toIdx });
    showBlockDetail(blockState.current!.id);
  } catch (err) { toast(`移动失败: ${err}`); }
}
