import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Block } from "./types";
import { firstLaunch, searchState } from "./state";
import { showBlocksView } from "./views/blocks-view";
import { showSettingsView } from "./views/settings-view";
import { clearSearch, performSearch } from "./components/search-bar";
import { undo, redo } from "./actions/undo";
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