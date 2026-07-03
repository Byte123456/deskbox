import { invoke } from "@tauri-apps/api/core";
import type { TrashItem } from "../types";
import { trashItems, iconGrid, pathsBar, loadingState } from "../state";
import { showBlocksView } from "./blocks-view";
import { h, e, getFallbackEmoji, showLoading, hideLoading, showError, toast } from "../utils";

export async function showTrashView(): Promise<void> {
  (window as any).__view = "trash";
  showLoading();
  try {
    trashItems.length = 0;
    const items = await invoke<TrashItem[]>("get_trash_items");
    trashItems.push(...items);
    pathsBar.innerHTML = `🗑 回收站: ${trashItems.length} 个
      <span class="clickable" id="nav-back">← 返回</span>
      ${trashItems.length > 0 ? `<span class="clickable" id="nav-empty" style="color:var(--danger)">清空回收站</span>` : ""}`;
    renderTrashItems();
    document.getElementById("nav-back")!.onclick = showBlocksView;
    const emptyBtn = document.getElementById("nav-empty");
    if (emptyBtn) emptyBtn.onclick = doEmptyTrash;
  } catch (e) { showError("加载失败", String(e)); }
}

function renderTrashItems(): void {
  hideLoading();
  if (trashItems.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><p>回收站为空</p></div>`; return;
  }
  iconGrid.innerHTML = trashItems.map(item => `
    <div class="trash-item" data-iid="${item.id}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:10px;margin:2px 0">
      ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}" style="width:24px;height:24px">` : `<span style="font-size:18px">${getFallbackEmoji(item.item_type)}</span>`}
      <span style="flex:1;font-size:13px">${h(item.name)}</span>
      <button class="btn-mini" data-act="restore" data-iid="${item.id}">↩ 恢复</button>
      <button class="btn-mini btn-mini-danger" data-act="delete" data-iid="${item.id}">✕ 彻底删除</button>
    </div>`).join("");

  iconGrid.querySelectorAll<HTMLElement>("[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const iid = btn.dataset.iid!;
      if (btn.dataset.act === "restore") doRestoreTrashItem(iid);
      else if (btn.dataset.act === "delete") doDeleteTrashItem(iid);
    });
  });
}

async function doRestoreTrashItem(iid: string): Promise<void> {
  try {
    await invoke("restore_trash_item", { itemId: iid });
    toast("已恢复 ✓");
    showTrashView();
  } catch (e) { toast(`恢复失败: ${e}`); }
}

async function doDeleteTrashItem(iid: string): Promise<void> {
  if (!confirm("彻底删除不可恢复，确定？")) return;
  try {
    await invoke("delete_trash_item", { itemId: iid });
    toast("已彻底删除");
    showTrashView();
  } catch (e) { toast(`删除失败: ${e}`); }
}

async function doEmptyTrash(): Promise<void> {
  if (!confirm("清空回收站将永久删除所有内容，确定？")) return;
  try {
    await invoke("empty_trash");
    toast("回收站已清空 ✓");
    showTrashView();
  } catch (e) { toast(`清空失败: ${e}`); }
}