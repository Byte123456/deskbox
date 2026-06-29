use std::path::{Path, PathBuf};

/// Get the DeskBox app data directory (create if needed)
pub fn get_app_dir() -> PathBuf {
    let dir = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\Public"))
        .join("DeskBox");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Get the storage directory where collected files are moved
pub fn get_storage_dir() -> PathBuf {
    let dir = get_app_dir().join("storage");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Get the config file path
pub fn get_config_path() -> PathBuf {
    get_app_dir().join("config.json")
}

/// Move a desktop item into storage
/// Returns the new storage path
pub fn collect_item(source_path: &str) -> Result<String, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(format!("文件不存在: {source_path}"));
    }

    let file_name = source.file_name()
        .ok_or_else(|| format!("无效路径: {source_path}"))?;

    let storage_dir = get_storage_dir();
    let dest = storage_dir.join(file_name);

    // Handle name conflicts: append _N before extension
    let dest = unique_path(&dest);

    std::fs::rename(&source, &dest)
        .map_err(|e| format!("移动失败: {e}"))?;

    Ok(dest.to_string_lossy().to_string())
}

/// Restore a file from storage back to the desktop
pub fn restore_item(storage_path: &str, original_path: &str) -> Result<(), String> {
    let source = Path::new(storage_path);
    if !source.exists() {
        return Err(format!("存储文件不存在: {storage_path}"));
    }

    let dest = Path::new(original_path);
    // Ensure parent directory exists
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let dest = unique_path(dest);

    std::fs::rename(&source, &dest)
        .map_err(|e| format!("还原失败: {e}"))?;

    Ok(())
}

/// Delete a file from storage (for "delete" action)
pub fn delete_stored_item(storage_path: &str) -> Result<(), String> {
    let path = Path::new(storage_path);
    if path.exists() {
        std::fs::remove_file(path)
            .or_else(|_| std::fs::remove_dir_all(path))
            .map_err(|e| format!("删除失败: {e}"))?;
    }
    Ok(())
}

/// Generate a unique path if the target already exists
fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let stem = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let parent = path.parent().unwrap_or(Path::new("."));

    for i in 1..1000 {
        let candidate = parent.join(format!("{stem}_{i}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    // Fallback with timestamp
    parent.join(format!("{stem}_{}", std::process::id()))
}

/// Get all files currently in storage
pub fn list_stored_files() -> Vec<PathBuf> {
    let storage_dir = get_storage_dir();
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&storage_dir) {
        for entry in entries.flatten() {
            files.push(entry.path());
        }
    }
    files
}
