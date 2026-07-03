use crate::commands;
use crate::config::{AppConfig, Block, OrganizeRule};
use crate::logger;
use crate::storage;

struct Rule<'a> {
    category: &'a str,
    emoji: &'a str,
    color: &'a str,
    keywords: Vec<String>,
}

fn create_rules(organize_rules: &[OrganizeRule]) -> Vec<Rule> {
    if organize_rules.is_empty() {
        DEFAULT_RULES.iter().map(|(cat, emoji, color, kw)| Rule {
            category: cat,
            emoji,
            color,
            keywords: kw.iter().map(|s| s.to_string()).collect(),
        }).collect()
    } else {
        organize_rules.iter().map(|r| Rule {
            category: &r.category,
            emoji: &r.emoji,
            color: &r.color,
            keywords: r.keywords.clone(),
        }).collect()
    }
}

const DEFAULT_RULES: &[(&str, &str, &str, &[&str])] = &[
    ("游戏", "🎮", "#f87070", &["游戏", "game", "steam", "epic", "原神", "英雄联盟", "lol", "dota",
        "魔兽", "minecraft", "我的世界", "吃鸡", "pubg", "永劫无间", "gta", "cs2",
        "崩坏", "星穹铁道", "绝区零", "genshin", "wuthering", "鸣潮"]),
    ("影音", "🎬", "#f09060", &["视频", "video", "vlc", "potplayer", "播放器", "bilibili",
        "哔哩", "优酷", "爱奇艺", "腾讯视频", "netflix", "暴风影音", "mpc", "nplayer"]),
    ("音乐", "🎵", "#c070f0", &["音乐", "music", "网易云", "qq音乐", "酷狗", "spotify",
        "千千静听", "foobar", "伴奏", "全民k歌"]),
    ("浏览器", "🌐", "#40c0e0", &["浏览器", "chrome", "edge", "firefox", "opera", "brave"]),
    ("办公", "💼", "#70d6a0", &["办公", "office", "word", "excel", "ppt", "wps", "pdf", "文档",
        "笔记", "notion", "企业微信", "wework", "飞书", "lark", "钉钉", "teams",
        "outlook", "日历", "邮箱", "todo", "记事本", "notepad"]),
    ("通讯", "💬", "#7c8cf8", &["微信", "wechat", "qq", "telegram", "discord", "skype",
        "zoom", "slack", "tim", "语音", "yy"]),
    ("开发", "🔧", "#4ec9b0", &["vscode", "visual studio", "idea", "jetbrains", "eclipse",
        "git", "docker", "terminal", "cmd", "putty", "winscp", "postman", "cursor",
        "code", "dev", "sublime", "notepad++", "xshell", "pycharm", "goland",
        "webstorm", "intellij", "android studio"]),
    ("设计", "🎨", "#f0c040", &["photoshop", "premiere", "after effects", "illustrator",
        "figma", "sketch", "blender", "剪映", "capcut", "pr", "ae", "ai", "ps", "lr",
        "达芬奇", "davinci", "lightroom", "indesign", "xd"]),
    ("网盘", "📁", "#80c040", &["网盘", "百度网盘", "阿里云盘", "onedrive", "dropbox",
        "google drive", "夸克", "迅雷", "115"]),
    ("安全", "🔒", "#808080", &["安全", "杀毒", "防火墙", "管家", "360", "火绒", "卡巴斯基",
        "defender", "cleaner", "ccleaner"]),
];

fn matches_rule(name: &str, target_path: &str, keywords: &[String]) -> bool {
    let lower_name = name.to_lowercase();
    let lower_target = target_path.to_lowercase();
    keywords.iter().any(|kw| {
        let k = kw.to_lowercase();
        lower_name.contains(&k) || lower_target.contains(&k)
    })
}

fn get_rules(config: &AppConfig) -> Vec<Rule> {
    create_rules(&config.organize_rules)
}

#[tauri::command]
pub fn auto_organize() -> Result<serde_json::Value, String> {
    logger::info("自动整理开始");
    let desktop_items = commands::scan_desktop();
    let mut config = AppConfig::load();
    let org_rules = config.organize_rules.clone();
    let rules = create_rules(&org_rules);
    let mut organized = 0u32;
    let mut skipped = 0u32;
    let mut created_blocks: Vec<String> = Vec::new();

    for item in &desktop_items {
        let target = item.lnk_info.as_ref()
            .map(|l| l.target_path.as_str())
            .unwrap_or(&item.path);

        let matched = rules.iter().find(|r| matches_rule(&item.name, target, &r.keywords));
        if let Some(rule) = matched {
            let bid = find_or_create_block(&mut config, rule, &mut created_blocks);
            match storage::collect_item(&item.path) {
                Ok(storage_path) => {
                    config.add_item(&bid, item.path.clone(), storage_path,
                        item.name.clone(), item.item_type.clone(),
                        item.lnk_info.clone(), item.icon_base64.clone());
                    organized += 1;
                }
                Err(e) => {
                    skipped += 1;
                    logger::warn(&format!("自动整理失败 {}: {e}", item.name));
                }
            }
        } else {
            skipped += 1;
        }
    }

    config.save()?;
    let result = serde_json::json!({
        "organized": organized, "skipped": skipped, "total": desktop_items.len(),
        "created_blocks": created_blocks,
        "message": format!("已整理 {} 个图标到 {} 个分类，{} 个未识别保留在桌面",
            organized, created_blocks.len(), skipped),
    });
    Ok(result)
}

fn find_or_create_block(config: &mut AppConfig, rule: &Rule, created: &mut Vec<String>) -> String {
    let existing = config.blocks.iter().find(|b| b.name == rule.category);
    if let Some(b) = existing { return b.id.clone(); }
    let id = format!("block_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    config.blocks.push(Block {
        id: id.clone(), name: rule.category.to_string(),
        color: rule.color.to_string(), icon: rule.emoji.to_string(), items: Vec::new(),
    });
    created.push(rule.category.to_string());
    id
}

#[tauri::command]
pub fn get_organize_rules() -> Result<Vec<serde_json::Value>, String> {
    let config = AppConfig::load();
    let rules = if config.organize_rules.is_empty() {
        DEFAULT_RULES.iter().map(|(cat, emoji, color, kw)| serde_json::json!({
            "category": cat, "emoji": emoji, "color": color,
            "keywords": kw.to_vec(),
        })).collect()
    } else {
        config.organize_rules.iter().map(|r| serde_json::json!({
            "category": r.category, "emoji": r.emoji, "color": r.color,
            "keywords": r.keywords,
        })).collect()
    };
    Ok(rules)
}

#[tauri::command]
pub fn save_organize_rules(rules: Vec<serde_json::Value>) -> Result<(), String> {
    let mut config = AppConfig::load();
    config.organize_rules = rules.into_iter().filter_map(|v| {
        Some(OrganizeRule {
            category: v.get("category")?.as_str()?.to_string(),
            emoji: v.get("emoji")?.as_str()?.to_string(),
            color: v.get("color")?.as_str()?.to_string(),
            keywords: v.get("keywords")?.as_array()?.iter()
                .filter_map(|k| k.as_str().map(String::from)).collect(),
        })
    }).collect();
    config.save()
}