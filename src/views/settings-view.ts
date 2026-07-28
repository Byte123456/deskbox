import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { iconGrid, pathsBar, viewState } from "../state";
import { showBlocksView } from "./blocks-view";
import { h, hideLoading, toast, applyTheme } from "../utils";
import type { OrganizeRule } from "../types";

export async function showSettingsView(): Promise<void> {
  viewState.current = "settings";
  hideLoading();
  const s = await invoke<any>("get_settings");
  const icons = await invoke<any[]>("get_system_icons_state");
  pathsBar.innerHTML = `<span class="clickable" id="nav-back2">← 返回</span> | ⚙ 设置`;
  document.getElementById("nav-back2")!.onclick = showBlocksView;

  iconGrid.innerHTML = `
  <div class="block-detail">
    <div class="settings-section">
      <div class="settings-section-title">🔤 全局热键</div>
      <div class="hotkey-recorder" id="hotkey-recorder" tabindex="0">
        <span id="hotkey-display">${h(s.hotkey||'Alt+Shift+D')}</span>
        <span id="hotkey-hint" style="font-size:10px;color:var(--text-secondary)">点击录制新热键</span>
      </div>
      <button class="btn-secondary" id="btn-apply-hotkey" style="display:none;margin-top:6px">应用热键</button>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🖥 系统桌面图标</div>
      ${icons.map((ic: any) => `<div class="settings-item">
        <span class="settings-item-label">${h(ic.name)}</span>
        <label class="toggle"><input type="checkbox" class="sys-toggle" data-key="${ic.key}" ${ic.visible?'checked':''}><span class="toggle-slider"></span></label>
      </div>`).join('')}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">⚡ 通用</div>
      ${['autostart','animations','ontop','theme'].map(k => {
        const label = k==='autostart'?'开机自启':k==='animations'?'动画效果':k==='ontop'?'窗口置顶':'外观主题';
        if (k === 'theme') {
          return `<div class="settings-item">
            <span class="settings-item-label">${label}</span>
            <select class="theme-select" id="theme-select" style="background:var(--glass-bg);border:1px solid var(--glass-border);color:var(--text-primary);padding:4px 8px;border-radius:6px;font-size:12px">
              <option value="dark" ${s.theme==='dark'?'selected':''}>🌙 暗色</option>
              <option value="light" ${s.theme==='light'?'selected':''}>☀ 亮色</option>
              <option value="auto" ${s.theme==='auto'?'selected':''}>🔄 跟随系统</option>
            </select>
          </div>`;
        }
        const ck = k==='autostart'?s.autostart:k==='animations'?s.animations:s.always_on_top;
        return `<div class="settings-item">
          <span class="settings-item-label">${label}</span>
          <label class="toggle"><input type="checkbox" class="gen-toggle" data-key="${k}" ${ck?'checked':''}><span class="toggle-slider"></span></label>
        </div>`;
      }).join('')}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">💾 数据管理</div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">备份与恢复</div>
          <div class="settings-item-desc">导出配置和收纳的文件，或从备份恢复</div>
        </div>
      </div>
      <div class="backup-actions" style="padding:8px 12px">
        <button class="btn-secondary" id="btn-export-backup">📤 导出备份</button>
        <button class="btn-secondary" id="btn-import-backup">📥 导入备份</button>
        <button class="btn-secondary" id="btn-clean-cache">🧹 清理图标缓存</button>
      </div>
      <div class="backup-info" id="storage-stats">计算中...</div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🤖 自动整理规则</div>
      <div id="rules-editor" style="font-size:11px;color:var(--text-secondary)">加载中...</div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🐛 调试</div>
      <div class="settings-item">
        <div>
          <div class="settings-item-label">运行日志</div>
          <div class="settings-item-desc">反馈 bug 时请附上日志</div>
        </div>
        <button class="btn-secondary" id="btn-copy-log">📋 复制日志</button>
      </div>
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
      toast("已保存 ✓");
    };
  });

  // Backup buttons
  document.getElementById("btn-export-backup")!.onclick = async () => {
    try {
      const savePath = await save({
        defaultPath: `deskbox-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "Zip 文件", extensions: ["zip"] }],
      });
      if (!savePath) return;
      const result = await invoke<any>("export_backup", { savePath });
      toast(`备份已导出，共 ${result.items} 个物品`);
    } catch (e) {
      toast(`导出失败: ${e}`);
    }
  };

  document.getElementById("btn-import-backup")!.onclick = async () => {
    if (!confirm("导入备份将覆盖当前所有数据，确定继续吗？")) {
      return;
    }
    try {
      const zipPath = await open({
        filters: [{ name: "Zip 文件", extensions: ["zip"] }],
        multiple: false,
      });
      if (!zipPath) return;
      const result = await invoke<any>("import_backup", { zipPath });
      toast(`导入成功，共恢复 ${result.items} 个物品`);
      showBlocksView();
    } catch (e) {
      toast(`导入失败: ${e}`);
    }
  };

  // Copy log button
  document.getElementById("btn-copy-log")!.onclick = async () => {
    try {
      const log = await invoke<string>("read_log");
      await navigator.clipboard.writeText(log);
      toast("日志已复制到剪贴板 ✓");
    } catch (e) { toast(`复制失败: ${e}`); }
  };

  // Theme select
  const themeSelect = document.getElementById("theme-select") as HTMLSelectElement | null;
  if (themeSelect) {
    themeSelect.onchange = async () => {
      const val = themeSelect.value;
      await invoke("save_settings", { settings: { theme: val } });
      applyTheme(val);
      toast("主题已切换 ✓");
    };
  }

  // Cache clean
  document.getElementById("btn-clean-cache")!.onclick = async () => {
    try {
      const result = await invoke<any>("clean_icon_cache");
      toast(result.message);
    } catch (e) { toast(`清理失败: ${e}`); }
  };

  // Load organize rules
  loadRulesEditor();
  loadStorageStats();
}

async function loadStorageStats(): Promise<void> {
  try {
    const stats = await invoke<any>("get_storage_stats");
    const blk = stats.blocks.map((b: any) =>
      `<span>${b.name}: ${b.count} 个 (${(b.size_bytes / 1048576).toFixed(1)} MB)</span>`
    ).join("<br>");
    document.getElementById("storage-stats")!.innerHTML =
      `📊 共收纳 ${stats.total_files} 个文件，占用 ${stats.total_size_mb} MB<br>${blk}`;
  } catch { /* ignore */ }
}

async function loadRulesEditor(): Promise<void> {
  const editor = document.getElementById("rules-editor"); if (!editor) return;
  try {
    const rules = await invoke<any[]>("get_organize_rules");
    const rows = rules.map((r) => {
      const identities = [...(r.exact_executables || []), ...(r.product_names || [])];
      const hints = [...(r.strong_phrases || []), ...(r.weak_words || [])];
      return `
      <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--glass-border)">
        <span style="font-size:16px">${r.emoji}</span>
        <span style="width:60px;font-weight:600">${h(r.category)}</span>
        <span style="flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px">${h([...identities, ...hints].join(", "))}</span>
        <span style="font-size:10px;color:var(--text-secondary)">${identities.length} 身份 / ${hints.length} 规则</span>
      </div>`;
    }).join("");
    editor.innerHTML = `
      <div style="margin-bottom:4px;color:var(--text-secondary)">
        预设 ${rules.length} 个离线分类规则。软件身份、路径和短语会分别评分；手动分类记录在 <code>user_overrides</code> 中
      </div>
      <button class="btn-secondary" id="btn-reset-rules" style="margin:4px 0;font-size:11px">🔄 还原为预设规则</button>
      <div style="margin-top:6px">${rows}</div>`;
    document.getElementById("btn-reset-rules")!.onclick = async () => {
      if (!confirm("还原为预设规则？自定义规则将被覆盖。")) return;
      await invoke("save_organize_rules", { rules: [] });
      loadRulesEditor();
      toast("已还原 ✓");
    };
  } catch { editor.innerHTML = "加载失败"; }
}
