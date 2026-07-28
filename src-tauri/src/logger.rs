use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_SIZE: u64 = 1024 * 1024;
const MAX_BACKUPS: u32 = 5;
const BATCH_SIZE: usize = 20;
const FLUSH_INTERVAL_SECS: u64 = 5;

static LOGGER: LazyLock<Mutex<Logger>> =
    LazyLock::new(|| Mutex::new(Logger::new()));

struct Logger {
    file: Option<File>,
    buffer: Vec<String>,
    last_flush: SystemTime,
}

impl Logger {
    fn new() -> Self {
        let path = get_log_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        rotate_logs(&path);
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok();
        Self {
            file,
            buffer: Vec::with_capacity(BATCH_SIZE + 4),
            last_flush: SystemTime::now(),
        }
    }

    fn write(&mut self, level: &str, msg: &str) {
        let ts = timestamp();
        self.buffer.push(format!("{ts} [{level}] {msg}\n"));

        let should_flush = self.buffer.len() >= BATCH_SIZE
            || self
                .last_flush
                .elapsed()
                .map_or(true, |d| d.as_secs() >= FLUSH_INTERVAL_SECS);

        if should_flush {
            self.flush_inner();
        }
    }

    fn flush_inner(&mut self) {
        if self.buffer.is_empty() {
            return;
        }
        if let Some(f) = &mut self.file {
            for line in &self.buffer {
                let _ = f.write_all(line.as_bytes());
            }
            let _ = f.flush();
        }
        self.buffer.clear();
        self.last_flush = SystemTime::now();
    }
}

impl Drop for Logger {
    fn drop(&mut self) {
        self.flush_inner();
    }
}

fn rotate_logs(path: &PathBuf) {
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > MAX_LOG_SIZE {
            for i in (1..MAX_BACKUPS).rev() {
                let old = path.with_extension(format!("log.{i}"));
                let new = path.with_extension(format!("log.{}", i + 1));
                if old.exists() {
                    fs::rename(&old, &new).ok();
                }
            }
            fs::rename(path, &path.with_extension("log.1")).ok();
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
    #[cfg(debug_assertions)]
    {
        if let Ok(mut logger) = LOGGER.lock() {
            logger.write("DEBUG", msg);
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = msg;
}

pub fn flush() {
    if let Ok(mut logger) = LOGGER.lock() {
        logger.flush_inner();
    }
}

fn get_log_path() -> PathBuf {
    std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("DeskBox/deskbox.log")
}

fn timestamp() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    let days = secs / 86400;
    let tod = secs % 86400;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    let (year, month, day) = civil_from_days(days as i64);
    format!("{year:04}-{month:02}-{day:02} {h:02}:{m:02}:{s:02}")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
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