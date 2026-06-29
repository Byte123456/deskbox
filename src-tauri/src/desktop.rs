use crate::lnk::{self, DesktopItem};
use std::path::PathBuf;

/// Get the user's desktop directory path
pub fn get_user_desktop() -> PathBuf {
    // Try to get from environment variable first
    if let Ok(home) = std::env::var("USERPROFILE") {
        let desktop = PathBuf::from(home).join("Desktop");
        if desktop.exists() {
            return desktop;
        }
    }

    // Fallback: try OneDrive desktop
    if let Ok(home) = std::env::var("USERPROFILE") {
        let onedrive_desktop = PathBuf::from(home)
            .join("OneDrive")
            .join("Desktop");
        if onedrive_desktop.exists() {
            return onedrive_desktop;
        }
    }

    // Last fallback
    PathBuf::from(r"C:\Users\Public\Desktop")
}

/// Get the public desktop directory path
pub fn get_public_desktop() -> PathBuf {
    PathBuf::from(r"C:\Users\Public\Desktop")
}

/// Determine the item type based on file extension and attributes
fn classify_item(path: &std::path::Path) -> String {
    if path.is_dir() {
        return "directory".to_string();
    }

    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "lnk" => "shortcut".to_string(),
        "url" => "url".to_string(),
        _ => "file".to_string(),
    }
}

/// Get a generic icon for a system folder (This PC, Recycle Bin, etc.)
/// We identify these by their special CLSID in the desktop.ini or by name
pub fn get_system_icon_base64(icon_name: &str) -> Option<String> {
    // These are standard Windows shell icon indices in imageres.dll / shell32.dll
    let (dll, index) = match icon_name {
        "this_pc" => (r"C:\Windows\System32\imageres.dll", 109),
        "recycle_bin" => (r"C:\Windows\System32\imageres.dll", 55),
        "recycle_bin_full" => (r"C:\Windows\System32\imageres.dll", 54),
        "network" => (r"C:\Windows\System32\imageres.dll", 25),
        "control_panel" => (r"C:\Windows\System32\imageres.dll", 27),
        _ => return None,
    };

    lnk::extract_icon_base64(dll, index, true).ok()
}

/// Scan a directory for desktop items
pub fn scan_directory(dir: &PathBuf) -> Vec<DesktopItem> {
    let mut items = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return items,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        // Skip hidden files (like desktop.ini)
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') || name == "desktop.ini" {
                continue;
            }
        }

        let item_type = classify_item(&path);
        let display_name = lnk::get_display_name(&path);

        // Parse LNK or URL info
        let lnk_info = match item_type.as_str() {
            "shortcut" | "url" => lnk::parse_item(&path),
            _ => None,
        };

        // Get icon as base64
        let icon_base64 = if item_type == "shortcut" || item_type == "url" {
            // For shortcuts, extract icon from the target file
            if let Some(ref info) = lnk_info {
                let icon_path = if info.icon_location.is_empty() {
                    &info.target_path
                } else {
                    &info.icon_location
                };
                if !icon_path.is_empty() {
                    lnk::extract_icon_base64(icon_path, info.icon_index, true).ok()
                } else {
                    // Generic icon for items without a specific icon
                    get_fallback_icon(&item_type)
                }
            } else {
                get_fallback_icon(&item_type)
            }
        } else if item_type == "directory" {
            // Use folder icon from shell32.dll
            lnk::extract_icon_base64(
                r"C:\Windows\System32\shell32.dll",
                3,
                true,
            ).ok()
        } else {
            // Regular file - get its associated icon
            lnk::extract_icon_base64(
                &path.to_string_lossy(),
                0,
                true,
            ).ok()
        };

        items.push(DesktopItem {
            name: display_name,
            path: path.to_string_lossy().to_string(),
            item_type,
            lnk_info,
            icon_base64,
        });
    }

    // Sort: directories first, then shortcuts/urls, then files
    items.sort_by(|a, b| {
        let type_order = |t: &str| match t {
            "directory" => 0,
            "shortcut" => 1,
            "url" => 2,
            _ => 3,
        };
        let ord_a = type_order(&a.item_type);
        let ord_b = type_order(&b.item_type);
        if ord_a != ord_b {
            ord_a.cmp(&ord_b)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    items
}

/// Get a fallback icon for items whose icon can't be extracted
fn get_fallback_icon(item_type: &str) -> Option<String> {
    let dll = r"C:\Windows\System32\imageres.dll";
    let index = match item_type {
        "shortcut" => 15,   // Shortcut arrow icon
        "url" => 14,         // Globe/Internet icon
        "file" => 2,         // Generic document icon
        _ => 3,              // Folder icon
    };
    lnk::extract_icon_base64(dll, index, true).ok()
}

/// Check if a path is a known system icon (This PC, Recycle Bin, etc.)
/// These are registry-based and don't exist as real files on the desktop
pub fn is_system_icon(name: &str) -> bool {
    matches!(
        name,
        "This PC" | "此电脑" | "Recycle Bin" | "回收站" |
        "Network" | "网络" | "Control Panel" | "控制面板"
    )
}

/// Get system desktop icons info (these are managed via registry, not files)
pub fn get_system_icons() -> Vec<DesktopItem> {
    let mut items = Vec::new();

    // These are the standard Windows system desktop icons
    let system_icons = [
        ("此电脑", "this_pc"),
        ("回收站", "recycle_bin"),
        ("网络", "network"),
        ("控制面板", "control_panel"),
    ];

    for (name, icon_key) in &system_icons {
        let icon_base64 = get_system_icon_base64(icon_key);
        items.push(DesktopItem {
            name: name.to_string(),
            path: format!("system://{}", icon_key),
            item_type: "system".to_string(),
            lnk_info: None,
            icon_base64,
        });
    }

    items
}
