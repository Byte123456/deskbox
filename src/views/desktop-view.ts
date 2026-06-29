import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, BlockPreview } from "../types";
import { desktopItems, firstLaunch, iconGrid, pathsBar, loadingState } from "../state";
import { showDesktopCtxMenu } from "../components/context-menu";
import { doCollectItem, doCollectAll } from "../actions/collect";
import { openItem } from "../actions/items";
import { showBlocksView } from "./blocks-view";
import { h, e, emoji, getFallbackEmoji, showLoading, hideLoading, showError, toast } from "../utils";

export async function showDesktopView(): Promise<void> {
  (window as any).__view = "desktop";
  showLoading();
  try {
    desktopItems.length = 0;
    const items = await invoke<DesktopItem[]>("scan_desktop");
    desktopItems.push(...items);
    const blockCount = (await invoke<BlockPreview[]>("get_block_previews")).reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `桌面: ${desktopItems.length} 个 | 已收纳: ${blockCount} 个
      <span class="clickable" id="nav-blocks">📦 方块</span>
      <span class="clickable" id="nav-collect-all" style="color:var(--accent)">📥 全部收纳</span>`;
    renderDesktopItems();
    document.getElementById("nav-blocks")!.onclick = showBlocksView;
    document.getElementById("nav-collect-all")!.onclick = doCollectAll;
    if (firstLaunch && desktopItems.length > 0) {
      toast(`检测到 ${desktopItems.length} 个桌面图标，点击 📥 一键收纳`);
    }
  } catch (e) { showError("扫描失败", String(e)); }
}

export function renderDesktopItems(): void {
  hideLoading();
  if (desktopItems.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><p>桌面空空如也</p></div>`; return;
  }
  iconGrid.innerHTML = desktopItems.map((item, idx) => `
    <div class="icon-item" data-idx="${idx}" data-path="${e(item.path)}" title="${e(item.name)}">
      ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${getFallbackEmoji(item.item_type)}</div>`}
      <span class="icon-name">${h(item.name)}</span>
    </div>`).join("");
  bindDesktopEvents();
}

function bindDesktopEvents(): void {
  iconGrid.querySelectorAll<HTMLElement>(".icon-item").forEach(el => {
    el.addEventListener("dblclick", () => openItem(desktopItems[parseInt(el.dataset.idx!)]));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showDesktopCtxMenu(e.clientX, e.clientY, desktopItems[parseInt(el.dataset.idx!)], doCollectItem);
    });
  });
}
