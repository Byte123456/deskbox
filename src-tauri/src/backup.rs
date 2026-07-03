use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};
use crate::config::AppConfig;
use crate::logger;
use crate::storage;

#[tauri::command]
pub fn export_backup(save_path: String) -> Result<serde_json::Value, String> {
    let config_path = storage::get_config_path();
    let storage_dir = storage::get_storage_dir();

    let file = File::create(&save_path)
        .map_err(|e| format!("创建备份文件失败: {e}"))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let mut item_count: usize = 0;

    if config_path.exists() {
        zip.start_file("config.json", options)
            .map_err(|e| format!("zip error: {e}"))?;
        let content = std::fs::read(&config_path)
            .map_err(|e| format!("读取配置失败: {e}"))?;
        zip.write_all(&content)
            .map_err(|e| format!("zip write: {e}"))?;

        if let Ok(cfg_str) = std::fs::read_to_string(&config_path) {
            if let Ok(cfg) = serde_json::from_str::<AppConfig>(&cfg_str) {
                item_count = cfg.blocks.iter().map(|b| b.items.len()).sum();
            }
        }
    }

    if storage_dir.exists() {
        add_dir_to_zip(&mut zip, &storage_dir, "storage/", options)?;
    }

    zip.finish().map_err(|e| format!("zip finish: {e}"))?;
    logger::info(&format!("备份导出: {} ({} items)", save_path, item_count));

    Ok(serde_json::json!({
        "path": save_path,
        "items": item_count,
    }))
}

#[tauri::command]
pub fn import_backup(zip_path: String) -> Result<serde_json::Value, String> {
    let config_path = storage::get_config_path();
    let storage_dir = storage::get_storage_dir();
    let app_dir = storage::get_app_dir();
    let backup_config = config_path.with_extension("json.preimport");
    let backup_storage = app_dir.join("storage.preimport");

    // Backup current data
    if config_path.exists() {
        fs::rename(&config_path, &backup_config)
            .map_err(|e| format!("备份配置失败: {e}"))?;
    }
    if storage_dir.exists() {
        fs::rename(&storage_dir, &backup_storage)
            .map_err(|e| format!("备份存储失败: {e}"))?;
    }
    fs::create_dir_all(&storage_dir)
        .map_err(|e| format!("创建存储目录失败: {e}"))?;

    let restore = || {
        if backup_config.exists() {
            fs::rename(&backup_config, &config_path).ok();
        }
        if backup_storage.exists() {
            fs::remove_dir_all(&storage_dir).ok();
            fs::rename(&backup_storage, &storage_dir).ok();
        }
    };

    // Extract zip
    let file = File::open(&zip_path)
        .map_err(|e| format!("打开备份文件失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| { restore(); format!("读取zip失败: {e}") })?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| { restore(); format!("zip entry: {e}") })?;
        let name = entry.name().to_string();

        if name == "config.json" {
            let mut content = Vec::new();
            entry.read_to_end(&mut content)
                .map_err(|e| { restore(); format!("读取配置失败: {e}") })?;
            fs::write(&config_path, &content)
                .map_err(|e| { restore(); format!("写入配置失败: {e}") })?;
        } else if let Some(rel_path) = name.strip_prefix("storage/") {
            if rel_path.is_empty() || entry.is_dir() {
                continue;
            }
            let dest = storage_dir.join(rel_path);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| { restore(); format!("创建目录失败: {e}") })?;
            }
            let mut content = Vec::new();
            entry.read_to_end(&mut content)
                .map_err(|e| { restore(); format!("读取文件失败: {e}") })?;
            fs::write(&dest, &content)
                .map_err(|e| { restore(); format!("写入文件失败: {e}") })?;
        }
    }

    // Cleanup backups
    if backup_config.exists() {
        fs::remove_file(&backup_config).ok();
    }
    if backup_storage.exists() {
        fs::remove_dir_all(&backup_storage).ok();
    }

    let item_count = AppConfig::load()
        .blocks.iter()
        .map(|b| b.items.len())
        .sum::<usize>();

    logger::info(&format!("备份导入: {} ({} items)", zip_path, item_count));

    Ok(serde_json::json!({
        "items": item_count,
    }))
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = format!("{}{}", prefix, path.file_name().unwrap().to_string_lossy());

        if path.is_dir() {
            let child_options = SimpleFileOptions::default()
                .compression_method(CompressionMethod::Deflated)
                .unix_permissions(0o755);
            let dir_prefix = if name.ends_with('/') || name.ends_with('\\') {
                name.clone()
            } else {
                format!("{}/", name)
            };
            zip.add_directory(&dir_prefix, child_options)
                .map_err(|e| format!("zip dir: {e}"))?;
            add_dir_to_zip(zip, &path, &dir_prefix, options)?;
        } else if path.is_file() {
            zip.start_file(&name, options)
                .map_err(|e| format!("zip start file {name}: {e}"))?;
            let content = std::fs::read(&path)
                .map_err(|e| format!("read {name}: {e}"))?;
            zip.write_all(&content)
                .map_err(|e| format!("zip write {name}: {e}"))?;
        }
    }

    Ok(())
}