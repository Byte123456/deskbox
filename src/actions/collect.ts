import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, BlockPreview } from "../types";
import { desktopItems } from "../state";
import { showDesktopView } from "../views/desktop-view";
import { pickBlock } from "../components/modal";
import { toast, h } from "../utils";

export async function doCollectItem(path: string): Promise<void> {
  const bid = await pickBlock(); if (bid === null) return;
  try { await invoke("collect_item", { path, blockId: bid }); toast("已收纳 ✓"); showDesktopView(); }
  catch (e) { toast(`失败: ${e}`); }
}

export async function doCollectAll(): Promise<void> {
  if (desktopItems.length === 0) { toast("没有图标"); return; }
  const bid = await pickBlock(); if (bid === null) return;
  try {
    const r = await invoke<any>("collect_all", { blockId: bid });
    toast(`已收纳 ${r.collected}/${r.total} ✓`);
    showDesktopView();
  } catch (e) { toast(`失败: ${e}`); }
}
