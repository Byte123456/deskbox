export interface LnkInfo {
  target_path: string; arguments: string; working_dir: string;
  description: string; icon_location: string; icon_index: number;
  exe_name: string; product_name: string; company_name: string;
  file_description: string;
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

// 撤销操作类型
export type UndoActionType = 
  | "collect_item"      // 收纳单个物品
  | "restore_item"      // 还原单个物品
  | "delete_item"       // 删除物品
  | "rename_block"      // 重命名方块
  | "rename_item"       // 重命名物品
  | "create_block"      // 创建方块
  | "delete_block"      // 删除方块
  | "move_item"         // 移动物品
  | "collect_all";      // 全部收纳

export interface UndoAction {
  type: UndoActionType;
  data: any;
  timestamp: number;
}

export interface TrashItem {
  id: string; name: string; item_type: string;
  original_path: string; storage_path: string;
  icon_base64: string | null; collected_at: string;
}

export interface OrganizeRule {
  category: string; emoji: string; color: string;
  keywords?: string[]; exact_executables: string[]; product_names: string[];
  path_patterns: string[]; strong_phrases: string[]; weak_words: string[];
  exclude_phrases: string[];
}

export type ThemeMode = "dark" | "light" | "auto";
