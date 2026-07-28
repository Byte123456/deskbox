import type { DesktopItem, BlockPreview, Block, UndoAction, TrashItem, OrganizeRule } from "./types";

export const desktopItems: DesktopItem[] = [];
export const blockPreviews: BlockPreview[] = [];
export const blockState = { current: null as Block | null };
export const firstLaunch = false;
export const dragState = { el: null as HTMLElement | null };
export const pathsBar = document.getElementById("paths-bar")!;
export const iconGrid = document.getElementById("icon-grid")!;
export const loadingState = document.getElementById("loading-state")!;

export const viewState = { current: "" as string };

export const searchState = {
  query: "",
};

export const undoStack: UndoAction[] = [];
export const redoStack: UndoAction[] = [];
export const MAX_UNDO_STEPS = 10;

export const trashItems: TrashItem[] = [];
export const organizeRules: OrganizeRule[] = [];
export const batchSelected = new Set<string>();
export const themeState = { current: "dark" as string };

export let busyLock = false;
export function setBusy(locked: boolean): void { busyLock = locked; }

const MAX_RECENT = 5;
export const recentItems: { name: string; blockId: string; itemId: string; icon: string | null }[] = [];
export function pushRecent(item: { name: string; blockId: string; itemId: string; icon: string | null }): void {
  const idx = recentItems.findIndex(i => i.itemId === item.itemId);
  if (idx >= 0) recentItems.splice(idx, 1);
  recentItems.unshift(item);
  if (recentItems.length > MAX_RECENT) recentItems.length = MAX_RECENT;
}
