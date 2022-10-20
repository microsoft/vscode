/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use chrono::Local;
use opentelemetry::{
	sdk::trace::{Tracer, TracerProvider},
	trace::{SpanBuilder, Tracer as TraitTracer, TracerProvider as TracerProviderTrait},
};
use std::fmt;
use std::{env, path::Path, sync::Arc};
use std::{
	io::Write,
	sync::atomic::{AtomicU32, Ordering},
};

const NO_COLOR_ENV: &str = "NO_COLOR";

static INSTANCE_COUNTER: AtomicU32 = AtomicU32::new(0);

// Gets a next incrementing number that can be used in logs
pub fn next_counter() -> u32 {
	INSTANCE_COUNTER.fetch_add(1, Ordering::SeqCst)
}

// Log level
#[derive(clap::ArgEnum, PartialEq, Eq, PartialOrd, Clone, Copy, Debug)]
pub enum Level {
	Trace = 0,
	Debug,
	Info,
	Warn,
	Error,
	Critical,
	Off,
}

impl Default for Level {
	fn default() -> Self {
		Level::Info
	}
}

impl fmt::Display for Level {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			Level::Critical => write!(f, "critical"),
			Level::Debug => write!(f, "debug"),
			Level::Error => write!(f, "error"),
			Level::Info => write!(f, "info"),
			Level::Off => write!(f, "off"),
			Level::Trace => write!(f, "trace"),
			Level::Warn => write!(f, "warn"),
		}
	}
}

impl Level {
	pub fn name(&self) -> Option<&str> {
		match self {
			Level::Trace => Some("trace"),
			Level::Debug => Some("debug"),
			Level::Info => Some("info"),
			Level::Warn => Some("warn"),
			Level::Error => Some("error"),
			Level::Critical => Some("critical"),
			Level::Off => None,
		}
	}

	pub fn color_code(&self) -> Option<&str> {
		if env::var(NO_COLOR_ENV).is_ok() || !atty::is(atty::Stream::Stdout) {
			return None;
		}

		match self {
			Level::Trace => None,
			Level::Debug => Some("\x1b[36m"),
			Level::Info => Some("\x1b[35m"),
			Level::Warn => Some("\x1b[33m"),
			Level::Error => Some("\x1b[31m"),
			Level::Critical => Some("\x1b[31m"),
			Level::Off => None,
		}
	}

	pub fn to_u8(self) -> u8 {
		self as u8
	}
}

pub fn new_tunnel_prefix() -> String {
	format!("[tunnel.{}]", next_counter())
}

pub fn new_code_server_prefix() -> String {
	format!("[codeserver.{}]", next_counter())
}

pub fn new_rpc_prefix() -> String {
	format!("[rpc.{}]", next_counter())
}

// Base logger implementation
#[derive(Clone)]
pub struct Logger {
	tracer: Tracer,
	sink: Vec<Box<dyn LogSink>>,
	prefix: Option<String>,
}

// Copy trick from https://stackoverflow.com/a/30353928
pub trait LogSinkClone {
	fn clone_box(&self) -> Box<dyn LogSink>;
}

impl<T> LogSinkClone for T
where
	T: 'static + LogSink + Clone,
{
	fn clone_box(&self) -> Box<dyn LogSink> {
		Box::new(self.clone())
	}
}

pub trait LogSink: LogSinkClone + Sync + Send {
	fn write_log(&self, level: Level, prefix: &str, message: &str);
	fn write_result(&self, message: &str);
}

impl Clone for Box<dyn LogSink> {
	fn clone(&self) -> Box<dyn LogSink> {
		self.clone_box()
	}
}

#[derive(Clone)]
pub struct StdioLogSink {
	level: Level,
}

impl LogSink for StdioLogSink {
	fn write_log(&self, level: Level, prefix: &str, message: &str) {
		if level < self.level {
			return;
		}

		emit(level, prefix, message);
	}

	fn write_result(&self, message: &str) {
		println!("{}", message);
	}
}

#[derive(Clone)]
pub struct FileLogSink {
	level: Level,
	file: Arc<std::sync::Mutex<std::fs::File>>,
}

impl FileLogSink {
	pub fn new(level: Level, path: &Path) -> std::io::Result<Self> {
		let file = std::fs::File::create(path)?;
		Ok(Self {
			level,
			file: Arc::new(std::sync::Mutex::new(file)),
		})
	}
}

impl LogSink for FileLogSink {
	fn write_log(&self, level: Level, prefix: &str, message: &str) {
		if level < self.level {
			return;
		}

		let line = format(level, prefix, message);

		// ignore any errors, not much we can do if logging fails...
		self.file.lock().unwrap().write_all(line.as_bytes()).ok();
	}

	fn write_result(&self, _message: &str) {}
}

impl Logger {
	pub fn test() -> Self {
		Self {
			tracer: TracerProvider::builder().build().tracer("codeclitest"),
			sink: vec![],
			prefix: None,
		}
	}

	pub fn new(tracer: Tracer, level: Level) -> Self {
		Self {
			tracer,
			sink: vec![Box::new(StdioLogSink { level })],
			prefix: None,
		}
	}

	pub fn span(&self, name: &str) -> SpanBuilder {
		self.tracer.span_builder(format!("serverlauncher/{}", name))
	}

	pub fn tracer(&self) -> &Tracer {
		&self.tracer
	}

	pub fn emit(&self, level: Level, message: &str) {
		let prefix = self.prefix.as_deref().unwrap_or("");
		for sink in &self.sink {
			sink.write_log(level, prefix, message);
		}
	}

	pub fn result(&self, message: impl AsRef<str>) {
		for sink in &self.sink {
			sink.write_result(message.as_ref());
		}
	}

	pub fn prefixed(&self, prefix: &str) -> Logger {
		Logger {
			prefix: Some(match &self.prefix {
				Some(p) => format!("{}{} ", p, prefix),
				None => format!("{} ", prefix),
			}),
			..self.clone()
		}
	}

	/// Creates a new logger with the additional log sink added.
	pub fn tee<T>(&self, sink: T) -> Logger
	where
		T: LogSink + 'static,
	{
		let mut new_sinks = self.sink.clone();
		new_sinks.push(Box::new(sink));

		Logger {
			sink: new_sinks,
			..self.clone()
		}
	}

	pub fn get_download_logger<'a>(&'a self, prefix: &'static str) -> DownloadLogger<'a> {
		DownloadLogger {
			prefix,
			logger: self,
		}
	}
}

pub struct DownloadLogger<'a> {
	prefix: &'static str,
	logger: &'a Logger,
}

impl<'a> crate::util::io::ReportCopyProgress for DownloadLogger<'a> {
	fn report_progress(&mut self, bytes_so_far: u64, total_bytes: u64) {
		if total_bytes > 0 {
			self.logger.emit(
				Level::Trace,
				&format!(
					"{} {}/{} ({:.0}%)",
					self.prefix,
					bytes_so_far,
					total_bytes,
					(bytes_so_far as f64 / total_bytes as f64) * 100.0,
				),
			);
		} else {
			self.logger.emit(
				Level::Trace,
				&format!("{} {}/{}", self.prefix, bytes_so_far, total_bytes,),
			);
		}
	}
}

pub fn format(level: Level, prefix: &str, message: &str) -> String {
	let current = Local::now();
	let timestamp = current.format("%Y-%m-%d %H:%M:%S").to_string();

	let name = level.name().unwrap();

	if let Some(c) = level.color_code() {
		format!(
			"\x1b[2m[{}]\x1b[0m {}{}\x1b[0m {}{}\n",
			timestamp, c, name, prefix, message
		)
	} else {
		format!("[{}] {} {}{}\n", timestamp, name, prefix, message)
	}
}

pub fn emit(level: Level, prefix: &str, message: &str) {
	let line = format(level, prefix, message);
	if level == Level::Trace {
		print!("\x1b[2m{}\x1b[0m", line);
	} else {
		print!("{}", line);
	}
}

#[macro_export]
macro_rules! error {
    ($logger:expr, $str:expr) => {
        $logger.emit(log::Level::Error, $str)
     };
     ($logger:expr, $($fmt:expr),+) => {
        $logger.emit(log::Level::Error, &format!($($fmt),+))
     };
 }

#[macro_export]
macro_rules! trace {
     ($logger:expr, $str:expr) => {
         $logger.emit(log::Level::Trace, $str)
     };
     ($logger:expr, $($fmt:expr),+) => {
         $logger.emit(log::Level::Trace, &format!($($fmt),+))
     };
 }

#[macro_export]
macro_rules! debug {
     ($logger:expr, $str:expr) => {
         $logger.emit(log::Level::Debug, $str)
     };
     ($logger:expr, $($fmt:expr),+) => {
         $logger.emit(log::Level::Debug, &format!($($fmt),+))
     };
 }

#[macro_export]
macro_rules! info {
     ($logger:expr, $str:expr) => {
         $logger.emit(log::Level::Info, $str)
     };
     ($logger:expr, $($fmt:expr),+) => {
         $logger.emit(log::Level::Info, &format!($($fmt),+))
     };
 }

#[macro_export]
macro_rules! warning {
     ($logger:expr, $str:expr) => {
         $logger.emit(log::Level::Warn, $str)
     };
     ($logger:expr, $($fmt:expr),+) => {
         $logger.emit(log::Level::Warn, &format!($($fmt),+))
     };
 }

#[macro_export]
macro_rules! span {
	($logger:expr, $span:expr, $func:expr) => {{
		use opentelemetry::trace::TraceContextExt;

		let span = $span.start($logger.tracer());
		let cx = opentelemetry::Context::current_with_span(span);
		let guard = cx.clone().attach();
		let t = $func;

		if let Err(e) = &t {
			cx.span().record_error(e);
		}

		std::mem::drop(guard);

		t
	}};
}

#[macro_export]
macro_rules! spanf {
	($logger:expr, $span:expr, $func:expr) => {{
		use opentelemetry::trace::{FutureExt, TraceContextExt};

		let span = $span.start($logger.tracer());
		let cx = opentelemetry::Context::current_with_span(span);
		let t = $func.with_context(cx.clone()).await;

		if let Err(e) = &t {
			cx.span().record_error(e);
		}

		cx.span().end();

		t
	}};
}
