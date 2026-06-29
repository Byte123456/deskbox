use crate::lnk::LnkInfo;
use crate::storage;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Top-level application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    pub blocks: Vec<Block>,
    pub settings: Settings,
}

/// A "block" (navigation box) containing collected items
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub items: Vec<StoredItem>,
}

/// An item stored inside a block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredItem {
    pub id: String,
    pub original_path: String,
    pub storage_path: String,
    pub name: String,
    pub item_type: String,
    pub lnk_info: Option<LnkInfo>,
    pub icon_base64: Option<String>,
    pub collected_at: String,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub hotkey: String,
    pub autostart: bool,
    pub animations: bool,
    pub always_on_top: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey: "Alt+Shift+D".to_string(),
            autostart: true,
            animations: true,
            always_on_top: true,
        }
    }
}

impl AppConfig {
    /// Load config from disk, or create default
    pub fn load() -> Self {
        Self::load_opt().unwrap_or_default()
    }

    /// Load config from disk, return None if file doesn't exist or is corrupt
    pub fn load_opt() -> Option<Self> {
        let path = storage::get_config_path();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                    return Some(config);
                }
            }
            // Try backup if main file is corrupt
            let bak = path.with_extension("json.bak");
            if bak.exists() {
                if let Ok(content) = std::fs::read_to_string(&bak) {
                    if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                        crate::logger::warn("配置从备份恢复");
                        return Some(config);
                    }
                }
            }
        }
        None
    }

    /// Save config to disk atomically
    pub fn save(&self) -> Result<(), String> {
        let path = storage::get_config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建配置目录失败: {e}"))?;
        }
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化失败: {e}"))?;

        // Atomic write: temp → sync → rename → sync dir
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, &content)
            .map_err(|e| format!("写入临时文件失败: {e}"))?;

        // Backup old config if it exists
        if path.exists() {
            let bak = path.with_extension("json.bak");
            std::fs::rename(&path, &bak).ok();
        }

        std::fs::rename(&tmp, &path)
            .map_err(|e| format!("重命名配置失败: {e}"))?;

        Ok(())
    }

    /// Get or create default block
    pub fn default_block(&mut self) -> &mut Block {
        if self.blocks.is_empty() {
            self.blocks.push(Block {
                id: format!("block_{}", generate_id()),
                name: "默认方块".to_string(),
                color: "#7c8cf8".to_string(),
                icon: "📦".to_string(),
                items: Vec::new(),
            });
        }
        &mut self.blocks[0]
    }

    /// Add an item to a block
    pub fn add_item(
        &mut self,
        block_id: &str,
        original_path: String,
        storage_path: String,
        name: String,
        item_type: String,
        lnk_info: Option<LnkInfo>,
        icon_base64: Option<String>,
    ) -> Option<&StoredItem> {
        let block = self.blocks.iter_mut().find(|b| b.id == block_id)?;
        let item = StoredItem {
            id: format!("item_{}", generate_id()),
            original_path,
            storage_path,
            name,
            item_type,
            lnk_info,
            icon_base64,
            collected_at: chrono_now(),
        };
        block.items.push(item);
        block.items.last()
    }

    /// Remove an item from a block and return it
    pub fn remove_item(&mut self, block_id: &str, item_id: &str) -> Option<StoredItem> {
        let block = self.blocks.iter_mut().find(|b| b.id == block_id)?;
        if let Some(pos) = block.items.iter().position(|i| i.id == item_id) {
            Some(block.items.remove(pos))
        } else {
            None
        }
    }

    /// Find which block contains an item
    pub fn find_block_for_item(&self, item_id: &str) -> Option<&Block> {
        self.blocks.iter().find(|b| b.items.iter().any(|i| i.id == item_id))
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            version: 1,
            blocks: vec![Block {
                id: format!("block_{}", generate_id()),
                name: "默认方块".to_string(),
                color: "#7c8cf8".to_string(),
                icon: "📦".to_string(),
                items: Vec::new(),
            }],
            settings: Settings::default(),
        }
    }
}

/// Generate a simple random-ish ID
fn generate_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

/// Get current time as ISO 8601 string
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // Simple ISO 8601 format
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    // Approximate date calculation (good enough for our purposes)
    let (year, month, day) = civil_from_days(days_since_epoch as i64);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

/// Simple date calculation from days since epoch
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    // Algorithm from Howard Hinnant
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
