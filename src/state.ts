import type { DesktopItem, BlockPreview, Block, UndoAction, TrashItem, OrganizeRule } from "./types";

export const desktopItems: DesktopItem[] = [];
export const blockPreviews: BlockPreview[] = [];
export const blockState = { current: null as Block | null };
export const firstLaunch = false;
export const dragState = { el: null as HTMLElement | null };
export const pathsBar = document.getElementById("paths-bar")!;
export const iconGrid = document.getElementById("icon-grid")!;
export const loadingState = document.getElementById("loading-state")!;

// 搜索状态
export const searchState = {
  query: "",
};

// 撤销/重做栈
export const undoStack: UndoAction[] = [];
export const redoStack: UndoAction[] = [];
export const MAX_UNDO_STEPS = 10;

export const trashItems: TrashItem[] = [];
export const organizeRules: OrganizeRule[] = [];
export const batchSelected = new Set<string>();
export const themeState = { current: "dark" as string };
