use windows::core::{Interface, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    IPersistFile, STGM_READ,
};
use windows::Win32::UI::Shell::{
    IShellLinkW, ShellLink, SHGetFileInfoW, SHFILEINFOW,
    SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON, SHGFI_DISPLAYNAME,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::Foundation::HWND;

/// Information extracted from a .lnk or .url file
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LnkInfo {
    pub target_path: String,
    pub arguments: String,
    pub working_dir: String,
    pub description: String,
    pub icon_location: String,
    pub icon_index: i32,
}

/// A desktop item displayed in the UI
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DesktopItem {
    pub name: String,
    pub path: String,
    pub item_type: String,
    pub lnk_info: Option<LnkInfo>,
    pub icon_base64: Option<String>,
}

/// Parse a .lnk shortcut file
fn parse_lnk_file(path: &std::path::Path) -> Result<LnkInfo, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        // Create IShellLinkW instance via COM
        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("CoCreateInstance: {e}"))?;

        // Open the .lnk file via IPersistFile
        let wide_path: Vec<u16> = path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let persist_file: IPersistFile = shell_link
            .cast()
            .map_err(|e| format!("Cast to IPersistFile: {e}"))?;

        persist_file
            .Load(PCWSTR::from_raw(wide_path.as_ptr()), STGM_READ)
            .map_err(|e| format!("Load: {e}"))?;

        // Resolve the link
        let _ = shell_link.Resolve(HWND(std::ptr::null_mut()), 0);

        // Extract fields — the window-rs API uses &mut [u16] slices
        let mut target_buf = vec![0u16; 260];
        shell_link
            .GetPath(&mut target_buf, std::ptr::null_mut(), 0)
            .map_err(|e| format!("GetPath: {e}"))?;

        let mut args_buf = vec![0u16; 260];
        let _ = shell_link.GetArguments(&mut args_buf);

        let mut desc_buf = vec![0u16; 1024];
        let _ = shell_link.GetDescription(&mut desc_buf);

        let mut work_dir_buf = vec![0u16; 260];
        let _ = shell_link.GetWorkingDirectory(&mut work_dir_buf);

        let mut icon_loc_buf = vec![0u16; 260];
        let mut icon_index: i32 = 0;
        let _ = shell_link.GetIconLocation(&mut icon_loc_buf, &mut icon_index);

        // Convert wide strings to Rust strings
        let target_path = wstr_to_string(&target_buf);
        let arguments = wstr_to_string(&args_buf);
        let description = wstr_to_string(&desc_buf);
        let working_dir = wstr_to_string(&work_dir_buf);
        let icon_location = wstr_to_string(&icon_loc_buf);

        let (icon_loc, icon_idx) = if icon_location.is_empty() {
            (target_path.clone(), 0)
        } else {
            (icon_location, icon_index)
        };

        Ok(LnkInfo {
            target_path,
            arguments,
            working_dir,
            description,
            icon_location: icon_loc,
            icon_index: icon_idx,
        })
    }
}

/// Parse a .url (internet shortcut) file
fn parse_url_file(path: &std::path::Path) -> Result<LnkInfo, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("read .url: {e}"))?;

    let mut url = String::new();
    let mut icon_file = String::new();
    let mut icon_index: i32 = 0;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('[') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            match key.to_lowercase().as_str() {
                "url" => url = value.to_string(),
                "iconfile" => icon_file = value.to_string(),
                "iconindex" => icon_index = value.parse::<i32>().unwrap_or(0),
                _ => {}
            }
        }
    }

    Ok(LnkInfo {
        target_path: url,
        arguments: String::new(),
        working_dir: String::new(),
        description: String::new(),
        icon_location: icon_file,
        icon_index,
    })
}

/// Parse any supported desktop shortcut (.lnk, .url)
pub fn parse_item(path: &std::path::Path) -> Option<LnkInfo> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "lnk" => parse_lnk_file(path).ok(),
        "url" => parse_url_file(path).ok(),
        _ => None,
    }
}

/// Extract an icon from a file as base64 PNG data URI
pub fn extract_icon_base64(
    file_path: &str,
    _icon_index: i32,
    large: bool,
) -> Result<String, String> {
    unsafe {
        let path_wide: Vec<u16> = file_path
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut shfi = SHFILEINFOW::default();
        let mut flags = SHGFI_ICON;
        if large {
            flags |= SHGFI_LARGEICON;
        } else {
            flags |= SHGFI_SMALLICON;
        }

        let result = SHGetFileInfoW(
            PCWSTR::from_raw(path_wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );

        if result == 0 || shfi.hIcon.is_invalid() {
            return Err("Icon not found".to_string());
        }

        icon_handle_to_base64(shfi.hIcon, large)
    }
}

/// Convert an HICON to a base64 PNG data URI via GDI
unsafe fn icon_handle_to_base64(
    hicon: windows::Win32::UI::WindowsAndMessaging::HICON,
    large: bool,
) -> Result<String, String> {
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, SelectObject,
        CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        GetDC, ReleaseDC, HGDIOBJ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DrawIconEx, GetSystemMetrics,
        SM_CXICON, SM_CYICON, SM_CXSMICON, SM_CYSMICON,
    };

    let cx_icon = if large {
        GetSystemMetrics(SM_CXICON)
    } else {
        GetSystemMetrics(SM_CXSMICON)
    };
    let cy_icon = if large {
        GetSystemMetrics(SM_CYICON)
    } else {
        GetSystemMetrics(SM_CYSMICON)
    };

    let hdc_screen = GetDC(None);
    if hdc_screen.is_invalid() {
        return Err("GetDC failed".to_string());
    }

    let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
    if hdc_mem.is_invalid() {
        let _ = ReleaseDC(None, hdc_screen);
        return Err("CreateCompatibleDC failed".to_string());
    }

    // Create 32-bit top-down DIB section
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: cx_icon,
            biHeight: -cy_icon, // negative = top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default(); 1],
    };

    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    let hbmp_result = CreateDIBSection(Some(hdc_mem), &bmi, DIB_RGB_COLORS, &mut bits, None, 0);

    let hbmp = match hbmp_result {
        Ok(h) if !h.is_invalid() && !bits.is_null() => h,
        _ => {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);
            return Err("CreateDIBSection failed".to_string());
        }
    };

    let old_bmp = SelectObject(hdc_mem, HGDIOBJ(hbmp.0));

    // Draw the icon onto the DIB
    let _ = DrawIconEx(
        hdc_mem,
        0, 0,
        hicon,
        cx_icon, cy_icon,
        0,
        None,
        windows::Win32::UI::WindowsAndMessaging::DI_NORMAL,
    );

    // Read BGRA pixels from the DIB
    let size = (cx_icon * cy_icon * 4) as usize;
    let pixels = std::slice::from_raw_parts(bits as *const u8, size).to_vec();

    // Restore and clean up
    SelectObject(hdc_mem, old_bmp);
    let _ = DeleteObject(HGDIOBJ(hbmp.0));
    let _ = DeleteDC(hdc_mem);
    let _ = ReleaseDC(None, hdc_screen);

    encode_bgra_to_png_base64(&pixels, cx_icon as u32, cy_icon as u32)
}

/// Convert BGRA pixels → base64 PNG data URI
fn encode_bgra_to_png_base64(pixels: &[u8], width: u32, height: u32) -> Result<String, String> {
    use base64::Engine;

    // BGRA → RGBA
    let mut rgba = Vec::with_capacity(pixels.len());
    for chunk in pixels.chunks(4) {
        if chunk.len() == 4 {
            rgba.push(chunk[2]); // R ← B
            rgba.push(chunk[1]); // G
            rgba.push(chunk[0]); // B ← R
            rgba.push(chunk[3]); // A
        }
    }

    let mut png_data = Vec::new();
    {
        let mut encoder =
            png::Encoder::new(std::io::Cursor::new(&mut png_data), width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("PNG header: {e}"))?;
        writer
            .write_image_data(&rgba)
            .map_err(|e| format!("PNG write: {e}"))?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Get a human-readable display name for a file
pub fn get_display_name(path: &std::path::Path) -> String {
    unsafe {
        let wide_path: Vec<u16> = path
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut shfi = SHFILEINFOW::default();
        let result = SHGetFileInfoW(
            PCWSTR::from_raw(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_DISPLAYNAME,
        );

        if result != 0 {
            let display_name = wstr_to_string(&shfi.szDisplayName);
            if !display_name.is_empty() {
                return display_name;
            }
        }
    }

    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

/// Helper: convert null-terminated UTF-16 slice to Rust String
fn wstr_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}
