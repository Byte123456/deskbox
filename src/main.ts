import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Block } from "./types";
import { firstLaunch, searchState, viewState, batchSelected, blockState } from "./state";
import { showBlocksView } from "./views/blocks-view";
import { showSettingsView } from "./views/settings-view";
import { clearSearch, performSearch } from "./components/search-bar";
import { undo, redo } from "./actions/undo";
import { openStoredItem } from "./actions/items";
import { moveToTrash } from "./actions/blocks";
import { updateSelectionUI } from "./views/block-detail";
import { $, preloadPinyin, applyTheme } from "./utils";

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const blocks = await invoke<Block[]>("get_blocks");
    const isEmpty = blocks.length === 0 || blocks.every(b => b.item_count === 0);
    if (isEmpty) firstLaunch;
  } catch { /* ignore */ }

  showBlocksView();
  preloadPinyin();
  invoke<any>("get_settings").then(s => applyTheme(s.theme || "dark")).catch(() => {});

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