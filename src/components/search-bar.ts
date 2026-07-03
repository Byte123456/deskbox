import { searchState, blockPreviews, desktopItems, blockState, pathsBar as _pb } from "../state";
import { $, matchPinyin, debounce } from "../utils";
import { renderBlockCards } from "../views/blocks-view";
import { renderDesktopItems } from "../views/desktop-view";
import { renderBlockDetail } from "../views/block-detail";

const input = () => $("search-input") as HTMLInputElement;
const clearBtn = () => $("search-clear");

export function clearSearch(): void {
  input().value = "";
  searchState.query = "";
  clearBtn().style.display = "none";
  restoreData();
  refreshCurrentView();
}

export const performSearch = debounce((query: string) => {
  if (!query) {
    restoreData();
    refreshCurrentView();
    return;
  }
  const currentView = (window as any).__view;
  snapOnce(currentView);
  switch (currentView) {
    case "blocks": searchBlocks(query); break;
    case "desktop": searchDesktopItems(query); break;
    case "block-detail": searchBlockItems(query); break;
  }
}, 150);

function snapOnce(view: string): void {
  if (view === "blocks" && !(window as any).__originalBlocks) {
    (window as any).__originalBlocks = [...blockPreviews];
  } else if (view === "desktop" && !(window as any).__originalDesktopItems) {
    (window as any).__originalDesktopItems = [...desktopItems];
  } else if (view === "block-detail" && blockState.current && !(window as any).__originalBlockItems) {
    (window as any).__originalBlockItems = [...blockState.current.items];
  }
}

function restoreData(): void {
  if ((window as any).__originalBlocks) {
    blockPreviews.length = 0;
    blockPreviews.push(...(window as any).__originalBlocks);
  }
  if ((window as any).__originalDesktopItems) {
    desktopItems.length = 0;
    desktopItems.push(...(window as any).__originalDesktopItems);
  }
  if ((window as any).__originalBlockItems && blockState.current) {
    blockState.current.items = [...(window as any).__originalBlockItems];
  }
  (window as any).__originalBlocks = null;
  (window as any).__originalDesktopItems = null;
  (window as any).__originalBlockItems = null;
}

function searchBlocks(query: string): void {
  const original = (window as any).__originalBlocks || blockPreviews;
  const filtered = original.filter((block: any) =>
    matchPinyin(block.name, query) || block.preview_items.some((item: any) => matchPinyin(item.name, query))
  );
  blockPreviews.length = 0;
  blockPreviews.push(...filtered);
  renderBlockCards();
}

function searchDesktopItems(query: string): void {
  const original = (window as any).__originalDesktopItems || desktopItems;
  const filtered = original.filter((item: any) => matchPinyin(item.name, query));
  desktopItems.length = 0;
  desktopItems.push(...filtered);
  renderDesktopItems();
}

function searchBlockItems(query: string): void {
  if (!blockState.current) return;
  const original = (window as any).__originalBlockItems || blockState.current.items;
  const filtered = original.filter((item: any) => matchPinyin(item.name, query));
  blockState.current.items = filtered;
  renderBlockDetail();
}

function refreshCurrentView(): void {
  const view = (window as any).__view;
  if (view === "blocks") renderBlockCards();
  else if (view === "desktop") renderDesktopItems();
  else if (view === "block-detail") renderBlockDetail();
}