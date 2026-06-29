import { invoke } from "@tauri-apps/api/core";
import type { BlockPreview } from "../types";
import { showBlocksView } from "../views/blocks-view";
import { toast, h, $ } from "../utils";

const COLORS = ["#7c8cf8","#f87070","#70d6a0","#f0c040","#c070f0","#40c0e0","#f09060","#80c040"];
const ICONS = ["📦","🎮","📚","💼","🎵","🌐","🔧","⚙","📁","💡","🎨","📊"];

export function showCreateBlockModal(): void {
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

export async function pickBlock(): Promise<string | null> {
  const blocks = await invoke<BlockPreview[]>("get_block_previews");
  if (blocks.length === 0) {
    await invoke("create_block", { name: "默认方块", color: "#7c8cf8", icon: "📦" });
    const b2 = await invoke<BlockPreview[]>("get_block_previews");
    if (b2.length === 0) { toast("创建方块失败"); return null; }
    return b2[0].id;
  }
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
