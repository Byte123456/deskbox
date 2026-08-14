import { invoke } from "@tauri-apps/api/core";
import type { DesktopItem, BlockPreview } from "../types";
import { desktopItems, firstLaunch, iconGrid, pathsBar, loadingState, busyLock, setBusy, viewState, blockPreviews } from "../state";
import { showDesktopCtxMenu } from "../components/context-menu";
import { doCollectItem, doCollectAll } from "../actions/collect";
import { openItem } from "../actions/items";
import { showBlocksView } from "./blocks-view";
import { clearSearch } from "../components/search-bar";
import { h, e, getFallbackEmoji, showLoading, hideLoading, showError, toast, precomputePinyin } from "../utils";

async function doAutoOrganize(): Promise<void> {
  if (busyLock) return;
  if (desktopItems.length === 0) { toast("没有可整理的图标"); return; }
  if (!confirm(`将对 ${desktopItems.length} 个桌面图标进行智能分类，未识别的将保留在桌面。确认？`)) return;
  setBusy(true);
  try {
    const result = await invoke<any>("auto_organize");
    toast(result.message);
    if (result.suggestions?.length) showOrganizeSuggestions(result.suggestions);
    showDesktopView();
  } catch (e) { toast(`整理失败: ${e}`); }
  finally { setBusy(false); }
}

function showOrganizeSuggestions(suggestions: any[]): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.zIndex = "350";
  overlay.innerHTML = `<div class="modal" style="width:min(520px,90vw);max-height:75vh;overflow:auto">
    <h3>这些项目没有自动移动</h3>
    <p style="color:var(--text-secondary);font-size:12px">分数不够高或两个分类太接近。你手动收纳一次后，DeskBox 会记住选择。</p>
    ${suggestions.map((s, i) => `<div style="padding:9px 0;border-bottom:1px solid var(--glass-border)">
      <div style="font-weight:600">${h(s.name)}</div>
      <div style="font-size:11px;color:var(--text-secondary)">建议：${h(s.suggested_category || "未知")}${s.alternative_category ? ` / ${h(s.alternative_category)}` : ""} · ${h(s.status)} · 分数 ${s.score}</div>
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">${h((s.reasons || []).join("；") || "没有可靠识别依据")}</div>
      <button class="btn-secondary" data-force="${i}" style="font-size:11px">强制归入 ${h(s.suggested_category || "建议分类")}</button>
    </div>`).join("")}
    <div class="modal-actions" style="margin-top:10px"><button class="btn-secondary suggestion-close">保留在桌面</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".suggestion-close")!.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelectorAll<HTMLElement>("[data-force]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.force!);
      const s = suggestions[idx];
      btn.textContent = "移动中...";
      (btn as HTMLButtonElement).disabled = true;
      try {
        const desktopItems = await invoke<any[]>("scan_desktop");
        const target = desktopItems.find((d: any) => d.name === s.name);
        if (target) {
          // 强制归入建议分类（找到同名方块，没有则新建）
          let bid: string | null = null;
          const cat = s.suggested_category;
          if (cat) {
            const blocks = await invoke<any[]>("get_block_previews");
            bid = (blocks.find((b: any) => b.name === cat) || {}).id || null;
            if (!bid) {
              const created = await invoke<any>("create_block", { name: cat, color: "#7c8cf8", icon: "📦" });
              bid = created.id;
            }
          }
          await invoke("collect_item", { path: target.path, blockId: bid });
          btn.textContent = "已移动 ✓";
        } else {
          btn.textContent = "未找到";
        }
      } catch { btn.textContent = "失败"; }
      setTimeout(() => overlay.remove(), 500);
    });
  });
}

export async function showDesktopView(): Promise<void> {
  viewState.current = "desktop";
  clearSearch();
  showLoading();
  try {
    desktopItems.length = 0;
    const items = await invoke<DesktopItem[]>("scan_desktop");
    desktopItems.push(...items);
    precomputePinyin(items);
    const previews = await invoke<BlockPreview[]>("get_block_previews");
    blockPreviews.length = 0;
    blockPreviews.push(...previews);
    const blockCount = previews.reduce((s, b) => s + b.item_count, 0);
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
  // 收纳投放区：把桌面图标拖到方块上即收纳
  const dockHtml = blockPreviews.length > 0
    ? `<div class="collect-dock" style="grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:2px 0 8px;border-bottom:1px dashed var(--glass-border);margin-bottom:6px">
         <span style="font-size:11px;color:var(--text-secondary)">📥 拖到方块收纳:</span>
         ${blockPreviews.map(b => `<div class="collect-drop" data-bid="${b.id}" title="收纳到 ${e(b.name)}" style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--glass-bg);border:1px solid var(--glass-border);border-left:3px solid ${b.color};border-radius:10px;cursor:default">
            <span style="font-size:14px">${b.icon}</span><span style="font-size:12px">${h(b.name)}</span><span style="font-size:10px;color:var(--text-secondary)">${b.item_count}</span></div>`).join("")}
       </div>`
    : "";
  iconGrid.innerHTML = dockHtml + desktopItems.map((item, idx) => `
    <div class="icon-item" draggable="true" data-idx="${idx}" data-path="${e(item.path)}" title="${e(item.name)}">
      ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${getFallbackEmoji(item.item_type)}</div>`}
      <span class="icon-name">${h(item.name)}</span>
    </div>`).join("");
  bindDesktopEvents();
  bindCollectDock();
}

function bindDesktopEvents(): void {
  iconGrid.querySelectorAll<HTMLElement>(".icon-item").forEach(el => {
    el.addEventListener("dblclick", () => openItem(desktopItems[parseInt(el.dataset.idx!)]));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showDesktopCtxMenu(e.clientX, e.clientY, desktopItems[parseInt(el.dataset.idx!)], doCollectItem);
    });
    el.addEventListener("dragstart", (e) => {
      const item = desktopItems[parseInt(el.dataset.idx!)];
      e.dataTransfer!.setData("text/plain", item.path);
      e.dataTransfer!.effectAllowed = "copy";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
  });
}

function bindCollectDock(): void {
  iconGrid.querySelectorAll<HTMLElement>(".collect-drop").forEach(drop => {
    const bid = drop.dataset.bid!;
    drop.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = "copy"; drop.classList.add("drag-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      const path = e.dataTransfer!.getData("text/plain");
      if (!path) return;
      try {
        await invoke("collect_item", { path, blockId: bid });
        toast("已收纳 ✓");
        showDesktopView();
      } catch (err) { toast(`收纳失败: ${err}`); }
    });
  });
}
