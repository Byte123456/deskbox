use windows::core::PCWSTR;
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_DWORD,
};

const SYSTEM_ICONS: &[(&str, &str, &str)] = &[
    ("this_pc", "此电脑", "{20D04FE0-3AEA-1069-A2D8-08002B30309D}"),
    ("recycle_bin", "回收站", "{645FF040-5081-101B-9F08-00AA002F954E}"),
    ("network", "网络", "{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}"),
    ("control_panel", "控制面板", "{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}"),
];

const REG_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel";

fn check_icon_visible(clsid: &str) -> Result<bool, String> {
    unsafe {
        let reg_path_wide: Vec<u16> = REG_PATH.encode_utf16().chain(std::iter::once(0)).collect();
        let mut hkey = std::mem::zeroed();

        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR::from_raw(reg_path_wide.as_ptr()),
            None,
            KEY_READ,
            &mut hkey,
        );
        if result.0 != 0 {
            return Ok(true); // Key doesn't exist → visible
        }

        let clsid_wide: Vec<u16> = clsid.encode_utf16().chain(std::iter::once(0)).collect();
        let mut value: u32 = 0;
        let mut size: u32 = std::mem::size_of::<u32>() as u32;

        let result = RegQueryValueExW(
            hkey,
            PCWSTR::from_raw(clsid_wide.as_ptr()),
            None,
            None,
            Some(&mut value as *mut u32 as *mut u8),
            Some(&mut size),
        );

        let _ = RegCloseKey(hkey);

        if result.0 == 0 {
            Ok(value == 0) // 0 = visible, 1 = hidden
        } else {
            Ok(true)       // Value not set → visible
        }
    }
}

fn set_icon_visible(clsid: &str, visible: bool) -> Result<(), String> {
    unsafe {
        let reg_path_wide: Vec<u16> = REG_PATH.encode_utf16().chain(std::iter::once(0)).collect();
        let mut hkey = std::mem::zeroed();

        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR::from_raw(reg_path_wide.as_ptr()),
            None,
            KEY_WRITE,
            &mut hkey,
        );
        if result.0 != 0 {
            return Err("无法打开注册表键".to_string());
        }

        let clsid_wide: Vec<u16> = clsid.encode_utf16().chain(std::iter::once(0)).collect();
        let value: u32 = if visible { 0 } else { 1 };
        let data = std::slice::from_raw_parts(&value as *const u32 as *const u8, 4);

        let result = RegSetValueExW(
            hkey,
            PCWSTR::from_raw(clsid_wide.as_ptr()),
            None,
            REG_DWORD,
            Some(data),
        );

        let _ = RegCloseKey(hkey);

        if result.0 != 0 {
            return Err("写入注册表失败".to_string());
        }

        // Notify Explorer of the change
        use windows::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG,
        };
        use windows::Win32::Foundation::{WPARAM, LPARAM};
        let _ = SendMessageTimeoutW(
            HWND_BROADCAST,
            0x001A,
            WPARAM(0),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            5000,
            None,
        );
        Ok(())
    }
}

#[tauri::command]
pub fn get_system_icons_state() -> Vec<serde_json::Value> {
    SYSTEM_ICONS
        .iter()
        .map(|(key, name, clsid)| {
            let visible = check_icon_visible(clsid).unwrap_or(true);
            serde_json::json!({
                "key": key,
                "name": name,
                "clsid": clsid,
                "visible": visible,
            })
        })
        .collect()
}

#[tauri::command]
pub fn set_system_icon_visibility(key: String, visible: bool) -> Result<(), String> {
    let icon = SYSTEM_ICONS
        .iter()
        .find(|(k, _, _)| *k == key)
        .ok_or_else(|| format!("未知的系统图标: {key}"))?;
    set_icon_visible(icon.2, visible)
}
