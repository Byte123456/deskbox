import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, BlockPreview } from "../types";
import { desktopItems, firstLaunch, iconGrid, pathsBar, loadingState } from "../state";
import { showDesktopCtxMenu } from "../components/context-menu";
import { doCollectItem, doCollectAll } from "../actions/collect";
import { openItem } from "../actions/items";
import { showBlocksView } from "./blocks-view";
import { clearSearch } from "../components/search-bar";
import { h, e, getFallbackEmoji, showLoading, hideLoading, showError, toast } from "../utils";

async function doAutoOrganize(): Promise<void> {
  if (desktopItems.length === 0) { toast("没有可整理的图标"); return; }
  if (!confirm(`将对 ${desktopItems.length} 个桌面图标进行智能分类，未识别的将保留在桌面。确认？`)) return;
  try {
    const result = await invoke<any>("auto_organize");
    toast(result.message);
    if (result.suggestions?.length) showOrganizeSuggestions(result.suggestions);
    showDesktopView();
  } catch (e) { toast(`整理失败: ${e}`); }
}

function showOrganizeSuggestions(suggestions: any[]): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.zIndex = "350";
  overlay.innerHTML = `<div class="modal" style="width:min(520px,90vw);max-height:75vh;overflow:auto">
    <h3>这些项目没有自动移动</h3>
    <p style="color:var(--text-secondary);font-size:12px">分数不够高或两个分类太接近。你手动收纳一次后，DeskBox 会记住选择。</p>
    ${suggestions.map(s => `<div style="padding:9px 0;border-bottom:1px solid var(--glass-border)">
      <div style="font-weight:600">${h(s.name)}</div>
      <div style="font-size:11px;color:var(--text-secondary)">建议：${h(s.suggested_category || "未知")}${s.alternative_category ? ` / ${h(s.alternative_category)}` : ""} · ${h(s.status)} · 分数 ${s.score}</div>
      <div style="font-size:10px;color:var(--text-secondary)">${h((s.reasons || []).join("；") || "没有可靠识别依据")}</div>
    </div>`).join("")}
    <div class="modal-actions" style="margin-top:10px"><button class="btn-secondary suggestion-close">保留在桌面</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".suggestion-close")!.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

export async function showDesktopView(): Promise<void> {
  (window as any).__view = "desktop";
  clearSearch();
  showLoading();
  try {
    desktopItems.length = 0;
    const items = await invoke<DesktopItem[]>("scan_desktop");
    desktopItems.push(...items);
    const blockCount = (await invoke<BlockPreview[]>("get_block_previews")).reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `桌面: ${desktopItems.length} 个 | 已收纳: ${blockCount} 个
      <span class="clickable" id="nav-blocks">📦 方块</span>
      <span class="clickable" id="nav-auto-organize" style="color:var(--accent)">🤖 自动整理</span>
      <span class="clickable" id="nav-collect-all" style="color:var(--accent)">📥 全部收纳</span>`;
    renderDesktopItems();
    document.getElementById("nav-blocks")!.onclick = showBlocksView;
    document.getElementById("nav-auto-organize")!.onclick = doAutoOrganize;
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
