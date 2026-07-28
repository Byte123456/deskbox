import { invoke } from "@tauri-apps/api/core";
import type { UndoAction, UndoActionType, BlockItem } from "../types";
import { undoStack, redoStack, MAX_UNDO_STEPS, blockPreviews, blockState, desktopItems, viewState } from "../state";
import { toast } from "../utils";
import { showBlocksView, renderBlockCards } from "../views/blocks-view";
import { renderBlockDetail } from "../views/block-detail";
import { showDesktopView, renderDesktopItems } from "../views/desktop-view";

// 压入撤销栈
export function pushUndo(action: Omit<UndoAction, "timestamp">): void {
  undoStack.push({
    ...action,
    timestamp: Date.now(),
  });
  
  // 超过最大步数，移除最旧的
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
  
  // 新操作清空重做栈
  redoStack.length = 0;
}

// 执行撤销
export async function undo(): Promise<void> {
  if (undoStack.length === 0) {
    toast("没有可撤销的操作");
    return;
  }
  
  const action = undoStack.pop()!;
  
  try {
    await executeUndo(action);
    redoStack.push(action);
    toast(`已撤销: ${getActionLabel(action.type)}`, {
      label: "重做",
      onClick: () => redo(),
    });
  } catch (err) {
    toast(`撤销失败: ${err}`);
    // 失败了就放回去
    undoStack.push(action);
  }
}

// 执行重做
export async function redo(): Promise<void> {
  if (redoStack.length === 0) {
    toast("没有可重做的操作");
    return;
  }
  
  const action = redoStack.pop()!;
  
  try {
    await executeRedo(action);
    undoStack.push(action);
    toast(`已重做: ${getActionLabel(action.type)}`, {
      label: "撤销",
      onClick: () => undo(),
    });
  } catch (err) {
    toast(`重做失败: ${err}`);
    redoStack.push(action);
  }
}

// 获取操作的中文标签
function getActionLabel(type: UndoActionType): string {
  const labels: Record<UndoActionType, string> = {
    collect_item: "收纳图标",
    restore_item: "还原图标",
    delete_item: "删除图标",
    rename_block: "重命名方块",
    rename_item: "重命名图标",
    create_block: "创建方块",
    delete_block: "删除方块",
    move_item: "移动图标",
    collect_all: "全部收纳",
  };
  return labels[type] || type;
}

// 执行撤销操作
async function executeUndo(action: UndoAction): Promise<void> {
  switch (action.type) {
    case "collect_item":
      // 撤销收纳 = 还原
      await invoke("restore_item", {
        blockId: action.data.blockId,
        itemId: action.data.itemId,
      });
      break;
      
    case "restore_item":
      // 撤销还原 = 重新收纳
      await invoke("collect_item", {
        path: action.data.originalPath,
        blockId: action.data.blockId,
      });
      break;
      
    case "delete_item":
      // 撤销删除 = 从回收站恢复（暂不实现，因为删除是永久的）
      toast("删除操作无法撤销");
      throw new Error("删除无法撤销");
      
    case "rename_block":
      // 撤销重命名 = 改回原名
      await invoke("rename_block", {
        blockId: action.data.blockId,
        name: action.data.oldName,
      });
      break;
      
    case "rename_item":
      // 撤销重命名 = 改回原名
      await invoke("rename_item", {
        blockId: action.data.blockId,
        itemId: action.data.itemId,
        name: action.data.oldName,
      });
      break;
      
    case "create_block":
      // 撤销创建 = 删除方块
      await invoke("delete_block", {
        blockId: action.data.blockId,
      });
      break;
      
    case "delete_block":
      // 撤销删除 = 恢复方块（暂不实现，因为删除是永久的）
      toast("删除方块无法撤销");
      throw new Error("删除方块无法撤销");
      
    case "move_item":
      // 撤销移动 = 移回原位
      await invoke("move_item", {
        from_blockId: action.data.toBlockId,
        itemId: action.data.itemId,
        to_blockId: action.data.fromBlockId,
        toIndex: action.data.fromIndex,
      });
      break;
      
    case "collect_all":
      // 撤销全部收纳 = 全部还原
      await invoke("restore_all");
      break;
  }
  
  // 刷新当前视图
  await refreshCurrentView();
}

// 执行重做操作
async function executeRedo(action: UndoAction): Promise<void> {
  switch (action.type) {
    case "collect_item":
      // 重做收纳
      await invoke("collect_item", {
        path: action.data.path,
        blockId: action.data.blockId,
      });
      break;
      
    case "restore_item":
      // 重做还原
      await invoke("restore_item", {
        blockId: action.data.blockId,
        itemId: action.data.itemId,
      });
      break;
      
    case "rename_block":
      await invoke("rename_block", {
        blockId: action.data.blockId,
        name: action.data.newName,
      });
      break;
      
    case "rename_item":
      await invoke("rename_item", {
        blockId: action.data.blockId,
        itemId: action.data.itemId,
        name: action.data.newName,
      });
      break;
      
    case "create_block":
      await invoke("create_block", {
        name: action.data.name,
        color: action.data.color,
        icon: action.data.icon,
      });
      break;
      
    case "move_item":
      await invoke("move_item", {
        from_blockId: action.data.fromBlockId,
        itemId: action.data.itemId,
        to_blockId: action.data.toBlockId,
        toIndex: action.data.toIndex,
      });
      break;
      
    case "collect_all":
      await invoke("collect_all", {
        blockId: action.data.blockId,
      });
      break;
      
    default:
      throw new Error(`不支持重做的操作: ${action.type}`);
  }
  
  // 刷新当前视图
  await refreshCurrentView();
}

// 刷新当前视图
async function refreshCurrentView(): Promise<void> {
  if (viewState.current === "blocks") {
    await showBlocksView();
  } else if (viewState.current === "desktop") {
    await showDesktopView();
  } else if (viewState.current === "block-detail" && blockState.current) {
    const blocks = await invoke<any[]>("get_blocks");
    const updated = blocks.find(b => b.id === blockState.current!.id);
    if (updated) {
      blockState.current = updated;
      renderBlockDetail();
    } else {
      await showBlocksView();
    }
  }
}
