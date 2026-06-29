mod commands;
mod config;
mod desktop;
mod lnk;
mod logger;
mod storage;
mod system_icons;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

#[tauri::command]
fn get_status() -> String {
    "DeskBox 服务运行中".to_string()
}

fn toggle_window(app: &tauri::AppHandle) {
    logger::debug(&format!("toggle_window called"));
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
            let _ = window.emit("toggle-window", false);
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("toggle-window", true);
        }
    }
}

fn register_hotkey(app: &tauri::AppHandle, shortcut: Shortcut) -> Result<String, String> {
    logger::info(&format!("注册热键: {:?}", shortcut));
    let app_handle = app.clone();
    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                toggle_window(&app_handle);
            }
        })
        .map_err(|e| format!("{e}"))?;
    Ok(format!("{:?}", shortcut))
}

fn parse_shortcut_str(s: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = s.split('+').collect();
    let mut modifiers = Modifiers::empty();
    let mut key: Option<Code> = None;

    for part in parts {
        match part.trim().to_lowercase().as_str() {
            "alt" => modifiers |= Modifiers::ALT,
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "win" | "meta" | "super" => modifiers |= Modifiers::META,
            "space" => key = Some(Code::Space),
            "escape" | "esc" => key = Some(Code::Escape),
            "enter" | "return" => key = Some(Code::Enter),
            "tab" => key = Some(Code::Tab),
            "backspace" => key = Some(Code::Backspace),
            "delete" => key = Some(Code::Delete),
            "f1" => key = Some(Code::F1),
            "f2" => key = Some(Code::F2),
            "f3" => key = Some(Code::F3),
            "f4" => key = Some(Code::F4),
            "f5" => key = Some(Code::F5),
            "f6" => key = Some(Code::F6),
            "f7" => key = Some(Code::F7),
            "f8" => key = Some(Code::F8),
            "f9" => key = Some(Code::F9),
            "f10" => key = Some(Code::F10),
            "f11" => key = Some(Code::F11),
            "f12" => key = Some(Code::F12),
            s if s.len() == 1 => {
                let ch = s.chars().next()?.to_ascii_uppercase();
                key = match ch {
                    'A' => Some(Code::KeyA), 'B' => Some(Code::KeyB),
                    'C' => Some(Code::KeyC), 'D' => Some(Code::KeyD),
                    'E' => Some(Code::KeyE), 'F' => Some(Code::KeyF),
                    'G' => Some(Code::KeyG), 'H' => Some(Code::KeyH),
                    'I' => Some(Code::KeyI), 'J' => Some(Code::KeyJ),
                    'K' => Some(Code::KeyK), 'L' => Some(Code::KeyL),
                    'M' => Some(Code::KeyM), 'N' => Some(Code::KeyN),
                    'O' => Some(Code::KeyO), 'P' => Some(Code::KeyP),
                    'Q' => Some(Code::KeyQ), 'R' => Some(Code::KeyR),
                    'S' => Some(Code::KeyS), 'T' => Some(Code::KeyT),
                    'U' => Some(Code::KeyU), 'V' => Some(Code::KeyV),
                    'W' => Some(Code::KeyW), 'X' => Some(Code::KeyX),
                    'Y' => Some(Code::KeyY), 'Z' => Some(Code::KeyZ),
                    '0' => Some(Code::Digit0), '1' => Some(Code::Digit1),
                    '2' => Some(Code::Digit2), '3' => Some(Code::Digit3),
                    '4' => Some(Code::Digit4), '5' => Some(Code::Digit5),
                    '6' => Some(Code::Digit6), '7' => Some(Code::Digit7),
                    '8' => Some(Code::Digit8), '9' => Some(Code::Digit9),
                    _ => None,
                };
            }
            _ => {}
        }
    }

    key.map(|k| Shortcut::new(Some(modifiers), k))
}

#[tauri::command]
fn change_hotkey(app: tauri::AppHandle, hotkey_str: String) -> Result<String, String> {
    let shortcut = parse_shortcut_str(&hotkey_str)
        .ok_or_else(|| format!("无法解析: {hotkey_str}"))?;
    let display = register_hotkey(&app, shortcut)?;
    // Persist to config
    if let Some(mut config) = crate::config::AppConfig::load_opt() {
        config.settings.hotkey = hotkey_str;
        config.save().ok();
    }
    Ok(display)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Single-instance: try to bind a TCP port to detect another instance
    let single_instance_port: u16 = 19833;
    match std::net::TcpListener::bind(("127.0.0.1", single_instance_port)) {
        Ok(listener) => {
            // First instance — spawn a thread to listen for wake-up signals
            std::thread::spawn(move || {
                listener.set_nonblocking(true).ok();
                let mut buf = [0u8; 4];
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Ok((mut stream, _)) = listener.accept() {
                        let _ = std::io::Read::read(&mut stream, &mut buf);
                        // Signal received — need to show the window
                        // We use a global flag file since we can't access Tauri handle here
                        let flag = std::env::var("APPDATA")
                            .map(|p| std::path::PathBuf::from(p).join("DeskBox/.wakeup"))
                            .unwrap_or_else(|_| std::path::PathBuf::from("deskbox_wakeup"));
                        std::fs::write(&flag, "1").ok();
                    }
                }
            });
        }
        Err(_) => {
            // Second instance — tell the first to wake up and exit
            if let Ok(mut stream) = std::net::TcpStream::connect(("127.0.0.1", single_instance_port)) {
                use std::io::Write;
                let _ = stream.write_all(b"wake");
                let _ = stream.flush();
            }
            std::process::exit(0);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::Builder::default().build())
        .setup(|app| {
            logger::info("DeskBox 启动中...");
            // Wakeup signal checker: if another instance signals us, show window
            let wakeup_path = std::env::var("APPDATA")
                .map(|p| std::path::PathBuf::from(p).join("DeskBox/.wakeup"))
                .unwrap_or_else(|_| std::path::PathBuf::from("deskbox_wakeup"));
            let app_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if wakeup_path.exists() {
                    let _ = std::fs::remove_file(&wakeup_path);
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });

            // --- 托盘菜单 ---
            let show_item = MenuItemBuilder::with_id("show", "显示/隐藏").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "设置").build(app)?;
            let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item).item(&settings_item).item(&sep).item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DeskBox - 桌面收纳")
                .menu(&menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up, ..
                    } = event {
                        toggle_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_window(app),
                    "settings" => {
                        let _ = app.get_webview_window("main")
                            .and_then(|w| w.emit("open-settings", ()).ok());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // --- 注册默认热键 ---
            let candidates = vec![
                Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyD),
                Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyD),
            ];
            let mut ok = false;
            for sc in &candidates {
                match register_hotkey(app.handle(), *sc) {
                    Ok(name) => {
                        println!("DeskBox 已启动。热键: {name}");
                        ok = true;
                        break;
                    }
                    Err(e) => eprintln!("  热键尝试失败: {e}"),
                }
            }
            if !ok {
                eprintln!("DeskBox: 未能注册任何全局热键");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    if !w.is_focused().unwrap_or(true) {
                        let _ = w.hide();
                        let _ = w.emit("toggle-window", false);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            change_hotkey,
            commands::scan_desktop,
            commands::open_file,
            commands::get_icon,
            commands::get_display_name,
            commands::get_desktop_paths,
            commands::collect_item,
            commands::collect_all,
            commands::restore_item,
            commands::restore_all,
            commands::get_block_previews,
            commands::delete_stored_item,
            commands::get_blocks,
            commands::get_settings,
            commands::read_log,
            commands::scan_orphaned_files,
            commands::delete_orphaned_file,
            commands::save_settings,
            commands::rename_block,
            commands::rename_item,
            commands::set_block_color,
            commands::restore_block,
            commands::set_autostart,
            commands::set_always_on_top,
            commands::move_item,
            commands::reorder_items,
            commands::reorder_blocks,
            commands::create_block,
            commands::delete_block,
            system_icons::get_system_icons_state,
            system_icons::set_system_icon_visibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeskBox");
}
