import { invoke } from "@tauri-apps/api/core";
import type { Block } from "../types";
import { blockState, dragState, iconGrid, pathsBar, loadingState } from "../state";
import { showBlocksView } from "./blocks-view";
import { showItemCtxMenu } from "../components/context-menu";
import { showColorPicker } from "../components/color-picker";
import { openStoredItem } from "../actions/items";
import { doRestoreItem, doRestoreAllBlock, doDeleteItem, deleteBlock } from "../actions/blocks";
import { handleBlockItemDrop } from "../actions/drag-drop";
import { h, e, emoji, getFallbackEmoji, showLoading, hideLoading, showError, toast } from "../utils";

export async function showBlockDetail(blockId: string): Promise<void> {
  (window as any).__view = "block-detail";
  showLoading();
  try {
    const blocks = await invoke<Block[]>("get_blocks");
    blockState.current = null;
    const found = blocks.find(b => b.id === blockId) || null;
    if (!found) { showBlocksView(); return; }
    blockState.current = found;
    renderBlockDetail();
  } catch (e) { showError("加载失败", String(e)); }
}

export function renderBlockDetail(): void {
  hideLoading();
  if (!blockState.current || blockState.current.items.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>方块为空</p></div>`; return;
  }
  pathsBar.innerHTML = `<span class="clickable" id="nav-back">← 方块</span> | ${h(blockState.current.name)} (${blockState.current.item_count} 个)
    <span style="margin-left:auto" class="clickable" id="nav-restore-all" style="color:var(--danger)">↩ 全部还原</span>
    <span class="clickable" style="margin-left:8px" id="nav-color-btn">🎨 改色</span>`;
  document.getElementById("nav-back")!.onclick = showBlocksView;
  document.getElementById("nav-restore-all")!.onclick = () => doRestoreAllBlock(blockState.current!.id);
  document.getElementById("nav-color-btn")!.onclick = showColorPicker;

  iconGrid.innerHTML = `
  <div class="block-detail">
    <div class="block-detail-header">
      <span style="color:${blockState.current.color};font-size:18px">${blockState.current.icon}</span>
      <span class="block-detail-name" contenteditable="true" id="block-name-edit">${h(blockState.current.name)}</span>
      <div class="block-detail-actions">
        <button class="btn-mini" title="重命名方块" id="btn-rename-block">✎</button>
        <button class="btn-mini btn-mini-danger" title="删除空方块" id="btn-delete-block">🗑</button>
      </div>
    </div>
    <div class="block-detail-items">
      ${blockState.current.items.map(item => `
        <div class="icon-item stored-item" draggable="true" data-iid="${item.id}">
          ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${getFallbackEmoji(item.item_type)}</div>`}
          <span class="icon-name" contenteditable="true" data-iid="${item.id}" data-field="name">${h(item.name)}</span>
          <div class="item-actions">
            <button class="btn-mini" data-act="open" data-iid="${item.id}">▶</button>
            <button class="btn-mini" data-act="restore" data-iid="${item.id}">↩</button>
            <button class="btn-mini btn-mini-danger" data-act="delete" data-iid="${item.id}">✕</button>
          </div>
        </div>`).join("")}
    </div>
  </div>`;

  // Inline rename block
  const nameEdit = document.getElementById("block-name-edit")!;
  nameEdit.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nameEdit.blur(); } });
  nameEdit.addEventListener("blur", async () => {
    const newName = nameEdit.textContent?.trim();
    if (newName && newName !== blockState.current!.name) {
      try { await invoke("rename_block", { blockId: blockState.current!.id, name: newName }); blockState.current!.name = newName; toast("已重命名 ✓"); }
      catch (err) { toast(`失败: ${err}`); nameEdit.textContent = blockState.current!.name; }
    }
  });
  document.getElementById("btn-rename-block")!.onclick = () => nameEdit.focus();
  document.getElementById("btn-delete-block")!.onclick = () => deleteBlock(blockState.current!.id);

  // Inline rename items
  iconGrid.querySelectorAll<HTMLElement>('.icon-name[contenteditable][data-field="name"]').forEach(el => {
    const iid = el.dataset.iid!;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    el.addEventListener("blur", async () => {
      const newName = el.textContent?.trim();
      const oldItem = blockState.current?.items.find(i => i.id === iid);
      if (newName && oldItem && newName !== oldItem.name) {
        try { await invoke("rename_item", { blockId: blockState.current!.id, itemId: iid, name: newName }); oldItem.name = newName; toast("已重命名 ✓"); }
        catch (err) { toast(`失败: ${err}`); el.textContent = oldItem.name; }
      }
    });
  });

  // Item events
  iconGrid.querySelectorAll<HTMLElement>(".stored-item").forEach(el => {
    el.addEventListener("dblclick", () => openStoredItem(blockState.current!.id, el.dataset.iid!));
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); showItemCtxMenu(e.clientX, e.clientY, blockState.current!.id, el.dataset.iid!); });
    el.addEventListener("dragstart", () => { dragState.el = el; el.classList.add("dragging"); });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragState.el = null; });
    el.addEventListener("dragover", (e) => { e.preventDefault(); });
    el.addEventListener("drop", (e) => { e.preventDefault(); if (dragState.el && dragState.el !== el) handleBlockItemDrop(dragState.el, el); });
  });

  iconGrid.querySelectorAll<HTMLElement>("[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const iid = btn.dataset.iid!;
      if (btn.dataset.act === "open") openStoredItem(blockState.current!.id, iid);
      else if (btn.dataset.act === "restore") doRestoreItem(blockState.current!.id, iid);
      else if (btn.dataset.act === "delete") doDeleteItem(blockState.current!.id, iid);
    });
  });
}
