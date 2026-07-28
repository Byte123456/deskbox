use crate::commands;
use crate::config::{AppConfig, Block, OrganizeRule};
use crate::lnk::{DesktopItem, LnkInfo};
use crate::{logger, storage};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Clone)]
struct Rule {
    category: String,
    emoji: String,
    color: String,
    exact_executables: Vec<String>,
    product_names: Vec<String>,
    path_patterns: Vec<String>,
    strong_phrases: Vec<String>,
    weak_words: Vec<String>,
    exclude_phrases: Vec<String>,
}

#[derive(Clone)]
struct Fingerprint {
    exe: &'static str,
    category: &'static str,
    products: &'static [&'static str],
    publishers: &'static [&'static str],
    paths: &'static [&'static str],
}

const FINGERPRINTS: &[Fingerprint] = &[
    Fingerprint { exe: "code.exe", category: "开发", products: &["visual studio code"], publishers: &["microsoft corporation"], paths: &["microsoft vs code"] },
    Fingerprint { exe: "devenv.exe", category: "开发", products: &["microsoft visual studio"], publishers: &["microsoft corporation"], paths: &["visual studio"] },
    Fingerprint { exe: "idea64.exe", category: "开发", products: &["intellij idea"], publishers: &["jetbrains"], paths: &["jetbrains"] },
    Fingerprint { exe: "pycharm64.exe", category: "开发", products: &["pycharm"], publishers: &["jetbrains"], paths: &["jetbrains"] },
    Fingerprint { exe: "steam.exe", category: "游戏", products: &["steam"], publishers: &["valve"], paths: &["\\steam\\"] },
    Fingerprint { exe: "wechat.exe", category: "通讯", products: &["wechat", "微信"], publishers: &["tencent"], paths: &["wechat"] },
    Fingerprint { exe: "discord.exe", category: "通讯", products: &["discord"], publishers: &["discord inc."], paths: &["discord"] },
    Fingerprint { exe: "obs64.exe", category: "影音", products: &["obs studio"], publishers: &["obs project"], paths: &["obs-studio"] },
    Fingerprint { exe: "chrome.exe", category: "浏览器", products: &["google chrome"], publishers: &["google llc"], paths: &["google\\chrome"] },
    Fingerprint { exe: "msedge.exe", category: "浏览器", products: &["microsoft edge"], publishers: &["microsoft corporation"], paths: &["microsoft\\edge"] },
    Fingerprint { exe: "notion.exe", category: "办公", products: &["notion"], publishers: &["notion labs"], paths: &["notion"] },
];

const WEAK_ONLY: &[&str] = &["studio", "client", "manager", "assistant", "launcher", "center", "hub", "tool", "player", "desktop", "service", "app", "pro", "ai", "pr", "ps", "ae"];

const DEFAULTS: &[(&str, &str, &str, &[&str], &[&str], &[&str], &[&str], &[&str])] = &[
    ("游戏", "🎮", "#f87070", &["steam.exe", "epicgameslauncher.exe"], &["Steam", "Epic Games Launcher", "Minecraft"], &["\\Steam\\", "\\Riot Games\\", "\\Epic Games\\"], &["steam", "epic games", "minecraft", "原神", "英雄联盟", "永劫无间"], &["game", "xbox", "dota", "pubg"]),
    ("影音", "🎬", "#f09060", &["vlc.exe", "potplayermini64.exe", "obs64.exe"], &["VLC media player", "PotPlayer", "OBS Studio"], &["\\VideoLAN\\", "\\PotPlayer\\", "\\obs-studio\\"], &["media player", "video player", "腾讯视频", "爱奇艺", "bilibili"], &["video", "player", "直播"]),
    ("音乐", "🎵", "#c070f0", &["spotify.exe", "cloudmusic.exe", "foobar2000.exe"], &["Spotify", "网易云音乐", "foobar2000"], &["\\Spotify\\", "\\CloudMusic\\"], &["qq音乐", "网易云音乐", "music player"], &["music", "音乐", "伴奏"]),
    ("浏览器", "🌐", "#40c0e0", &["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe"], &["Google Chrome", "Microsoft Edge", "Mozilla Firefox", "Brave"], &["\\Google\\Chrome\\", "\\Microsoft\\Edge\\", "\\Mozilla Firefox\\"], &["web browser", "internet browser"], &["browser", "浏览器"]),
    ("办公", "💼", "#70d6a0", &["winword.exe", "excel.exe", "powerpnt.exe", "notion.exe"], &["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Notion"], &["\\Microsoft Office\\", "\\Notion\\", "\\WPS Office\\"], &["office suite", "remote desktop", "企业微信", "飞书", "钉钉"], &["office", "document", "notion", "日历", "邮箱"]),
    ("通讯", "💬", "#7c8cf8", &["wechat.exe", "qq.exe", "discord.exe", "telegram.exe", "slack.exe"], &["WeChat", "Discord", "Telegram", "Slack"], &["\\Tencent\\", "\\Discord\\", "\\Telegram Desktop\\", "\\Slack\\"], &["instant messaging", "video conference"], &["wechat", "微信", "telegram", "discord", "slack", "通讯"]),
    ("开发", "🔧", "#4ec9b0", &["code.exe", "devenv.exe", "idea64.exe", "pycharm64.exe", "git-bash.exe"], &["Visual Studio Code", "Microsoft Visual Studio", "IntelliJ IDEA", "PyCharm"], &["\\JetBrains\\", "\\Microsoft VS Code\\", "\\Git\\", "\\Docker\\"], &["developer tools", "development environment", "source control", "visual studio"], &["code", "terminal", "compiler", "git", "docker"]),
    ("设计", "🎨", "#f0c040", &["photoshop.exe", "illustrator.exe", "figma.exe", "blender.exe"], &["Adobe Photoshop", "Adobe Illustrator", "Figma", "Blender"], &["\\Adobe\\", "\\Figma\\", "\\Blender Foundation\\"], &["graphic design", "video editor", "adobe creative cloud"], &["photoshop", "illustrator", "figma", "blender", "剪映"]),
    ("网盘", "📁", "#80c040", &["onedrive.exe", "baidunetdisk.exe", "dropbox.exe"], &["Microsoft OneDrive", "百度网盘", "Dropbox"], &["\\OneDrive\\", "\\BaiduNetdisk\\", "\\Dropbox\\"], &["cloud drive", "cloud storage", "百度网盘", "阿里云盘"], &["网盘", "onedrive", "dropbox"]),
    ("安全", "🔒", "#808080", &["huoronginternetsecurity.exe", "ccleaner64.exe"], &["Windows Defender", "CCleaner"], &["\\Huorong\\", "\\Windows Defender\\"], &["internet security", "antivirus", "windows defender"], &["安全", "杀毒", "防火墙", "cleaner"]),
];

fn norm(s: &str) -> String { s.trim().to_lowercase() }
fn exact(value: &str, options: &[String]) -> bool { let v = norm(value); !v.is_empty() && options.iter().any(|x| norm(x) == v) }
fn contains_phrase(text: &str, phrase: &str) -> bool { !phrase.trim().is_empty() && norm(text).contains(&norm(phrase)) }
fn word_match(text: &str, word: &str) -> bool {
    norm(text).split(|c: char| !c.is_alphanumeric()).any(|part| part == norm(word))
}

pub fn software_identity(info: &LnkInfo) -> Option<String> {
    let exe = norm(&info.exe_name);
    let product = norm(&info.product_name);
    let company = norm(&info.company_name);
    if exe.is_empty() && product.is_empty() {
        let target = norm(&info.target_path);
        if let Some(rest) = target.strip_prefix("steam://rungameid/") {
            let appid = rest.split(|c: char| !c.is_ascii_digit()).next().unwrap_or("");
            if !appid.is_empty() {
                return Some(format!("steam_{:x}", Sha256::digest(appid.as_bytes())));
            }
        }
        return None;
    }
    let raw = format!("{exe}|{product}|{company}");
    Some(format!("{:x}", Sha256::digest(raw.as_bytes())))
}

fn create_rules(custom: &[OrganizeRule]) -> Vec<Rule> {
    if custom.is_empty() {
        DEFAULTS.iter().map(|(c, e, color, exes, products, paths, strong, weak)| Rule {
            category: (*c).into(), emoji: (*e).into(), color: (*color).into(),
            exact_executables: exes.iter().map(|x| (*x).into()).collect(),
            product_names: products.iter().map(|x| (*x).into()).collect(),
            path_patterns: paths.iter().map(|x| (*x).into()).collect(),
            strong_phrases: strong.iter().map(|x| (*x).into()).collect(),
            weak_words: weak.iter().map(|x| (*x).into()).collect(),
            exclude_phrases: Vec::new(),
        }).collect()
    } else {
        custom.iter().map(|r| Rule {
            category: r.category.clone(), emoji: r.emoji.clone(), color: r.color.clone(),
            exact_executables: r.exact_executables.clone(), product_names: r.product_names.clone(),
            path_patterns: r.path_patterns.clone(), strong_phrases: r.strong_phrases.clone(),
            weak_words: if r.weak_words.is_empty() { r.keywords.clone() } else { r.weak_words.clone() },
            exclude_phrases: r.exclude_phrases.clone(),
        }).collect()
    }
}

fn score(item: &DesktopItem, rule: &Rule) -> (i32, Vec<String>) {
    let info = item.lnk_info.as_ref();
    let target = info.map(|i| i.target_path.as_str()).unwrap_or(&item.path);
    let exe = info.map(|i| i.exe_name.as_str()).unwrap_or_default();
    let product = info.map(|i| i.product_name.as_str()).unwrap_or_default();
    let company = info.map(|i| i.company_name.as_str()).unwrap_or_default();
    let description = info.map(|i| i.file_description.as_str()).unwrap_or_default();
    let icon_loc = info.map(|i| i.icon_location.as_str()).unwrap_or_default();
    let all = format!("{} {} {} {} {} {}", item.name, product, company, description, target, icon_loc);
    let search_path = format!("{} {}", target, icon_loc);
    if rule.exclude_phrases.iter().any(|p| contains_phrase(&all, p)) { return (-100, vec!["命中排除条件".into()]); }
    let mut points = 0;
    let mut reasons = Vec::new();
    if exact(exe, &rule.exact_executables) { points += 100; reasons.push(format!("exe 精确匹配 {exe}")); }
    if exact(product, &rule.product_names) { points += 90; reasons.push(format!("产品名称精确匹配 {product}")); }
    if rule.path_patterns.iter().any(|p| contains_phrase(&search_path, p)) { points += 70; reasons.push("安装路径匹配".into()); }
    if rule.strong_phrases.iter().any(|p| contains_phrase(&all, p)) { points += 30; reasons.push("可靠短语匹配".into()); }
    for word in &rule.weak_words {
        if word_match(&all, word) {
            let weak = WEAK_ONLY.iter().any(|w| norm(w) == norm(word));
            points += if weak { 2 } else { 10 };
        }
    }
    (points, reasons)
}

fn fingerprint_scores(item: &DesktopItem, scores: &mut HashMap<String, (i32, Vec<String>)>) {
    let Some(info) = &item.lnk_info else { return; };
    for fp in FINGERPRINTS {
        let exe = norm(&info.exe_name);
        let product = norm(&info.product_name);
        let company = norm(&info.company_name);
        let target = norm(&info.target_path);
        let icon_loc = norm(&info.icon_location);
        let search_path = format!("{} {}", target, icon_loc);
        let exe_hit = !exe.is_empty() && exe == fp.exe;
        let product_hit = fp.products.iter().any(|v| product == *v);
        let publisher_hit = fp.publishers.iter().any(|v| company.contains(v));
        let path_hit = fp.paths.iter().any(|v| search_path.contains(&norm(v)));
        let entry = scores.entry(fp.category.into()).or_default();
        if exe_hit { entry.0 += 100; entry.1.push("本地软件库 exe 命中".into()); }
        if product_hit { entry.0 += 90; entry.1.push("本地软件库产品命中".into()); }
        if path_hit { entry.0 += 70; entry.1.push("本地软件库路径命中".into()); }
        if publisher_hit && product_hit { entry.0 += 60; entry.1.push("发布商与产品组合命中".into()); }
    }
}

#[tauri::command]
pub fn auto_organize() -> Result<serde_json::Value, String> {
    logger::info("自动整理开始");
    let desktop_items = commands::scan_desktop();
    let mut config = AppConfig::load();
    let rules = create_rules(&config.organize_rules.clone());
    let mut organized = 0u32;
    let mut skipped = 0u32;
    let mut created_blocks = Vec::new();
    let mut suggestions = Vec::new();

    for item in &desktop_items {
        let override_category = item.lnk_info.as_ref().and_then(software_identity)
            .and_then(|id| config.user_overrides.get(&id).cloned());
        let mut scores: HashMap<String, (i32, Vec<String>)> = HashMap::new();
        for rule in &rules { scores.insert(rule.category.clone(), score(item, rule)); }
        fingerprint_scores(item, &mut scores);
        if let Some(category) = override_category {
            let entry = scores.entry(category).or_default();
            entry.0 += 200; entry.1.push("用户历史选择".into());
        }
        let mut ranked: Vec<_> = scores.into_iter().collect();
        ranked.sort_by(|a, b| b.1.0.cmp(&a.1.0));
        let Some(best) = ranked.first() else { skipped += 1; continue; };
        let second_score = ranked.get(1).map(|x| x.1.0).unwrap_or(0);
        if best.1.0 >= 80 && best.1.0 - second_score >= 30 {
            if let Some(rule) = rules.iter().find(|r| r.category == best.0) {
                let bid = find_or_create_block(&mut config, rule, &mut created_blocks);
                match storage::collect_item(&item.path) {
                    Ok(storage_path) => { config.add_item(&bid, item.path.clone(), storage_path, item.name.clone(), item.item_type.clone(), item.lnk_info.clone(), item.icon_base64.clone()); organized += 1; }
                    Err(e) => { skipped += 1; logger::warn(&format!("自动整理失败 {}: {e}", item.name)); }
                }
            }
        } else {
            skipped += 1;
            let confidence = if best.1.0 >= 80 { "可能" } else { "未知" };
            suggestions.push(serde_json::json!({
                "name": item.name, "status": confidence, "suggested_category": best.0,
                "alternative_category": ranked.get(1).map(|x| x.0.clone()),
                "score": best.1.0, "reasons": best.1.1,
            }));
        }
    }
    config.save()?;
    Ok(serde_json::json!({
        "organized": organized, "skipped": skipped, "total": desktop_items.len(),
        "created_blocks": created_blocks, "suggestions": suggestions,
        "message": format!("已可靠整理 {} 个图标，{} 个不确定项目保留在桌面", organized, skipped),
    }))
}

fn find_or_create_block(config: &mut AppConfig, rule: &Rule, created: &mut Vec<String>) -> String {
    if let Some(b) = config.blocks.iter().find(|b| b.name == rule.category) { return b.id.clone(); }
    let id = format!("block_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    config.blocks.push(Block { id: id.clone(), name: rule.category.clone(), color: rule.color.clone(), icon: rule.emoji.clone(), items: Vec::new() });
    created.push(rule.category.clone()); id
}

#[tauri::command]
pub fn get_organize_rules() -> Result<Vec<serde_json::Value>, String> {
    let config = AppConfig::load();
    Ok(create_rules(&config.organize_rules).into_iter().map(|r| serde_json::json!({
        "category": r.category, "emoji": r.emoji, "color": r.color,
        "exact_executables": r.exact_executables, "product_names": r.product_names,
        "path_patterns": r.path_patterns, "strong_phrases": r.strong_phrases,
        "weak_words": r.weak_words, "exclude_phrases": r.exclude_phrases,
    })).collect())
}

#[tauri::command]
pub fn save_organize_rules(rules: Vec<serde_json::Value>) -> Result<(), String> {
    fn strings(v: &serde_json::Value, key: &str) -> Vec<String> { v.get(key).and_then(|x| x.as_array()).into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect() }
    let mut config = AppConfig::load();
    config.organize_rules = rules.into_iter().filter_map(|v| Some(OrganizeRule {
        category: v.get("category")?.as_str()?.into(), emoji: v.get("emoji")?.as_str()?.into(), color: v.get("color")?.as_str()?.into(),
        keywords: strings(&v, "keywords"), exact_executables: strings(&v, "exact_executables"),
        product_names: strings(&v, "product_names"), path_patterns: strings(&v, "path_patterns"),
        strong_phrases: strings(&v, "strong_phrases"), weak_words: strings(&v, "weak_words"),
        exclude_phrases: strings(&v, "exclude_phrases"),
    })).collect();
    config.save()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(name: &str, exe: &str, product: &str, company: &str, path: &str) -> DesktopItem {
        DesktopItem { name: name.into(), path: "x.lnk".into(), item_type: "shortcut".into(), icon_base64: None, lnk_info: Some(LnkInfo { target_path: path.into(), arguments: String::new(), working_dir: String::new(), description: String::new(), icon_location: String::new(), icon_index: 0, exe_name: exe.into(), product_name: product.into(), company_name: company.into(), file_description: String::new() }) }
    }
    fn steam_url_item(name: &str, appid: &str, icon: &str) -> DesktopItem {
        DesktopItem { name: name.into(), path: "x.url".into(), item_type: "shortcut".into(), icon_base64: None, lnk_info: Some(LnkInfo { target_path: format!("steam://rungameid/{appid}"), arguments: String::new(), working_dir: String::new(), description: String::new(), icon_location: icon.into(), icon_index: 0, exe_name: String::new(), product_name: String::new(), company_name: String::new(), file_description: String::new() }) }
    }
    #[test] fn code_is_development_by_identity() { let rules=create_rules(&[]); let x=item("Code","Code.exe","Visual Studio Code","Microsoft Corporation",r"C:\Microsoft VS Code\Code.exe"); let dev=rules.iter().find(|r|r.category=="开发").unwrap(); assert!(score(&x,dev).0>=190); }
    #[test] fn weak_studio_cannot_auto_classify() { let rules=create_rules(&[]); let x=item("Studio","launcher.exe","","",r"C:\Apps\Studio\launcher.exe"); assert!(rules.iter().map(|r|score(&x,r).0).max().unwrap()<80); }
    #[test] fn identity_ignores_shortcut_name() { let a=item("Discord","Discord.exe","Discord","Discord Inc.",r"C:\Discord.exe"); let b=item("My Chat","Discord.exe","Discord","Discord Inc.",r"D:\Discord.exe"); assert_eq!(software_identity(a.lnk_info.as_ref().unwrap()),software_identity(b.lnk_info.as_ref().unwrap())); }
    #[test] fn steam_url_classified_as_game() {
        let rules = create_rules(&[]);
        let x = steam_url_item("Dead Cells", "588650", r"D:\steam\steam\games\4937672451bb.ico");
        let game = rules.iter().find(|r| r.category == "游戏").unwrap();
        let (pts, _) = score(&x, game);
        assert!(pts >= 80, "Steam .url game score={pts}, need >=80");
    }
    #[test] fn steam_url_identity_uses_appid() {
        let a = steam_url_item("Dead Cells", "588650", r"D:\steam\steam\games\aaa.ico");
        let b = steam_url_item("Terraria", "105600", r"D:\steam\steam\games\bbb.ico");
        let id_a = software_identity(a.lnk_info.as_ref().unwrap());
        let id_b = software_identity(b.lnk_info.as_ref().unwrap());
        assert!(id_a.is_some(), "Steam .url should have identity");
        assert!(id_b.is_some());
        assert_ne!(id_a, id_b, "Different Steam games must have different identities");
    }
    #[test] fn steam_url_higher_than_other_categories() {
        let rules = create_rules(&[]);
        let x = steam_url_item("Slay the Spire", "646570", r"D:\steam\steam\games\ccc.ico");
        let mut ranked: Vec<_> = rules.iter().map(|r| (r.category.clone(), score(&x, r).0)).collect();
        ranked.sort_by(|a, b| b.1.cmp(&a.1));
        assert_eq!(ranked[0].0, "游戏");
        let gap = ranked[0].1 - ranked[1].1;
        assert!(gap >= 30, "Steam game must dominate: gap={gap}");
    }
}
