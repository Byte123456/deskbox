export interface LnkInfo {
  target_path: string; arguments: string; working_dir: string;
  description: string; icon_location: string; icon_index: number;
}
export interface DesktopItem {
  name: string; path: string; item_type: string;
  lnk_info: LnkInfo | null; icon_base64: string | null;
}
export interface BlockItem {
  id: string; name: string; item_type: string;
  original_path: string; storage_path: string;
  lnk_info: LnkInfo | null; icon_base64: string | null; collected_at: string;
}
export interface Block {
  id: string; name: string; color: string; icon: string;
  item_count: number; items: BlockItem[];
}
export interface BlockPreview {
  id: string; name: string; color: string; icon: string;
  item_count: number;
  preview_items: { name: string; item_type: string; icon_base64: string | null }[];
}
