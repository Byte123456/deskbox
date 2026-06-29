use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

static LOGGER: LazyLock<Mutex<Logger>> =
    LazyLock::new(|| Mutex::new(Logger::new()));

struct Logger {
    file: Option<File>,
    path: PathBuf,
}

impl Logger {
    fn new() -> Self {
        let path = get_log_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        // Rotate if > 1MB
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() > 1024 * 1024 {
                let old = path.with_extension("old.log");
                fs::rename(&path, &old).ok();
            }
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok();
        Self { file, path }
    }

    fn write(&mut self, level: &str, msg: &str) {
        let now = chrono_now();
        let line = format!("{now} [{level}] {msg}\n");
        if let Some(f) = &mut self.file {
            let _ = f.write_all(line.as_bytes());
            let _ = f.flush();
        }
    }
}

pub fn info(msg: &str) {
    if let Ok(mut logger) = LOGGER.lock() {
        logger.write("INFO", msg);
    }
}

pub fn warn(msg: &str) {
    if let Ok(mut logger) = LOGGER.lock() {
        logger.write("WARN", msg);
    }
}

pub fn error(msg: &str) {
    if let Ok(mut logger) = LOGGER.lock() {
        logger.write("ERROR", msg);
    }
}

pub fn debug(msg: &str) {
    if let Ok(mut logger) = LOGGER.lock() {
        logger.write("DEBUG", msg);
    }
}

fn get_log_path() -> PathBuf {
    std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("DeskBox/deskbox.log")
}

fn chrono_now() -> String {
    use std::time::SystemTime;
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}
