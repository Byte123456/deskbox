import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Block } from "./types";
import { firstLaunch } from "./state";
import { showBlocksView } from "./views/blocks-view";
import { showSettingsView } from "./views/settings-view";

window.addEventListener("DOMContentLoaded", async () => {
  // Check if first launch
  try {
    const blocks = await invoke<Block[]>("get_blocks");
    const isEmpty = blocks.length === 0 || blocks.every(b => b.item_count === 0);
    if (isEmpty) firstLaunch; // read-only check
  } catch { /* ignore */ }

  showBlocksView();

  const $ = (id: string) => document.getElementById(id)!;
  $("btn-min").onclick = async () => { await getCurrentWindow().minimize(); };
  $("btn-close").onclick = async () => { await getCurrentWindow().hide(); };
  document.addEventListener("keydown", async (e) => { if (e.key === "Escape") { await getCurrentWindow().hide(); } });

  // Resize handle
  const rh = document.createElement("div"); rh.className = "resize-handle"; document.body.appendChild(rh);

  // Window toggle animation
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

  // Open settings from tray
  listen("open-settings", () => {
    showSettingsView();
    getCurrentWindow().show();
    getCurrentWindow().setFocus();
  });
});
