import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ---- Types ----
interface LnkInfo { target_path: string; arguments: string; working_dir: string; description: string; icon_location: string; icon_index: number; }
interface DesktopItem { name: string; path: string; item_type: string; lnk_info: LnkInfo | null; icon_base64: string | null; }
interface BlockItem { id: string; name: string; item_type: string; original_path: string; storage_path: string; lnk_info: LnkInfo | null; icon_base64: string | null; collected_at: string; }
interface Block { id: string; name: string; color: string; icon: string; item_count: number; items: BlockItem[]; }
interface BlockPreview { id: string; name: string; color: string; icon: string; item_count: number; preview_items: { name: string; item_type: string; icon_base64: string | null }[]; }

// ---- State ----
let desktopItems: DesktopItem[] = [];
let blockPreviews: BlockPreview[] = [];
let currentBlock: Block | null = null;
let view: "blocks" | "desktop" | "block-detail" | "settings" = "blocks";
let firstLaunch = false;

// ---- DOM helpers ----
const $ = (id: string) => document.getElementById(id)!;
const iconGrid = $("icon-grid");
const pathsBar = $("paths-bar");
const loadingState = $("loading-state");

// ---- Views ----
async function showBlocksView() {
  view = "blocks"; showLoading();
  try {
    blockPreviews = await invoke<BlockPreview[]>("get_block_previews");
    const total = blockPreviews.reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `${blockPreviews.length} 个方块 | ${total} 个图标
      <span class="clickable" id="nav-desktop">🖥 桌面</span>
      <span class="clickable" id="nav-settings">⚙</span>`;
    renderBlockCards();
    $("nav-desktop").onclick = showDesktopView;
    $("nav-settings").onclick = showSettingsView;
  } catch (e) { showError("加载失败", String(e)); }
}

async function showDesktopView() {
  view = "desktop"; showLoading();
  try {
    desktopItems = await invoke<DesktopItem[]>("scan_desktop");
    const blockCount = (await invoke<BlockPreview[]>("get_block_previews")).reduce((s, b) => s + b.item_count, 0);
    pathsBar.innerHTML = `桌面: ${desktopItems.length} 个 | 已收纳: ${blockCount} 个
      <span class="clickable" id="nav-blocks">📦 方块</span>
      <span class="clickable" id="nav-collect-all" style="color:var(--accent)">📥 全部收纳</span>`;
    renderDesktopItems();
    $("nav-blocks").onclick = showBlocksView;
    $("nav-collect-all").onclick = doCollectAll;

    // First launch prompt
    if (firstLaunch && desktopItems.length > 0) {
      toast(`检测到 ${desktopItems.length} 个桌面图标，点击 📥 一键收纳`);
      firstLaunch = false;
    }
  } catch (e) { showError("扫描失败", String(e)); }
}

async function showBlockDetail(blockId: string) {
  view = "block-detail"; showLoading();
  try {
    const blocks = await invoke<Block[]>("get_blocks");
    currentBlock = blocks.find(b => b.id === blockId) || null;
    if (!currentBlock) { showBlocksView(); return; }
    renderBlockDetail();
  } catch (e) { showError("加载失败", String(e)); }
}

async function showSettingsView() {
  view = "settings"; hideLoading();
  const s = await invoke<any>("get_settings");
  const icons = await invoke<any[]>("get_system_icons_state");
  pathsBar.innerHTML = `<span class="clickable" id="nav-back2">← 返回</span> | ⚙ 设置`;
  $("nav-back2").onclick = showBlocksView;

  iconGrid.innerHTML = `
  <div class="block-detail">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">🔤 全局热键</div>
    <div class="hotkey-recorder" id="hotkey-recorder" tabindex="0">
      <span id="hotkey-display">${h(s.hotkey||'Alt+Shift+D')}</span>
      <span id="hotkey-hint" style="font-size:10px;color:var(--text-secondary)">点击录制新热键</span>
    </div>
    <button class="btn-secondary" id="btn-apply-hotkey" style="display:none;margin-top:6px">应用热键</button>

    <div style="font-weight:700;font-size:14px;margin:12px 0 4px">🖥 系统桌面图标</div>
    ${icons.map((ic: any) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;margin:2px 0">
      <span style="font-size:12px">${h(ic.name)}</span>
      <label class="toggle"><input type="checkbox" class="sys-toggle" data-key="${ic.key}" ${ic.visible?'checked':''}><span class="toggle-slider"></span></label>
    </div>`).join('')}

    <div style="font-weight:700;font-size:14px;margin:12px 0 4px">⚡ 通用</div>
    ${['autostart','animations','ontop'].map(k => {
      const label = k==='autostart'?'开机自启':k==='animations'?'动画效果':'窗口置顶';
      const ck = k==='autostart'?s.autostart:k==='animations'?s.animations:s.always_on_top;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;margin:2px 0">
        <span style="font-size:12px">${label}</span>
        <label class="toggle"><input type="checkbox" class="gen-toggle" data-key="${k}" ${ck?'checked':''}><span class="toggle-slider"></span></label></div>`;
    }).join('')}
  </div>`;

  // Hotkey recorder
  let rec = false, captured = "";
  const recorder = $("hotkey-recorder"), display = $("hotkey-display"), hint = $("hotkey-hint");
  recorder.onclick = () => { rec = true; hint.textContent = "按下组合键..."; display.textContent = "..."; captured = ""; };
  recorder.onkeydown = (e) => {
    if (!rec) return; e.preventDefault();
    const p: string[] = [];
    if (e.altKey) p.push("Alt"); if (e.ctrlKey) p.push("Ctrl");
    if (e.shiftKey) p.push("Shift"); if (e.metaKey) p.push("Win");
    if (!["Alt","Control","Shift","Meta"].includes(e.key)) p.push(e.key===" "?"Space":e.key.length===1?e.key.toUpperCase():e.key);
    captured = p.join("+"); display.textContent = captured;
  };
  recorder.onkeyup = () => { if (!rec) return; rec = false; hint.textContent = "点击重新录制"; $("btn-apply-hotkey").style.display = "block"; };
  $("btn-apply-hotkey").onclick = async () => {
    try { await invoke("change_hotkey", { hotkeyStr: captured }); toast("热键已更新 ✓"); } catch (err) { toast(`热键冲突: ${err}`); }
  };

  // Toggles
  document.querySelectorAll<HTMLInputElement>(".sys-toggle").forEach(t => {
    t.onchange = async () => {
      try { await invoke("set_system_icon_visibility", { key: t.dataset.key!, visible: t.checked }); toast("已更新 ✓"); } catch(e) { toast(`失败: ${e}`); t.checked = !t.checked; }
    };
  });
  document.querySelectorAll<HTMLInputElement>(".gen-toggle").forEach(t => {
    t.onchange = async () => {
      const checked = t.checked;
      const key = t.dataset.key!;
      const sk = key==="ontop"?"always_on_top":key;
      await invoke("save_settings", { settings: { [sk]: checked } });
      if (key === "ontop") { await invoke("set_always_on_top", { on: checked }); }
      if (key === "autostart") { await invoke("set_autostart", { enable: checked }); }
      toast("已保存 ✓");
    };
  });
}

// ---- Render ----
function renderBlockCards() {
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
  $("btn-new-block").onclick = showCreateBlockModal;
  const gotoBtn = $("btn-goto-desktop"); if (gotoBtn) gotoBtn.onclick = showDesktopView;

  // Click to open
  iconGrid.querySelectorAll<HTMLElement>(".block-card[data-bid]").forEach(card => {
    card.onclick = () => showBlockDetail(card.dataset.bid!);
    card.addEventListener("contextmenu", (e) => { e.preventDefault(); showBlockCtxMenu(e.clientX, e.clientY, card.dataset.bid!); });
    // Drag to reorder
    card.addEventListener("dragstart", (e) => { dragEl = card; card.classList.add("dragging"); (e.dataTransfer!).effectAllowed = "move"; });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragEl = null; });
    card.addEventListener("dragover", (e) => { e.preventDefault(); });
    card.addEventListener("drop", (e) => { e.preventDefault(); if (dragEl && dragEl !== card) handleBlockCardDrop(dragEl, card); });
  });
}

function renderMiniIconGrid(preview: { name: string; item_type: string; icon_base64: string | null }[], total: number): string {
  if (total === 0) return `<div class="block-card-empty">空方块</div>`;
  let html = "";
  for (let i = 0; i < 9; i++) {
    if (i < preview.length) {
      const p = preview[i];
      html += p.icon_base64
        ? `<div class="mini-icon"><img src="${e(p.icon_base64)}" alt=""></div>`
        : `<div class="mini-icon"><span class="mini-emoji">${emoji(p.item_type)}</span></div>`;
    } else { html += `<div class="mini-icon"></div>`; }
  }
  if (total > 9) {
    const lastIcon = html.lastIndexOf('<div class="mini-icon">');
    html = html.substring(0, lastIcon) + `<div class="mini-icon"><span class="mini-count">+${total - 8}</span></div>`;
  }
  return html;
}

function renderDesktopItems() {
  hideLoading();
  if (desktopItems.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">✨</div><p>桌面空空如也</p></div>`; return;
  }
  iconGrid.innerHTML = desktopItems.map((item, idx) => `
    <div class="icon-item" data-idx="${idx}" data-path="${e(item.path)}" title="${e(item.name)}">
      ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${emoji(item.item_type)}</div>`}
      <span class="icon-name">${h(item.name)}</span>
    </div>`).join("");
  bindDesktopEvents();
}

function renderBlockDetail() {
  hideLoading();
  if (!currentBlock || currentBlock.items.length === 0) {
    iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>方块为空</p></div>`; return;
  }
  pathsBar.innerHTML = `<span class="clickable" id="nav-back">← 方块</span> | ${h(currentBlock.name)} (${currentBlock.item_count} 个)
    <span style="margin-left:auto" class="clickable" id="nav-restore-all" style="color:var(--danger)">↩ 全部还原</span>
    <span class="clickable" style="margin-left:8px" id="nav-color-btn">🎨 改色</span>`;
  $("nav-back").onclick = showBlocksView;
  $("nav-restore-all").onclick = () => doRestoreAllBlock(currentBlock!.id);
  $("nav-color-btn").onclick = showColorPicker;

  iconGrid.innerHTML = `
  <div class="block-detail">
    <div class="block-detail-header">
      <span style="color:${currentBlock.color};font-size:18px">${currentBlock.icon}</span>
      <span class="block-detail-name" contenteditable="true" id="block-name-edit">${h(currentBlock.name)}</span>
      <div class="block-detail-actions">
        <button class="btn-mini" title="重命名方块" id="btn-rename-block">✎</button>
        <button class="btn-mini btn-mini-danger" title="删除空方块" id="btn-delete-block">🗑</button>
      </div>
    </div>
    <div class="block-detail-items">
      ${currentBlock.items.map(item => `
        <div class="icon-item stored-item" draggable="true" data-iid="${item.id}">
          ${item.icon_base64 ? `<img class="icon-img" src="${e(item.icon_base64)}">` : `<div class="icon-fallback">${emoji(item.item_type)}</div>`}
          <span class="icon-name" contenteditable="true" data-iid="${item.id}" data-field="name">${h(item.name)}</span>
          <div class="item-actions">
            <button class="btn-mini" data-act="open" data-iid="${item.id}">▶</button>
            <button class="btn-mini" data-act="restore" data-iid="${item.id}">↩</button>
            <button class="btn-mini btn-mini-danger" data-act="delete" data-iid="${item.id}">✕</button>
          </div>
        </div>`).join("")}
    </div>
  </div>`;

  // Inline rename for block name
  const nameEdit = $("block-name-edit");
  nameEdit.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nameEdit.blur(); } });
  nameEdit.addEventListener("blur", async () => {
    const newName = nameEdit.textContent?.trim();
    if (newName && newName !== currentBlock!.name) {
      try { await invoke("rename_block", { blockId: currentBlock!.id, name: newName }); currentBlock!.name = newName; toast("已重命名 ✓"); }
      catch (err) { toast(`失败: ${err}`); nameEdit.textContent = currentBlock!.name; }
    }
  });
  $("btn-rename-block").onclick = () => nameEdit.focus();

  // Inline rename for items
  iconGrid.querySelectorAll<HTMLElement>('.icon-name[contenteditable][data-field="name"]').forEach(el => {
    const iid = el.dataset.iid!;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    el.addEventListener("blur", async () => {
      const newName = el.textContent?.trim();
      const oldItem = currentBlock?.items.find(i => i.id === iid);
      if (newName && oldItem && newName !== oldItem.name) {
        try { await invoke("rename_item", { blockId: currentBlock!.id, itemId: iid, name: newName }); oldItem.name = newName; toast("已重命名 ✓"); }
        catch (err) { toast(`失败: ${err}`); el.textContent = oldItem.name; }
      }
    });
  });

  $("btn-delete-block").onclick = () => deleteBlock(currentBlock!.id);

  // Item actions + double-click
  iconGrid.querySelectorAll<HTMLElement>(".stored-item").forEach(el => {
    el.addEventListener("dblclick", () => { openStoredItem(currentBlock!.id, el.dataset.iid!); });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); showItemCtxMenu(e.clientX, e.clientY, currentBlock!.id, el.dataset.iid!); });
    // Drag
    el.addEventListener("dragstart", () => { dragEl = el; el.classList.add("dragging"); });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); dragEl = null; });
    el.addEventListener("dragover", (e) => { e.preventDefault(); });
    el.addEventListener("drop", (e) => { e.preventDefault(); if (dragEl && dragEl !== el) handleBlockItemDrop(dragEl, el); });
  });

  iconGrid.querySelectorAll<HTMLElement>("[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const iid = btn.dataset.iid!;
      if (btn.dataset.act === "open") openStoredItem(currentBlock!.id, iid);
      else if (btn.dataset.act === "restore") doRestoreItem(currentBlock!.id, iid);
      else if (btn.dataset.act === "delete") doDeleteItem(currentBlock!.id, iid);
    });
  });
}

// ---- Color picker ----
function showColorPicker() {
  const COLORS = ["#7c8cf8","#f87070","#70d6a0","#f0c040","#c070f0","#40c0e0","#f09060","#80c040"];
  dmCtx(() => {
    const html = `<div style="font-weight:600;padding:6px 14px;font-size:12px">方块颜色</div>
      ${COLORS.map(c => `<div class="ctx-item" data-color="${c}" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c}"></span>${c}</div>`).join("")}`;
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.position = "fixed";
    menu.style.right = "20px";
    menu.style.top = "50px";
    menu.style.zIndex = "300";
    menu.innerHTML = html;
    document.body.appendChild(menu);

    menu.querySelectorAll<HTMLElement>("[data-color]").forEach(el => {
      el.onclick = async () => {
        const color = el.dataset.color!;
        try { await invoke("set_block_color", { blockId: currentBlock!.id, color }); currentBlock!.color = color; toast("颜色已更新 ✓"); }
        catch (err) { toast(`失败: ${err}`); }
        menu.remove();
      };
      el.onmouseenter = () => el.style.background = "var(--glass-hover)";
      el.onmouseleave = () => el.style.background = "";
    });
    setTimeout(() => {
      const close = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); } };
      document.addEventListener("click", close);
    }, 0);
  });
}

// ---- Drag & Drop ----
let dragEl: HTMLElement | null = null;

function bindDesktopEvents() {
  iconGrid.querySelectorAll<HTMLElement>(".icon-item").forEach(el => {
    el.addEventListener("dblclick", () => openItem(desktopItems[parseInt(el.dataset.idx!)]));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const item = desktopItems[parseInt(el.dataset.idx!)];
      dmCtx(() => {
        const html = `<div class="ctx-item" data-act="open">▶ 打开</div>
          <div class="ctx-item" data-act="collect">📥 收纳</div>
          <div class="ctx-item" data-act="locate">📂 打开文件位置</div>`;
        const menu = showMenu(e.clientX, e.clientY, html);
        menu.querySelector("[data-act=open]")!.addEventListener("click", () => { openItem(item); menu.remove(); });
        menu.querySelector("[data-act=collect]")!.addEventListener("click", () => { doCollectItem(item.path); menu.remove(); });
        menu.querySelector("[data-act=locate]")!.addEventListener("click", () => { openWith(item.path.replace(/\\[^\\]*$/, "")); menu.remove(); });
      });
    });
  });
}

async function handleBlockCardDrop(from: HTMLElement, to: HTMLElement) {
  const fromBid = from.dataset.bid!, toBid = to.dataset.bid!;
  if (fromBid === toBid) return;
  // Reorder blocks
  const ids = blockPreviews.map(b => b.id);
  const fromIdx = ids.indexOf(fromBid);
  const toIdx = ids.indexOf(toBid);
  if (fromIdx >= 0 && toIdx >= 0) {
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromBid);
    try { await invoke("reorder_blocks", { blockIds: ids }); showBlocksView(); } catch (err) { toast(`排序失败: ${err}`); }
  }
}

async function handleBlockItemDrop(from: HTMLElement, to: HTMLElement) {
  const fromIid = from.dataset.iid!, toIid = to.dataset.iid!;
  const toIdx = currentBlock!.items.findIndex(i => i.id === toIid);
  try {
    await invoke("move_item", { fromBlockId: currentBlock!.id, itemId: fromIid, toBlockId: currentBlock!.id, toIndex: toIdx });
    showBlockDetail(currentBlock!.id);
  } catch (err) { toast(`移动失败: ${err}`); }
}

// ---- Block CRUD ----
const COLORS = ["#7c8cf8","#f87070","#70d6a0","#f0c040","#c070f0","#40c0e0","#f09060","#80c040"];
const ICONS = ["📦","🎮","📚","💼","🎵","🌐","🔧","⚙","📁","💡","🎨","📊"];

function showCreateBlockModal() {
  const mo = $("modal-overlay");
  mo.style.display = "flex";
  ($("modal-name") as HTMLInputElement).value = "";
  $("modal-name").focus();
  let selColor = COLORS[0], selIcon = ICONS[0];

  $("modal-colors").innerHTML = COLORS.map(c => `<div class="modal-color${c===selColor?' selected':''}" style="background:${c}" data-c="${c}"></div>`).join("");
  $("modal-icons").innerHTML = ICONS.map(ic => `<span class="modal-icon${ic===selIcon?' selected':''}" data-ic="${ic}">${ic}</span>`).join("");

  $("modal-colors").onclick = (e) => {
    const el = (e.target as HTMLElement).closest(".modal-color") as HTMLElement;
    if (!el) return; selColor = el.dataset.c!;
    document.querySelectorAll(".modal-color").forEach(c => c.classList.toggle("selected", c.getAttribute("data-c")===selColor));
  };
  $("modal-icons").onclick = (e) => {
    const el = (e.target as HTMLElement).closest(".modal-icon") as HTMLElement;
    if (!el) return; selIcon = el.dataset.ic!;
    document.querySelectorAll(".modal-icon").forEach(ic => ic.classList.toggle("selected", ic.getAttribute("data-ic")===selIcon));
  };
  $("modal-cancel").onclick = () => { mo.style.display = "none"; };
  $("modal-confirm").onclick = async () => {
    const name = ($("modal-name") as HTMLInputElement).value.trim() || "新方块";
    try { await invoke("create_block", { name, color: selColor, icon: selIcon }); mo.style.display = "none"; toast("方块已创建 ✓"); showBlocksView(); }
    catch (err) { toast(`创建失败: ${err}`); }
  };
}

function showBlockCtxMenu(x: number, y: number, blockId: string) {
  const block = blockPreviews.find(b => b.id === blockId); if (!block) return;
  dmCtx(() => {
    const html = `<div class="ctx-item" data-act="open">📂 打开</div>
      <div class="ctx-item" data-act="restore-all">↩ 全部还原</div>
      <div class="ctx-item" data-act="rename">✎ 重命名</div>
      <div class="ctx-item" data-act="delete" style="color:var(--danger)">🗑 删除方块</div>`;
    const menu = showMenu(x, y, html);
    menu.querySelector("[data-act=open]")!.addEventListener("click", () => { showBlockDetail(blockId); menu.remove(); });
    menu.querySelector("[data-act=restore-all]")!.addEventListener("click", () => { doRestoreAllBlock(blockId); menu.remove(); });
    menu.querySelector("[data-act=rename]")!.addEventListener("click", async () => {
      const name = prompt("新名称", block.name); if (name) { try { await invoke("rename_block", { blockId, name }); toast("已重命名 ✓"); showBlocksView(); } catch(e) { toast(`失败: ${e}`); } }
      menu.remove();
    });
    menu.querySelector("[data-act=delete]")!.addEventListener("click", () => { deleteBlock(blockId); menu.remove(); });
  });
}

function showItemCtxMenu(x: number, y: number, blockId: string, itemId: string) {
  const item = currentBlock?.items.find(i => i.id === itemId);
  dmCtx(() => {
    let html = `<div class="ctx-item" data-act="open">▶ 打开</div>
      <div class="ctx-item" data-act="restore">↩ 还原</div>
      <div class="ctx-item" data-act="delete" style="color:var(--danger)">🗑 删除</div>`;
    if (item?.original_path) {
      const folder = item.original_path.replace(/\\[^\\]*$/, "");
      html += `<div class="ctx-item" data-act="locate">📂 打开文件位置</div>`;
    }
    const menu = showMenu(x, y, html);
    menu.querySelector("[data-act=open]")!.addEventListener("click", () => { openStoredItem(blockId, itemId); menu.remove(); });
    menu.querySelector("[data-act=restore]")!.addEventListener("click", () => { doRestoreItem(blockId, itemId); menu.remove(); });
    menu.querySelector("[data-act=delete]")!.addEventListener("click", () => { doDeleteItem(blockId, itemId); menu.remove(); });
    menu.querySelector("[data-act=locate]")?.addEventListener("click", () => {
      const folder = item!.original_path.replace(/\\[^\\]*$/, "");
      openWith(folder); menu.remove();
    });
  });
}

async function deleteBlock(blockId: string) {
  try { await invoke("delete_block", { blockId }); toast("方块已删除 ✓"); showBlocksView(); } catch (err) { toast(`删除失败: ${err}`); }
}

// ---- Actions ----
function openItem(item: DesktopItem) {
  let target = item.path, args: string | undefined, wd: string | undefined;
  if (item.item_type === "shortcut" && item.lnk_info?.target_path) { target = item.lnk_info.target_path; args = item.lnk_info.arguments || undefined; wd = item.lnk_info.working_dir || undefined; }
  else if (item.item_type === "url" && item.lnk_info?.target_path) { target = item.lnk_info.target_path; }
  openWith(target, args, wd);
}
async function openStoredItem(bid: string, iid: string) {
  const allBlocks = await invoke<Block[]>("get_blocks");
  const block = allBlocks.find(b => b.id === bid);
  const item = block?.items.find(i => i.id === iid);
  if (!item) { toast("找不到该物品"); return; }
  let target = item.storage_path, args: string | undefined, wd: string | undefined;
  if (item.item_type === "shortcut" && item.lnk_info?.target_path) { target = item.lnk_info.target_path; args = item.lnk_info.arguments || undefined; wd = item.lnk_info.working_dir || undefined; }
  else if (item.item_type === "url" && item.lnk_info?.target_path) { target = item.lnk_info.target_path; }
  openWith(target, args, wd);
}
async function openWith(target: string, args?: string, wd?: string) {
  try { await invoke("open_file", { path: target, args: args || null, workDir: wd || null }); } catch (e) { toast(`打开失败: ${e}`); }
}

async function doCollectItem(path: string) {
  const bid = await pickBlock(); if (bid === null) return;
  try { await invoke("collect_item", { path, blockId: bid }); toast("已收纳 ✓"); showDesktopView(); } catch (e) { toast(`失败: ${e}`); }
}
async function doCollectAll() {
  if (desktopItems.length === 0) { toast("没有图标"); return; }
  const bid = await pickBlock(); if (bid === null) return;
  try { const r = await invoke<any>("collect_all", { blockId: bid }); toast(`已收纳 ${r.collected}/${r.total} ✓`); showDesktopView(); } catch (e) { toast(`失败: ${e}`); }
}
async function pickBlock(): Promise<string | null> {
  const blocks = await invoke<BlockPreview[]>("get_block_previews");
  if (blocks.length === 0) { await invoke("create_block", { name: "默认方块", color: "#7c8cf8", icon: "📦" }); const b2 = await invoke<BlockPreview[]>("get_block_previews"); if (b2.length === 0) { toast("创建方块失败"); return null; } return b2[0].id; }
  if (blocks.length === 1) return blocks[0].id;
  return new Promise((resolve) => {
    const overlay = document.createElement("div"); overlay.className = "modal-overlay"; overlay.style.zIndex = "350";
    overlay.innerHTML = `<div class="modal" style="width:280px"><h3>收纳到哪个方块？</h3>
      <div style="max-height:240px;overflow-y:auto">${blocks.map(b => `
        <div class="block-pick-item" data-bid="${b.id}" style="display:flex;align-items:center;gap:8px;padding:10px;border-radius:8px;cursor:pointer;margin:2px 0">
          <span style="font-size:20px">${b.icon}</span><span style="flex:1;font-size:13px">${h(b.name)}</span><span style="font-size:10px;color:var(--text-secondary)">${b.item_count} 个</span></div>`).join("")}
      </div><div class="modal-actions" style="margin-top:8px"><button class="btn-secondary pick-cancel">取消</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll<HTMLElement>(".block-pick-item").forEach(el => {
      el.onclick = () => { overlay.remove(); resolve(el.dataset.bid!); };
      el.onmouseenter = () => el.style.background = "var(--glass-hover)"; el.onmouseleave = () => el.style.background = "";
    });
    overlay.querySelector(".pick-cancel")!.addEventListener("click", () => { overlay.remove(); resolve(null); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
  });
}
async function doRestoreItem(bid: string, iid: string) {
  try { await invoke("restore_item", { blockId: bid, itemId: iid }); toast("已还原 ✓"); showBlockDetail(bid); } catch (e) { toast(`还原失败: ${e}`); }
}
async function doRestoreAllBlock(bid: string) {
  const block = (await invoke<Block[]>("get_blocks")).find(b => b.id === bid);
  if (!block || block.items.length === 0) { toast("没有可还原的"); return; }
  try { const r = await invoke<any>("restore_block", { blockId: bid }); toast(`已还原 ${r.restored} 个 ✓`); showBlockDetail(bid); } catch (e) { toast(`失败: ${e}`); }
}
async function doDeleteItem(bid: string, iid: string) {
  if (!confirm("永久删除？")) return;
  try { await invoke("delete_stored_item", { blockId: bid, itemId: iid }); toast("已删除"); showBlockDetail(bid); } catch (e) { toast(`失败: ${e}`); }
}

// ---- Context menu helpers ----
let ctxCount = 0;
function dmCtx(fn: () => void) { ctxCount++; document.querySelector(".context-menu")?.remove(); fn(); setTimeout(() => { const close = (ev: MouseEvent) => { const menu = document.querySelector(".context-menu"); if (menu && !menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); } }; document.addEventListener("click", close); }, 0); }
function showMenu(x: number, y: number, html: string): HTMLElement { document.querySelector(".context-menu")?.remove(); const menu = document.createElement("div"); menu.className = "context-menu"; menu.style.left = `${Math.min(x, window.innerWidth - 170)}px`; menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`; menu.innerHTML = html; document.body.appendChild(menu); return menu; }

// ---- Toast ----
function toast(msg: string) { const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2500); }

// ---- Helpers ----
function emoji(t: string) { return t==="shortcut"?"📌":t==="url"?"🌐":t==="directory"?"📁":t==="file"?"📄":"📋"; }
function h(s: string) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function e(s: string) { return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function showLoading() { loadingState.style.display = "flex"; }
function hideLoading() { loadingState.style.display = "none"; }
function showError(t: string, m: string) { hideLoading(); iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${h(t)}</p><p style="font-size:10px;color:var(--text-secondary)">${h(m)}</p></div>`; }

// ---- Init ----
window.addEventListener("DOMContentLoaded", async () => {
  // Check if first launch
  try { const blocks = await invoke<Block[]>("get_blocks"); firstLaunch = blocks.length === 0 || blocks.every(b => b.item_count === 0); } catch { firstLaunch = true; }

  showBlocksView();
  $("btn-min").onclick = async () => { await getCurrentWindow().minimize(); };
  $("btn-close").onclick = async () => { await getCurrentWindow().hide(); };
  document.addEventListener("keydown", async (e) => { if (e.key === "Escape") { await getCurrentWindow().hide(); } });
  const rh = document.createElement("div"); rh.className = "resize-handle"; document.body.appendChild(rh);

  // Listen for window toggle events (for animations)
  listen<boolean>("toggle-window", (event) => {
    const app = document.getElementById("app");
    if (app) {
      app.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      if (event.payload) {
        app.style.opacity = "1";
        app.style.transform = "translateY(0)";
      } else {
        app.style.opacity = "0";
        app.style.transform = "translateY(10px)";
      }
    }
  });

  // Listen for settings open from tray
  listen("open-settings", () => {
    showSettingsView();
    // Also show the window if hidden
    getCurrentWindow().show();
    getCurrentWindow().setFocus();
  });
});
