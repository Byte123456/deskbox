use tauri::Manager;
use crate::config::AppConfig;
use crate::desktop::{self, get_public_desktop, get_user_desktop, scan_directory};
use crate::lnk::{self, DesktopItem, LnkInfo};
use crate::logger;
use crate::storage;

/// Scan both user and public desktop, return all items
#[tauri::command]
pub fn scan_desktop() -> Vec<DesktopItem> {
    let mut all_items = Vec::new();

    let user_desktop = get_user_desktop();
    all_items.extend(scan_directory(&user_desktop));

    let public_desktop = get_public_desktop();
    if public_desktop != user_desktop {
        all_items.extend(scan_directory(&public_desktop));
    }

    all_items
}

/// Get an icon for a specific file path (lazy loading)
#[tauri::command]
pub fn get_icon(path: String, icon_index: Option<i32>) -> Result<String, String> {
    let idx = icon_index.unwrap_or(0);

    if let Some(icon_key) = path.strip_prefix("system://") {
        desktop::get_system_icon_base64(icon_key)
            .ok_or_else(|| format!("Unknown system icon: {icon_key}"))
    } else {
        lnk::extract_icon_base64(&path, idx, true)
    }
}

/// Get display name for a specific file
#[tauri::command]
pub fn get_display_name(path: String) -> String {
    let p = std::path::PathBuf::from(&path);
    lnk::get_display_name(&p)
}

/// Get desktop paths (for info display)
#[tauri::command]
pub fn get_desktop_paths() -> serde_json::Value {
    serde_json::json!({
        "user": get_user_desktop().to_string_lossy(),
        "public": get_public_desktop().to_string_lossy(),
    })
}

// ---- Collect / Restore commands ----

/// Extract icon for an item before it gets moved
fn extract_icon_for_item(path: &std::path::Path, item_type: &str, lnk_info: &Option<LnkInfo>) -> Option<String> {
    if item_type == "shortcut" || item_type == "url" {
        if let Some(ref info) = lnk_info {
            let icon_path = if info.icon_location.is_empty() { &info.target_path } else { &info.icon_location };
            if !icon_path.is_empty() {
                return lnk::extract_icon_base64(icon_path, info.icon_index, true).ok();
            }
        }
    }
    // Fallback: try the file path itself
    lnk::extract_icon_base64(&path.to_string_lossy(), 0, true).ok()
}

/// Collect a single desktop item: move it to storage and record in config
#[tauri::command]
pub fn collect_item(path: String, block_id: Option<String>) -> Result<serde_json::Value, String> {
    let item_path = std::path::PathBuf::from(&path);

    // Parse lnk/url info and extract icon BEFORE moving
    let lnk_info = lnk::parse_item(&item_path);
    let name = lnk::get_display_name(&item_path);
    let item_type = if item_path.is_dir() {
        "directory"
    } else {
        let ext = item_path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()).unwrap_or_default();
        match ext.as_str() {
            "lnk" => "shortcut",
            "url" => "url",
            _ => "file",
        }
    };
    let icon_base64 = extract_icon_for_item(&item_path, &item_type, &lnk_info);

    // Move the file to storage
    let storage_path = storage::collect_item(&path)?;
    logger::info(&format!("收纳: {} → {}", name, storage_path));

    // Update config — use specified block or default
    let mut config = AppConfig::load();
    let bid = block_id.unwrap_or_else(|| config.default_block().id.clone());
    config.add_item(&bid, path, storage_path, name, item_type.to_string(), lnk_info, icon_base64);
    config.save()?;

    let config = AppConfig::load();
    let block = config.blocks.iter().find(|b| b.id == bid).unwrap();
    let item = block.items.last().unwrap();

    Ok(serde_json::json!({ "id": item.id, "block_id": bid }))
}

/// Collect ALL desktop items at once into a specified (or default) block
#[tauri::command]
pub fn collect_all(block_id: Option<String>) -> Result<serde_json::Value, String> {
    let items = scan_desktop();
    let mut collected = 0;
    let mut errors = Vec::new();

    let mut config = AppConfig::load();
    let bid = block_id.unwrap_or_else(|| config.default_block().id.clone());

    for item in &items {
        let item_path = std::path::PathBuf::from(&item.path);
        let lnk_info = item.lnk_info.clone();
        let name = item.name.clone();
        let item_type = item.item_type.clone();
        let icon_base64 = extract_icon_for_item(&item_path, &item_type, &lnk_info);

        match storage::collect_item(&item.path) {
            Ok(storage_path) => {
                config.add_item(&bid, item.path.clone(), storage_path, name, item_type, lnk_info, icon_base64);
                collected += 1;
            }
            Err(e) => { errors.push(format!("{}: {e}", item.name)); }
        }
    }

    config.save()?;

    Ok(serde_json::json!({
        "collected": collected,
        "total": items.len(),
        "errors": errors,
    }))
}

/// Restore a single item from storage back to the desktop
#[tauri::command]
pub fn restore_item(block_id: String, item_id: String) -> Result<(), String> {
    let mut config = AppConfig::load();

    let item = config
        .remove_item(&block_id, &item_id)
        .ok_or_else(|| format!("物品不存在: {item_id}"))?;

    // Restore the file
    logger::info(&format!("还原: {} → {}", item.name, item.original_path));
    match storage::restore_item(&item.storage_path, &item.original_path) {
        Ok(()) => {
            logger::info(&format!("还原成功: {}", item.name));
            config.save()?;
            Ok(())
        }
        Err(e) => {
            logger::error(&format!("还原失败: {} ({})", item.name, e));
            if item.original_path.contains("Public\\Desktop") {
                // Auto-elevate for public desktop
                config.save().ok();
                if elevated_move_files(&[(item.storage_path.clone(), item.original_path.clone())]) {
                    Ok(()) // Elevated operation spawned, consider it done
                } else {
                    // Put item back
                    let mut config2 = AppConfig::load();
                    let block = config2.blocks.iter_mut().find(|b| b.id == block_id).unwrap();
                    block.items.push(item.clone());
                    config2.save().ok();
                    Err("无法启动管理员权限。请以管理员身份运行 DeskBox 后再试。".to_string())
                }
            } else {
                let block = config.blocks.iter_mut().find(|b| b.id == block_id).unwrap();
                block.items.push(item.clone());
                config.save().ok();
                Err(format!("还原失败: {e}"))
            }
        }
    }
}

/// Attempt to run an elevated PowerShell move command
fn elevated_move_files(items: &[(String, String)]) -> bool {
    // Build a PowerShell script that moves all files
    let mut script = String::new();
    for (src, dst) in items {
        script.push_str(&format!(
            "Move-Item -Force -Path '{}' -Destination '{}';\n",
            src.replace('\'', "''"),
            dst.replace('\'', "''")
        ));
    }

    // Write to temp file
    let ps1_path = std::env::temp_dir().join("deskbox_restore.ps1");
    if std::fs::write(&ps1_path, &script).is_err() {
        return false;
    }

    // Spawn PowerShell with elevation
    std::process::Command::new("powershell")
        .args([
            "-Command",
            &format!(
                "Start-Process -Verb RunAs -Wait -FilePath 'powershell' -ArgumentList '-ExecutionPolicy Bypass -File \"{}\"'",
                ps1_path.to_string_lossy()
            ),
        ])
        .spawn()
        .is_ok()
}

/// Restore ALL items from all blocks back to their original locations
#[tauri::command]
pub fn restore_all() -> Result<serde_json::Value, String> {
    let mut config = AppConfig::load();
    let mut restored = 0;
    let mut need_elevation: Vec<(String, String)> = Vec::new();
    let mut errors = Vec::new();

    let all_items: Vec<(String, String, String, String)> = config.blocks.iter().flat_map(|b| {
        b.items.iter().map(|i| (b.id.clone(), i.id.clone(), i.storage_path.clone(), i.original_path.clone()))
    }).collect();

    for (block_id, item_id, storage_path, original_path) in &all_items {
        match storage::restore_item(storage_path, original_path) {
            Ok(()) => {
                let block = config.blocks.iter_mut().find(|b| &b.id == block_id).unwrap();
                block.items.retain(|i| &i.id != item_id);
                restored += 1;
            }
            Err(e) => {
                if original_path.contains("Public\\Desktop") {
                    need_elevation.push((storage_path.clone(), original_path.clone()));
                    // Still remove from config
                    let block = config.blocks.iter_mut().find(|b| &b.id == block_id).unwrap();
                    block.items.retain(|i| &i.id != item_id);
                } else {
                    errors.push(format!("{}: {e}", original_path));
                }
            }
        }
    }

    config.save()?;

    // Auto-elevate for public desktop items
    let mut elevated = 0;
    if !need_elevation.is_empty() {
        if elevated_move_files(&need_elevation) {
            elevated = need_elevation.len();
        }
    }

    Ok(serde_json::json!({
        "restored": restored,
        "elevated": elevated,
        "errors": errors,
        "message": if elevated > 0 {
            format!("已还原 {} 个文件（含 {} 个管理员权限文件）。请查看 UAC 弹窗。", restored, elevated)
        } else {
            format!("已还原 {} 个文件", restored)
        }
    }))
}

/// Get block preview — returns blocks with mini icons (up to 9 items per block)
#[tauri::command]
pub fn get_block_previews() -> Vec<serde_json::Value> {
    let config = AppConfig::load();
    config.blocks.iter().map(|b| {
        let preview_items: Vec<_> = b.items.iter().take(9).map(|i| {
            serde_json::json!({
                "name": i.name,
                "item_type": i.item_type,
                "icon_base64": i.icon_base64,
            })
        }).collect();

        serde_json::json!({
            "id": b.id,
            "name": b.name,
            "color": b.color,
            "icon": b.icon,
            "item_count": b.items.len(),
            "preview_items": preview_items,
        })
    }).collect()
}

/// Delete a stored item (permanently removes it)
#[tauri::command]
pub fn delete_stored_item(block_id: String, item_id: String) -> Result<(), String> {
    let mut config = AppConfig::load();

    let item = config
        .remove_item(&block_id, &item_id)
        .ok_or_else(|| format!("物品不存在: {item_id}"))?;

    // Delete from storage
    storage::delete_stored_item(&item.storage_path)?;

    config.save()?;
    Ok(())
}

/// Get all blocks with their items from config
#[tauri::command]
pub fn get_blocks() -> Vec<serde_json::Value> {
    let config = AppConfig::load();
    config
        .blocks
        .iter()
        .map(|b| {
            serde_json::json!({
                "id": b.id,
                "name": b.name,
                "color": b.color,
                "icon": b.icon,
                "item_count": b.items.len(),
                "items": b.items.iter().map(|i| {
                    serde_json::json!({
                        "id": i.id,
                        "name": i.name,
                        "item_type": i.item_type,
                        "original_path": i.original_path,
                        "storage_path": i.storage_path,
                        "lnk_info": i.lnk_info,
                        "icon_base64": i.icon_base64,
                        "collected_at": i.collected_at,
                    })
                }).collect::<Vec<_>>(),
            })
        })
        .collect()
}

/// Open a file or URL using Windows ShellExecuteW
#[tauri::command]
pub fn open_file(path: String, args: Option<String>, work_dir: Option<String>) -> Result<(), String> {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;
    use windows::core::PCWSTR;

    logger::info(&format!("打开: {} 参数: {:?} 工作目录: {:?}", path, args, work_dir));

    let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let has_args = args.is_some();
    let args_wide: Vec<u16> = args
        .unwrap_or_default()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let has_dir = work_dir.is_some();
    let dir_wide: Vec<u16> = work_dir
        .unwrap_or_default()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let result = ShellExecuteW(
            None,
            PCWSTR::null(),
            PCWSTR::from_raw(path_wide.as_ptr()),
            if has_args { PCWSTR::from_raw(args_wide.as_ptr()) } else { PCWSTR::null() },
            if has_dir { PCWSTR::from_raw(dir_wide.as_ptr()) } else { PCWSTR::null() },
            SW_SHOW,
        );
        let code = result.0 as isize;
        if code <= 32 {
            Err(format!("打开失败，错误码: {}", code))
        } else {
            Ok(())
        }
    }
}

/// Read recent log entries (for debug panel)
#[tauri::command]
pub fn read_log() -> String {
    let log_path = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("DeskBox/deskbox.log");
    std::fs::read_to_string(&log_path).unwrap_or_else(|_| "暂无日志".to_string())
}

/// Get current settings
#[tauri::command]
pub fn get_settings() -> serde_json::Value {
    let config = AppConfig::load();
    serde_json::json!(config.settings)
}

/// Save settings
#[tauri::command]
pub fn save_settings(settings: serde_json::Value) -> Result<(), String> {
    let mut config = AppConfig::load();
    if let Some(v) = settings.get("hotkey") {
        config.settings.hotkey = v.as_str().unwrap_or("Alt+Shift+D").to_string();
    }
    if let Some(v) = settings.get("autostart") {
        config.settings.autostart = v.as_bool().unwrap_or(true);
    }
    if let Some(v) = settings.get("animations") {
        config.settings.animations = v.as_bool().unwrap_or(true);
    }
    if let Some(v) = settings.get("always_on_top") {
        config.settings.always_on_top = v.as_bool().unwrap_or(true);
    }
    config.save()
}

/// Rename a block
#[tauri::command]
pub fn rename_block(block_id: String, name: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    let block = config.blocks.iter_mut()
        .find(|b| b.id == block_id)
        .ok_or_else(|| "方块不存在".to_string())?;
    block.name = name;
    config.save()
}

/// Rename a stored item
#[tauri::command]
pub fn rename_item(block_id: String, item_id: String, name: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    let block = config.blocks.iter_mut()
        .find(|b| b.id == block_id)
        .ok_or_else(|| "方块不存在".to_string())?;
    let item = block.items.iter_mut()
        .find(|i| i.id == item_id)
        .ok_or_else(|| "物品不存在".to_string())?;
    item.name = name;
    config.save()
}

/// Restore all items from a single block only
#[tauri::command]
pub fn restore_block(block_id: String) -> Result<serde_json::Value, String> {
    let mut config = AppConfig::load();
    let block = config.blocks.iter()
        .find(|b| b.id == block_id)
        .ok_or_else(|| "方块不存在".to_string())?;

    let mut restored = 0;
    let mut need_elevation: Vec<(String, String)> = Vec::new();

    for item in &block.items {
        match storage::restore_item(&item.storage_path, &item.original_path) {
            Ok(()) => { restored += 1; }
            Err(_) if item.original_path.contains("Public\\Desktop") => {
                need_elevation.push((item.storage_path.clone(), item.original_path.clone()));
                restored += 1; // Will be handled by elevated process
            }
            Err(e) => { logger::error(&format!("还原失败: {} ({})", item.name, e)); }
        }
    }

    // Clear the block's items
    let block = config.blocks.iter_mut().find(|b| b.id == block_id).unwrap();
    block.items.clear();
    config.save()?;

    // Try elevated restore
    if !need_elevation.is_empty() {
        elevated_move_files(&need_elevation);
    }

    Ok(serde_json::json!({
        "restored": restored,
        "elevated": need_elevation.len(),
    }))
}

/// Reorder blocks
#[tauri::command]
pub fn reorder_blocks(block_ids: Vec<String>) -> Result<(), String> {
    let mut config = AppConfig::load();
    let mut reordered = Vec::new();
    for id in &block_ids {
        if let Some(pos) = config.blocks.iter().position(|b| &b.id == id) {
            reordered.push(config.blocks.remove(pos));
        }
    }
    reordered.append(&mut config.blocks);
    config.blocks = reordered;
    config.save()
}

/// Enable/disable autostart
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    if enable { mgr.enable() } else { mgr.disable() }
        .map_err(|e| format!("{e}"))
}

/// Set window always on top
#[tauri::command]
pub fn set_always_on_top(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(on).map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

/// Change block color
#[tauri::command]
pub fn set_block_color(block_id: String, color: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    let block = config.blocks.iter_mut()
        .find(|b| b.id == block_id)
        .ok_or_else(|| "方块不存在".to_string())?;
    block.color = color;
    config.save()
}

// ---- Drag-Drop Reorder ----

/// Move an item from one position to another (within the same block or between blocks)
#[tauri::command]
pub fn move_item(
    from_block_id: String,
    item_id: String,
    to_block_id: String,
    to_index: usize,
) -> Result<(), String> {
    let mut config = AppConfig::load();

    // Remove item from source block
    let item = config
        .remove_item(&from_block_id, &item_id)
        .ok_or_else(|| format!("物品不存在: {item_id}"))?;

    // Add to destination block at the specified index
    let target_block = config.blocks.iter_mut()
        .find(|b| b.id == to_block_id)
        .ok_or_else(|| format!("目标方块不存在: {to_block_id}"))?;

    let idx = to_index.min(target_block.items.len());
    target_block.items.insert(idx, item);

    config.save()
}

/// Reorder items within a block (sets the full order)
#[tauri::command]
pub fn reorder_items(block_id: String, item_ids: Vec<String>) -> Result<(), String> {
    let mut config = AppConfig::load();
    let block = config.blocks.iter_mut()
        .find(|b| b.id == block_id)
        .ok_or_else(|| format!("方块不存在: {block_id}"))?;

    // Reorder based on the provided ID list
    let mut reordered = Vec::with_capacity(block.items.len());
    for id in &item_ids {
        if let Some(pos) = block.items.iter().position(|i| &i.id == id) {
            reordered.push(block.items.remove(pos));
        }
    }
    // Append any items not in the id list at the end
    reordered.append(&mut block.items);
    block.items = reordered;

    config.save()
}

/// Create a new empty block
#[tauri::command]
pub fn create_block(name: String, color: String, icon: String) -> Result<serde_json::Value, String> {
    let mut config = AppConfig::load();
    let id = format!("block_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0));
    config.blocks.push(crate::config::Block {
        id: id.clone(),
        name,
        color,
        icon,
        items: Vec::new(),
    });
    config.save()?;
    Ok(serde_json::json!({ "id": id }))
}

/// Delete an empty block
#[tauri::command]
pub fn delete_block(block_id: String) -> Result<(), String> {
    let mut config = AppConfig::load();
    if config.blocks.len() <= 1 {
        return Err("至少保留一个方块".to_string());
    }
    let block = config.blocks.iter()
        .find(|b| b.id == block_id)
        .ok_or_else(|| "方块不存在".to_string())?;
    if !block.items.is_empty() {
        return Err("只能删除空方块".to_string());
    }
    config.blocks.retain(|b| b.id != block_id);
    config.save()
}
