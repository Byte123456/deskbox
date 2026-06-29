export function emoji(t: string): string {
  return t === "shortcut" ? "📌" : t === "url" ? "🌐" : t === "directory" ? "📁" : t === "file" ? "📄" : "📋";
}
export function h(s: string): string { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
export function e(s: string): string { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export const $ = (id: string) => document.getElementById(id)!;
export const iconGrid = $("icon-grid");
export const pathsBar = $("paths-bar");
export const loadingState = $("loading-state");

export function showLoading(): void { loadingState.style.display = "flex"; }
export function hideLoading(): void { loadingState.style.display = "none"; }
export function showError(t: string, m: string): void {
  hideLoading();
  iconGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><p>${h(t)}</p><p style="font-size:10px;color:var(--text-secondary)">${h(m)}</p></div>`;
}

export function toast(msg: string): void {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2500);
}

export function getFallbackEmoji(type: string): string { return emoji(type); }
