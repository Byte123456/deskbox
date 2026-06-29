import type { DesktopItem, BlockPreview, Block } from "./types";

export const desktopItems: DesktopItem[] = [];
export const blockPreviews: BlockPreview[] = [];
export const blockState = { current: null as Block | null };
export const firstLaunch = false;
export const dragState = { el: null as HTMLElement | null };
export const pathsBar = document.getElementById("paths-bar")!;
export const iconGrid = document.getElementById("icon-grid")!;
export const loadingState = document.getElementById("loading-state")!;
