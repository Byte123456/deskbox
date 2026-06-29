import { invoke } from "@tauri-apps/api/core";
import type { BlockPreview } from "../types";
import { blockPreviews, dragState, iconGrid, pathsBar, loadingState } from "../state";
import { showBlockDetail } from "./block-detail";
import { showDesktopView } from "./desktop-view";
import { showSettingsView } from "./settings-view";
import { showCreateBlockModal } from "../components/modal";
import { showBlockCtxMenu } from "../components/context-menu";
import { handleBlockCardDrop } from "../actions/drag-drop";
import { h, e, emoji, getFallbackEmoji, showLoading, hideLoading, showError } from "../utils";

export async function showBlocksView(): Promise<void> {
  (window as any).__view = "blocks";
  showLoading();
  try {
    const previews = await invoke<BlockPreview[]>("get_block_previews");
    blockPreviews.length = 0;
    blockPreviews.push(...previews);
    const total = blockPreviews.reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `${blockPreviews.length} 个方块 | ${total} 个图标
      <span class="clickable" id="nav-desktop">🖥 桌面</span>
      <span class="clickable" id="nav-settings">⚙</span>`;
    renderBlockCards();
    document.getElementById("nav-desktop")!.onclick = showDesktopView;
    document.getElementById("nav-settings")!.onclick = showSettingsView;
  } catch (e) { showError("加载失败", String(e)); }
}

export function renderBlockCards(): void {
  hideLoading();
  iconGrid.innerHTML = blockPreviews.map(b => `
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
    card.addEventListener("dragstart", (e) => { dragState.el = card; card.classList.add("dragging"); (e.dataTransfer!).effectAllowed = "move"; });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragState.el = null; });
    card.addEventListener("dragover", (e) => { e.preventDefault(); });
    card.addEventListener("drop", (e) => { e.preventDefault(); if (dragState.el && dragState.el !== card) handleBlockCardDrop(dragState.el, card); });
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
