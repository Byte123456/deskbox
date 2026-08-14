import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { searchState, viewState, batchSelected, blockState } from "./state";
import { showBlocksView } from "./views/blocks-view";
import { showSettingsView } from "./views/settings-view";
import { showDesktopView } from "./views/desktop-view";
import { clearSearch, performSearch } from "./components/search-bar";
import { undo, redo } from "./actions/undo";
import { openStoredItem } from "./actions/items";
import { moveToTrash } from "./actions/blocks";
import { pickBlock } from "./components/modal";
import { updateSelectionUI } from "./views/block-detail";
import { $, preloadPinyin, applyTheme, applyAnimations, toast } from "./utils";

window.addEventListener("DOMContentLoaded", async () => {
  showBlocksView();
  preloadPinyin();
  invoke<any>("get_settings").then(s => {
    applyTheme(s.theme || "dark");
    applyAnimations(s.animations !== false);
  }).catch(() => {});

  $("btn-min").onclick = async () => { await getCurrentWindow().minimize(); };
  $("btn-close").onclick = async () => { await getCurrentWindow().hide(); };

  document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      if (batchSelected.size > 0) {
        batchSelected.clear();
        updateSelectionUI();
        if (viewState.current === "block-detail") {
          return;
        }
      }
      const searchInput = $("search-input") as HTMLInputElement;
      if (searchInput.value) {
        clearSearch();
      } else {
        await getCurrentWindow().hide();
      }
      return;
    }

    if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      redo();
      return;
    }

    if (viewState.current === "block-detail" && blockState.current) {
      const bid = blockState.current.id;
      if (e.key === "Enter" && !e.ctrlKey) {
        e.preventDefault();
        if (batchSelected.size > 0) {
          openStoredItem(bid, [...batchSelected][0]);
        }
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        if (batchSelected.size > 0) {
          const ids = [...batchSelected];
          for (const iid of ids) { await moveToTrash(bid, iid); }
          batchSelected.clear();
          showBlocksView();
        }
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        const first = document.querySelector<HTMLElement>('.icon-name[contenteditable][data-field="name"]');
        if (first) first.focus();
        return;
      }
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        blockState.current.items.forEach(i => batchSelected.add(i.id));
        updateSelectionUI();
        return;
      }
    }
  });

  const rh = document.createElement("div"); rh.className = "resize-handle"; document.body.appendChild(rh);

  // 从系统资源管理器/桌面拖文件进窗口 → 收纳（HTML5 Files 拖入；dragDropEnabled=false 时可用）
  let dropOverlay: HTMLDivElement | null = null;
  let dragDepth = 0;
  const hasFiles = (dt: DataTransfer | null) => !!(dt && dt.types && [...dt.types].includes("Files"));
  const showDropOverlay = () => {
    if (!dropOverlay) {
      dropOverlay = document.createElement("div");
      dropOverlay.className = "drop-overlay";
      dropOverlay.innerHTML = `<div class="drop-overlay-inner">📥 松开以收纳到 DeskBox</div>`;
      document.body.appendChild(dropOverlay);
    }
  };
  const hideDropOverlay = () => { if (dropOverlay) { dropOverlay.remove(); dropOverlay = null; } };

  document.addEventListener("dragenter", (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth++;
    showDropOverlay();
  });
  document.addEventListener("dragover", (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "copy";
  });
  document.addEventListener("dragleave", () => {
    if (dragDepth > 0) dragDepth--;
    if (dragDepth === 0) hideDropOverlay();
  });
  document.addEventListener("drop", async (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth = 0;
    hideDropOverlay();
    const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
    if (files.length === 0) { toast("无法获取拖入的文件"); return; }
    handleExternalDrop(files);
  });

  listen<boolean>("toggle-window", (event) => {
    const app = document.getElementById("app");
    if (app) {
      app.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      if (event.payload) {
        app.style.opacity = "1"; app.style.transform = "translateY(0)";
      } else {
        app.style.opacity = "0"; app.style.transform = "translateY(10px)";
      }
    }
  });

  listen("open-settings", () => {
    showSettingsView();
    getCurrentWindow().show();
    getCurrentWindow().setFocus();
  });

  const searchInput = $("search-input") as HTMLInputElement;
  const searchClear = $("search-clear");

  searchInput.addEventListener("input", (e) => {
    const query = (e.target as HTMLInputElement).value;
    searchState.query = query;
    searchClear.style.display = query ? "flex" : "none";
    performSearch(query);
  });

  searchClear.addEventListener("click", () => {
    clearSearch();
  });
});

async function handleExternalDrop(files: File[]): Promise<void> {
  const bid = await pickBlock();
  if (bid === null) return;
  let ok = 0, fail = 0;
  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const b64 = bufToB64(buf);
      await invoke("collect_dropped_files", { files: [{ name: file.name, data: b64 }], blockId: bid });
      ok++;
    } catch { fail++; }
  }
  toast(`已收纳 ${ok} 个${fail ? `，失败 ${fail}` : ""} ✓`);
  if (viewState.current === "desktop") showDesktopView(); else showBlocksView();
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}