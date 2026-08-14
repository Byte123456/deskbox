import { invoke } from "@tauri-apps/api/core";
import type { BlockPreview } from "../types";
import { blockPreviews, dragState, iconGrid, pathsBar, loadingState, viewState, recentItems } from "../state";
import { showBlockDetail } from "./block-detail";
import { showDesktopView } from "./desktop-view";
import { showSettingsView } from "./settings-view";
import { showTrashView } from "./trash-view";
import { showCreateBlockModal } from "../components/modal";
import { showBlockCtxMenu } from "../components/context-menu";
import { handleBlockCardDrop } from "../actions/drag-drop";
import { openStoredItem } from "../actions/items";
import { h, e, getFallbackEmoji, showLoading, hideLoading, showError, precomputePinyin } from "../utils";
import { clearSearch } from "../components/search-bar";

export async function showBlocksView(): Promise<void> {
  viewState.current = "blocks";
  clearSearch();
  showLoading();
  try {
    const previews = await invoke<BlockPreview[]>("get_block_previews");
    blockPreviews.length = 0;
    blockPreviews.push(...previews);
    // 预计算拼音，保证输入搜索时不卡顿
    precomputePinyin([...blockPreviews, ...blockPreviews.flatMap(b => b.preview_items)]);
    const total = blockPreviews.reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `${blockPreviews.length} 个方块 | ${total} 个图标
      <span class="clickable" id="nav-desktop">🖥 桌面</span>
      <span class="clickable" id="nav-trash">🗑</span>
      <span class="clickable" id="nav-settings">⚙</span>
      <span style="margin-left:auto;font-size:10px">
        <span class="clickable sort-btn" data-sort="name" data-asc="1">🔤名称</span>
        <span class="clickable sort-btn" data-sort="count" data-asc="0" style="margin-left:4px">📊数量</span>
      </span>`;
    renderBlockCards();
    document.getElementById("nav-desktop")!.onclick = showDesktopView;
    document.getElementById("nav-trash")!.onclick = showTrashView;
    document.getElementById("nav-settings")!.onclick = showSettingsView;
    document.querySelectorAll<HTMLElement>(".sort-btn").forEach(btn => {
      btn.onclick = async () => {
        const sortBy = btn.dataset.sort!;
        const asc = btn.dataset.asc === "1";
        btn.dataset.asc = asc ? "0" : "1";
        await invoke("sort_blocks", { sortBy, ascending: !asc });
        showBlocksView();
      };
    });
  } catch (e) { showError("加载失败", String(e)); }
}

export function renderBlockCards(): void {
  hideLoading();
  let html = "";
  if (recentItems.length > 0) {
    html += `<div style="grid-column:1/-1;display:flex;gap:6px;align-items:center;padding:2px 0;font-size:11px;color:var(--text-secondary)">
      <span>🕐 最近:</span>`;
    for (const r of recentItems) {
      html += `<span class="clickable recent-item" data-bid="${r.blockId}" data-iid="${r.itemId}" style="padding:2px 8px;background:var(--glass-bg);border-radius:10px;border:1px solid var(--glass-border);display:flex;align-items:center;gap:4px;max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
        ${r.icon ? `<img src="${e(r.icon)}" style="width:14px;height:14px">` : ""}
        ${h(r.name)}
      </span>`;
    }
    html += `</div>`;
  }
  iconGrid.innerHTML = html + blockPreviews.map(b => `
    <div class="block-card" data-bid="${b.id}" draggable="true" style="border-left:3px solid ${b.color}">
      <div class="block-card-header">
        <span class="block-card-name">${b.icon} ${h(b.name)}</span>
        <span class="block-card-count">${b.item_count}</span>
      </div>
      <div class="block-card-icons">${renderMiniIconGrid(b.preview_items, b.item_count)}</div>
    </div>`).join("");

  if (blockPreviews.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>还没有方块，先去桌面收纳图标吧</p><button class="btn-secondary" id="btn-goto-desktop">🖥 去桌面</button></div>`;
  }

  iconGrid.innerHTML += `<div class="block-card" id="btn-new-block" style="border:2px dashed var(--glass-border);justify-content:center;align-items:center;opacity:0.6;min-height:110px">
    <span style="font-size:28px">+</span><span style="font-size:11px">新建方块</span></div>`;
  document.getElementById("btn-new-block")!.onclick = showCreateBlockModal;
  const gotoBtn = document.getElementById("btn-goto-desktop"); if (gotoBtn) gotoBtn.onclick = showDesktopView;

  iconGrid.querySelectorAll<HTMLElement>(".block-card[data-bid]").forEach(card => {
    card.onclick = () => showBlockDetail(card.dataset.bid!);
    card.addEventListener("contextmenu", (e) => { e.preventDefault(); showBlockCtxMenu(e.clientX, e.clientY, card.dataset.bid!); });
    card.addEventListener("dragstart", (e) => { dragState.el = card; card.classList.add("dragging"); e.dataTransfer!.effectAllowed = "move"; e.dataTransfer!.setData("text/plain", card.dataset.bid!); });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragState.el = null; });
    card.addEventListener("dragover", (e) => { e.preventDefault(); });
    card.addEventListener("drop", (e) => { e.preventDefault(); if (dragState.el && dragState.el !== card) handleBlockCardDrop(dragState.el, card); });
  });
  iconGrid.querySelectorAll<HTMLElement>(".recent-item").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openStoredItem(el.dataset.bid!, el.dataset.iid!);
    });
  });
}

export function renderMiniIconGrid(preview: { name: string; item_type: string; icon_base64: string | null }[], total: number): string {
  if (total === 0) return `<div class="block-card-empty">空方块</div>`;
  let html = "";
  for (let i = 0; i < 9; i++) {
    if (i < preview.length) {
      const p = preview[i];
      html += p.icon_base64
        ? `<div class="mini-icon"><img src="${e(p.icon_base64)}" alt=""></div>`
        : `<div class="mini-icon"><span class="mini-emoji">${getFallbackEmoji(p.item_type)}</span></div>`;
    } else { html += `<div class="mini-icon"></div>`; }
  }
  if (total > 9) {
    const last = html.lastIndexOf('<div class="mini-icon">');
    html = html.substring(0, last) + `<div class="mini-icon"><span class="mini-count">+${total - 8}</span></div>`;
  }
  return html;
}
