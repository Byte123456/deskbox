import { invoke } from "@tauri-apps/api/core";
import { blockState } from "../state";
import { dmCtx } from "./context-menu";
import { toast } from "../utils";

export function showColorPicker(): void {
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
        try { await invoke("set_block_color", { blockId: blockState.current!.id, color }); blockState.current!.color = color; toast("颜色已更新 ✓"); }
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
