import { blockPreviews, blockState } from "../state";
import { showBlockDetail } from "../views/block-detail";
import { showBlocksView } from "../views/blocks-view";
import { openStoredItem } from "../actions/items";
import { doRestoreItem, doRestoreAllBlock, doDeleteItem, deleteBlock } from "../actions/blocks";
import { openWith, openItem } from "../actions/items";
import { h } from "../utils";

let ctxCount = 0;

export function dmCtx(fn: () => void): void {
  ctxCount++; document.querySelector(".context-menu")?.remove(); fn();
  setTimeout(() => {
    const close = (ev: MouseEvent) => {
      const menu = document.querySelector(".context-menu");
      if (menu && !menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); }
    };
    document.addEventListener("click", close);
  }, 0);
}

export function showMenu(x: number, y: number, html: string): HTMLElement {
  document.querySelector(".context-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${Math.min(x, window.innerWidth - 170)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
  menu.innerHTML = html;
  document.body.appendChild(menu);
  return menu;
}

export function showBlockCtxMenu(x: number, y: number, blockId: string): void {
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
      const name = prompt("新名称", block.name);
      if (name) { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("rename_block", { blockId, name }); showBlocksView(); } catch(e) { /* ignore */ } }
      menu.remove();
    });
    menu.querySelector("[data-act=delete]")!.addEventListener("click", () => { deleteBlock(blockId); menu.remove(); });
  });
}

export function showItemCtxMenu(x: number, y: number, blockId: string, itemId: string): void {
  const item = blockState.current?.items.find(i => i.id === itemId);
  dmCtx(() => {
    let html = `<div class="ctx-item" data-act="open">▶ 打开</div>
      <div class="ctx-item" data-act="restore">↩ 还原</div>
      <div class="ctx-item" data-act="delete" style="color:var(--danger)">🗑 删除</div>`;
    if (item?.original_path) {
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

export function showDesktopCtxMenu(x: number, y: number, item: import("../types").DesktopItem, doCollectItem: (path: string) => void): void {
  dmCtx(() => {
    const html = `<div class="ctx-item" data-act="open">▶ 打开</div>
      <div class="ctx-item" data-act="collect">📥 收纳</div>
      <div class="ctx-item" data-act="locate">📂 打开文件位置</div>`;
    const menu = showMenu(x, y, html);
    menu.querySelector("[data-act=open]")!.addEventListener("click", () => { openItem(item); menu.remove(); });
    menu.querySelector("[data-act=collect]")!.addEventListener("click", () => { doCollectItem(item.path); menu.remove(); });
    menu.querySelector("[data-act=locate]")!.addEventListener("click", () => { openWith(item.path.replace(/\\[^\\]*$/, "")); menu.remove(); });
  });
}
