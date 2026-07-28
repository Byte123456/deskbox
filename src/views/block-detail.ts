import { invoke } from "@tauri-apps/api/core";
import type { Block } from "../types";
import { blockState, dragState, iconGrid, pathsBar, loadingState, batchSelected, viewState } from "../state";
import { showBlocksView } from "./blocks-view";
import { showItemCtxMenu } from "../components/context-menu";
import { showColorPicker } from "../components/color-picker";
import { openStoredItem } from "../actions/items";
import { doRestoreItem, doRestoreAllBlock, moveToTrash, deleteBlock } from "../actions/blocks";
import { handleBlockItemDrop } from "../actions/drag-drop";
import { pushUndo } from "../actions/undo";
import { clearSearch } from "../components/search-bar";
import { h, e, getFallbackEmoji, showLoading, hideLoading, showError, toast } from "../utils";

export async function showBlockDetail(blockId: string): Promise<void> {
  viewState.current = "block-detail";
  clearSearch();
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
    <div id="batch-toolbar" style="display:none;gap:6px;padding:4px 0;font-size:11px">
      <span id="batch-count"></span>
      <button class="btn-mini btn-mini-danger" id="btn-batch-trash">🗑 批量回收</button>
      <button class="btn-mini" id="btn-batch-restore">↩ 批量还原</button>
      <span class="clickable" id="btn-batch-clear" style="color:var(--text-secondary)">取消选择</span>
    </div>
    <div class="restore-zone" id="restore-zone" style="display:none;text-align:center;padding:8px;border:2px dashed var(--danger);border-radius:8px;color:var(--danger);font-size:12px;margin:2px 0">↩ 拖到这里还原</div>
    <div class="block-detail-items">
      ${blockState.current.items.map(item => `
        <div class="icon-item stored-item" draggable="true" data-iid="${item.id}">
          ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${getFallbackEmoji(item.item_type)}</div>`}
          <span class="icon-name" contenteditable="true" data-iid="${item.id}" data-field="name">${h(item.name)}</span>
          <div class="item-actions">
            <button class="btn-mini" data-act="open" data-iid="${item.id}">▶</button>
            <button class="btn-mini" data-act="restore" data-iid="${item.id}">↩</button>
            <button class="btn-mini btn-mini-danger" data-act="trash" data-iid="${item.id}">🗑</button>
          </div>
        </div>`).join("")}
    </div>
  </div>`;

  // Inline rename block
  const nameEdit = document.getElementById("block-name-edit")!;
  const oldBlockName = blockState.current!.name;
  nameEdit.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nameEdit.blur(); } });
  nameEdit.addEventListener("blur", async () => {
    const newName = nameEdit.textContent?.trim();
    if (newName && newName !== blockState.current!.name) {
      try {
        await invoke("rename_block", { blockId: blockState.current!.id, name: newName });
        // 记录撤销操作
        pushUndo({
          type: "rename_block",
          data: {
            blockId: blockState.current!.id,
            oldName: oldBlockName,
            newName: newName,
          },
        });
        blockState.current!.name = newName;
        toast("已重命名 ✓");
      }
      catch (err) { toast(`失败: ${err}`); nameEdit.textContent = blockState.current!.name; }
    }
  });
  document.getElementById("btn-rename-block")!.onclick = () => nameEdit.focus();
  document.getElementById("btn-delete-block")!.onclick = () => deleteBlock(blockState.current!.id);

  // Inline rename items
  iconGrid.querySelectorAll<HTMLElement>('.icon-name[contenteditable][data-field="name"]').forEach(el => {
    const iid = el.dataset.iid!;
    const oldItem = blockState.current?.items.find(i => i.id === iid);
    const oldName = oldItem?.name || "";
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    el.addEventListener("blur", async () => {
      const newName = el.textContent?.trim();
      const item = blockState.current?.items.find(i => i.id === iid);
      if (newName && item && newName !== item.name) {
        try {
          await invoke("rename_item", { blockId: blockState.current!.id, itemId: iid, name: newName });
          // 记录撤销操作
          pushUndo({
            type: "rename_item",
            data: {
              blockId: blockState.current!.id,
              itemId: iid,
              oldName: oldName,
              newName: newName,
            },
          });
          item.name = newName;
          toast("已重命名 ✓");
        }
        catch (err) { toast(`失败: ${err}`); el.textContent = item.name; }
      }
    });
  });

  // Item events
  let lastClickedIdx = -1;
  const items = iconGrid.querySelectorAll<HTMLElement>(".stored-item");
  const restoreZone = document.getElementById("restore-zone")!;

  items.forEach((el, idx) => {
    const iid = el.dataset.iid!;
    el.addEventListener("click", (e) => {
      if (e.ctrlKey) {
        if (batchSelected.has(iid)) batchSelected.delete(iid); else batchSelected.add(iid);
      } else if (e.shiftKey && lastClickedIdx >= 0) {
        const [a, b] = [Math.min(lastClickedIdx, idx), Math.max(lastClickedIdx, idx)];
        items.forEach((el2, j) => { if (j >= a && j <= b) batchSelected.add(el2.dataset.iid!); });
      } else {
        batchSelected.clear();
      }
      lastClickedIdx = idx;
      updateSelectionUI();
    });
    el.addEventListener("dblclick", () => openStoredItem(blockState.current!.id, iid));
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); showItemCtxMenu(e.clientX, e.clientY, blockState.current!.id, iid); });
    el.addEventListener("dragstart", () => { dragState.el = el; el.classList.add("dragging"); restoreZone.style.display = "block"; });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragState.el = null; restoreZone.style.display = "none"; });
    el.addEventListener("dragover", (e) => { e.preventDefault(); });
    el.addEventListener("drop", (e) => { e.preventDefault(); if (dragState.el && dragState.el !== el) handleBlockItemDrop(dragState.el, el); });
  });

  restoreZone.addEventListener("dragover", (e) => { e.preventDefault(); });
  restoreZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dragState.el) {
      const iid = dragState.el.dataset.iid!;
      doRestoreItem(blockState.current!.id, iid);
    }
    restoreZone.style.display = "none";
  });

  iconGrid.querySelectorAll<HTMLElement>("[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const iid = btn.dataset.iid!;
      if (btn.dataset.act === "open") openStoredItem(blockState.current!.id, iid);
      else if (btn.dataset.act === "restore") doRestoreItem(blockState.current!.id, iid);
      else if (btn.dataset.act === "trash") moveToTrash(blockState.current!.id, iid);
    });
  });

  // Batch toolbar handlers
  const batchBar = document.getElementById("batch-toolbar")!;
  document.getElementById("btn-batch-trash")!.onclick = async () => {
    if (!confirm(`将 ${batchSelected.size} 个图标移入回收站？`)) return;
    const ids = [...batchSelected];
    for (const iid of ids) {
      await moveToTrash(blockState.current!.id, iid);
    }
    batchSelected.clear();
    showBlockDetail(blockState.current!.id);
  };
  document.getElementById("btn-batch-restore")!.onclick = async () => {
    if (!confirm(`还原 ${batchSelected.size} 个图标？`)) return;
    const ids = [...batchSelected];
    for (const iid of ids) {
      await doRestoreItem(blockState.current!.id, iid);
    }
    batchSelected.clear();
    showBlockDetail(blockState.current!.id);
  };
  document.getElementById("btn-batch-clear")!.onclick = () => { batchSelected.clear(); updateSelectionUI(); };
  updateSelectionUI();
}

export function updateSelectionUI(): void {
  const batchBar = document.getElementById("batch-toolbar");
  const batchCnt = document.getElementById("batch-count");
  if (!batchBar || !batchCnt) return;
  if (batchSelected.size > 0) {
    batchBar.style.display = "flex";
    batchCnt.textContent = `已选 ${batchSelected.size} 个`;
  } else {
    batchBar.style.display = "none";
  }
  document.querySelectorAll<HTMLElement>(".stored-item").forEach(el => {
    el.classList.toggle("selected", batchSelected.has(el.dataset.iid!));
  });
}
