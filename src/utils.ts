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

export function toast(msg: string, action?: { label: string; onClick: () => void }): void {
  const el = document.createElement("div"); el.className = "toast";
  if (action) {
    el.innerHTML = `<span>${h(msg)}</span><button class="toast-action">${h(action.label)}</button>`;
    el.querySelector(".toast-action")!.addEventListener("click", (e) => {
      e.stopPropagation();
      action.onClick();
      el.remove();
    });
  } else {
    el.textContent = msg;
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export function getFallbackEmoji(type: string): string { return emoji(type); }

let _pinyinFn: ((text: string) => { first: string; full: string }) | null = null;

async function getPinyinFn() {
  if (_pinyinFn) return _pinyinFn;
  try {
    const mod = await import("pinyin-pro");
    const fn = (text: string) => {
      try {
        const initials = mod.pinyin(text, { pattern: "first", toneType: "none", type: "array" });
        const full = mod.pinyin(text, { toneType: "none", type: "array" });
        return { first: (initials as string[]).join(""), full: (full as string[]).join("") };
      } catch {
        return { first: "", full: text.toLowerCase() };
      }
    };
    _pinyinFn = fn;
    return fn;
  } catch {
    return null;
  }
}

export function matchPinyin(text: string, query: string): boolean {
  if (!query) return true;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerText.includes(lowerQuery)) return true;

  const fn = _pinyinFn;
  if (fn) {
    try {
      const py = fn(text);
      return py.full.includes(lowerQuery) || py.first.includes(lowerQuery);
    } catch { /* ignore */ }
  }

  return false;
}

export function preloadPinyin(): void {
  getPinyinFn();
}

// 防抖函数
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function applyTheme(mode: string): void {
  const cls = document.documentElement.classList;
  if (mode === "auto") {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    cls.toggle("theme-light", mq.matches);
    mq.onchange = (e) => cls.toggle("theme-light", e.matches);
  } else {
    cls.toggle("theme-light", mode === "light");
  }
}
