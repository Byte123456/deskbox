import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, BlockPreview } from "../types";
import { desktopItems, busyLock, setBusy } from "../state";
import { showDesktopView } from "../views/desktop-view";
import { pickBlock } from "../components/modal";
import { pushUndo } from "./undo";
import { toast, h } from "../utils";

export async function doCollectItem(path: string): Promise<void> {
  const bid = await pickBlock(); if (bid === null) return;
  try {
    const result = await invoke<any>("collect_item", { path, blockId: bid });
    pushUndo({
      type: "collect_item",
      data: {
        blockId: bid,
        itemId: result.id,
        path,
      },
    });
    toast("已收纳 ✓");
    showDesktopView();
  }
  catch (e) { toast(`失败: ${e}`); }
}

export async function doCollectAll(): Promise<void> {
  if (busyLock || desktopItems.length === 0) { if (!busyLock) toast("没有图标"); return; }
  const bid = await pickBlock(); if (bid === null) return;
  setBusy(true);
  try {
    const r = await invoke<any>("collect_all", { blockId: bid });
    pushUndo({
      type: "collect_all",
      data: {
        blockId: bid,
        count: r.collected,
      },
    });
    toast(`已收纳 ${r.collected}/${r.total} ✓`);
    showDesktopView();
  } catch (e) { toast(`失败: ${e}`); }
  finally { setBusy(false); }
}
