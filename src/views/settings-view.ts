import { invoke } from "@tauri-apps/api/core";
import { iconGrid, pathsBar } from "../state";
import { showBlocksView } from "./blocks-view";
import { h, hideLoading, toast } from "../utils";

export async function showSettingsView(): Promise<void> {
  (window as any).__view = "settings";
  hideLoading();
  const s = await invoke<any>("get_settings");
  const icons = await invoke<any[]>("get_system_icons_state");
  pathsBar.innerHTML = `<span class="clickable" id="nav-back2">← 返回</span> | ⚙ 设置`;
  document.getElementById("nav-back2")!.onclick = showBlocksView;

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

    <div style="font-weight:700;font-size:14px;margin:12px 0 4px">🐛 调试</div>
    <div style="padding:8px 12px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;margin:2px 0">
      <button class="btn-secondary" id="btn-copy-log">📋 复制日志到剪贴板</button>
      <span style="font-size:10px;color:var(--text-secondary);margin-left:8px">反馈 bug 时附上</span>
    </div>
  </div>`;

  // Hotkey recorder
  let rec = false, captured = "";
  const recorder = document.getElementById("hotkey-recorder")!;
  const display = document.getElementById("hotkey-display")!;
  const hint = document.getElementById("hotkey-hint")!;
  recorder.onclick = () => { rec = true; hint.textContent = "按下组合键..."; display.textContent = "..."; captured = ""; };
  recorder.onkeydown = (e) => {
    if (!rec) return; e.preventDefault();
    const p: string[] = [];
    if (e.altKey) p.push("Alt"); if (e.ctrlKey) p.push("Ctrl");
    if (e.shiftKey) p.push("Shift"); if (e.metaKey) p.push("Win");
    if (!["Alt","Control","Shift","Meta"].includes(e.key)) p.push(e.key===" "?"Space":e.key.length===1?e.key.toUpperCase():e.key);
    captured = p.join("+"); display.textContent = captured;
  };
  recorder.onkeyup = () => { if (!rec) return; rec = false; hint.textContent = "点击重新录制"; document.getElementById("btn-apply-hotkey")!.style.display = "block"; };
  document.getElementById("btn-apply-hotkey")!.onclick = async () => {
    try { await invoke("change_hotkey", { hotkeyStr: captured }); toast("热键已更新 ✓"); }
    catch (err) { toast(`热键冲突: ${err}`); }
  };

  // Toggles
  document.querySelectorAll<HTMLInputElement>(".sys-toggle").forEach(t => {
    t.onchange = async () => {
      try { await invoke("set_system_icon_visibility", { key: t.dataset.key!, visible: t.checked }); toast("已更新 ✓"); }
      catch(e) { toast(`失败: ${e}`); t.checked = !t.checked; }
    };
  });
  document.querySelectorAll<HTMLInputElement>(".gen-toggle").forEach(t => {
    t.onchange = async () => {
      const checked = t.checked, key = t.dataset.key!;
      const sk = key==="ontop"?"always_on_top":key;
      await invoke("save_settings", { settings: { [sk]: checked } });
      if (key === "ontop") await invoke("set_always_on_top", { on: checked });
      if (key === "autostart") await invoke("set_autostart", { enable: checked });
      toast("已保存 ✓");
    };
  });

  // Copy log button
  document.getElementById("btn-copy-log")!.onclick = async () => {
    try {
      const log = await invoke<string>("read_log");
      await navigator.clipboard.writeText(log);
      toast("日志已复制到剪贴板 ✓");
    } catch (e) { toast(`复制失败: ${e}`); }
  };
}
