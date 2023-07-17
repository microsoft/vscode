/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use super::paths::{InstalledServer, ServerPaths};
use crate::async_pipe::get_socket_name;
use crate::constants::{
	APPLICATION_NAME, EDITOR_WEB_URL, QUALITYLESS_PRODUCT_NAME, QUALITYLESS_SERVER_NAME,
};
use crate::download_cache::DownloadCache;
use crate::options::{Quality, TelemetryLevel};
use crate::state::LauncherPaths;
use crate::tunnels::paths::{get_server_folder_name, SERVER_FOLDER_NAME};
use crate::update_service::{
	unzip_downloaded_release, Platform, Release, TargetKind, UpdateService,
};
use crate::util::command::{capture_command, kill_tree};
use crate::util::errors::{wrap, AnyError, CodeError, ExtensionInstallFailed, WrappedError};
use crate::util::http::{self, BoxedHttp};
use crate::util::io::SilentCopyProgress;
use crate::util::machine::process_exists;
use crate::{debug, info, log, spanf, trace, warning};
use lazy_static::lazy_static;
use opentelemetry::KeyValue;
use regex::Regex;
use serde::Deserialize;
use std::fs;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::remove_file;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot::Receiver;
use tokio::time::{interval, timeout};

lazy_static! {
	static ref LISTENING_PORT_RE: Regex =
		Regex::new(r"Extension host agent listening on (.+)").unwrap();
	static ref WEB_UI_RE: Regex = Regex::new(r"Web UI available at (.+)").unwrap();
}

#[derive(Clone, Debug, Default)]
pub struct CodeServerArgs {
	pub host: Option<String>,
	pub port: Option<u16>,
	pub socket_path: Option<String>,

	// common argument
	pub telemetry_level: Option<TelemetryLevel>,
	pub log: Option<log::Level>,
	pub accept_server_license_terms: bool,
	pub verbose: bool,
	// extension management
	pub install_extensions: Vec<String>,
	pub uninstall_extensions: Vec<String>,
	pub list_extensions: bool,
	pub show_versions: bool,
	pub category: Option<String>,
	pub pre_release: bool,
	pub force: bool,
	pub start_server: bool,
	// connection tokens
	pub connection_token: Option<String>,
	pub connection_token_file: Option<String>,
	pub without_connection_token: bool,
}

impl CodeServerArgs {
	pub fn log_level(&self) -> log::Level {
		if self.verbose {
			log::Level::Trace
		} else {
			self.log.unwrap_or(log::Level::Info)
		}
	}

	pub fn telemetry_disabled(&self) -> bool {
		self.telemetry_level == Some(TelemetryLevel::Off)
	}

	pub fn command_arguments(&self) -> Vec<String> {
		let mut args = Vec::new();
		if let Some(i) = &self.socket_path {
			args.push(format!("--socket-path={}", i));
		} else {
			if let Some(i) = &self.host {
				args.push(format!("--host={}", i));
			}
			if let Some(i) = &self.port {
				args.push(format!("--port={}", i));
			}
		}

		if let Some(i) = &self.connection_token {
			args.push(format!("--connection-token={}", i));
		}
		if let Some(i) = &self.connection_token_file {
			args.push(format!("--connection-token-file={}", i));
		}
		if self.without_connection_token {
			args.push(String::from("--without-connection-token"));
		}
		if self.accept_server_license_terms {
			args.push(String::from("--accept-server-license-terms"));
		}
		if let Some(i) = self.telemetry_level {
			args.push(format!("--telemetry-level={}", i));
		}
		if let Some(i) = self.log {
			args.push(format!("--log={}", i));
		}

		for extension in &self.install_extensions {
			args.push(format!("--install-extension={}", extension));
		}
		if !&self.install_extensions.is_empty() {
			if self.pre_release {
				args.push(String::from("--pre-release"));
			}
			if self.force {
				args.push(String::from("--force"));
			}
		}
		for extension in &self.uninstall_extensions {
			args.push(format!("--uninstall-extension={}", extension));
		}
		if self.list_extensions {
			args.push(String::from("--list-extensions"));
			if self.show_versions {
				args.push(String::from("--show-versions"));
			}
			if let Some(i) = &self.category {
				args.push(format!("--category={}", i));
			}
		}
		if self.start_server {
			args.push(String::from("--start-server"));
		}
		args
	}
}

/// Base server params that can be `resolve()`d to a `ResolvedServerParams`.
/// Doing so fetches additional information like a commit ID if previously
/// unspecified.
pub struct ServerParamsRaw {
	pub commit_id: Option<String>,
	pub quality: Quality,
	pub code_server_args: CodeServerArgs,
	pub headless: bool,
	pub platform: Platform,
}

/// Server params that can be used to start a VS Code server.
pub struct ResolvedServerParams {
	pub release: Release,
	pub code_server_args: CodeServerArgs,
}

impl ResolvedServerParams {
	fn as_installed_server(&self) -> InstalledServer {
		InstalledServer {
			commit: self.release.commit.clone(),
			quality: self.release.quality,
			headless: self.release.target == TargetKind::Server,
		}
	}
}

impl ServerParamsRaw {
	pub async fn resolve(
		self,
		log: &log::Logger,
		http: BoxedHttp,
	) -> Result<ResolvedServerParams, AnyError> {
		Ok(ResolvedServerParams {
			release: self.get_or_fetch_commit_id(log, http).await?,
			code_server_args: self.code_server_args,
		})
	}

	async fn get_or_fetch_commit_id(
		&self,
		log: &log::Logger,
		http: BoxedHttp,
	) -> Result<Release, AnyError> {
		let target = match self.headless {
			true => TargetKind::Server,
			false => TargetKind::Web,
		};

		if let Some(c) = &self.commit_id {
			return Ok(Release {
				commit: c.clone(),
				quality: self.quality,
				target,
				name: String::new(),
				platform: self.platform,
			});
		}

		UpdateService::new(log.clone(), http)
			.get_latest_commit(self.platform, target, self.quality)
			.await
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct UpdateServerVersion {
	pub name: String,
	pub version: String,
	pub product_version: String,
	pub timestamp: i64,
}

/// Code server listening on a port address.
#[derive(Clone)]
pub struct SocketCodeServer {
	pub commit_id: String,
	pub socket: PathBuf,
	pub origin: Arc<CodeServerOrigin>,
}

/// Code server listening on a socket address.
#[derive(Clone)]
pub struct PortCodeServer {
	pub commit_id: String,
	pub port: u16,
	pub origin: Arc<CodeServerOrigin>,
}

/// A server listening on any address/location.
pub enum AnyCodeServer {
	Socket(SocketCodeServer),
	Port(PortCodeServer),
}

pub enum CodeServerOrigin {
	/// A new code server, that opens the barrier when it exits.
	New(Box<Child>),
	/// An existing code server with a PID.
	Existing(u32),
}

impl CodeServerOrigin {
	pub async fn wait_for_exit(&mut self) {
		match self {
			CodeServerOrigin::New(child) => {
				child.wait().await.ok();
			}
			CodeServerOrigin::Existing(pid) => {
				let mut interval = interval(Duration::from_secs(30));
				while process_exists(*pid) {
					interval.tick().await;
				}
			}
		}
	}

	pub async fn kill(&mut self) {
		match self {
			CodeServerOrigin::New(child) => {
				child.kill().await.ok();
			}
			CodeServerOrigin::Existing(pid) => {
				kill_tree(*pid).await.ok();
			}
		}
	}
}

/// Ensures the given list of extensions are installed on the running server.
async fn do_extension_install_on_running_server(
	start_script_path: &Path,
	extensions: &[String],
	log: &log::Logger,
) -> Result<(), AnyError> {
	if extensions.is_empty() {
		return Ok(());
	}

	debug!(log, "Installing extensions...");
	let command = format!(
		"{} {}",
		start_script_path.display(),
		extensions
			.iter()
			.map(|s| get_extensions_flag(s))
			.collect::<Vec<String>>()
			.join(" ")
	);

	let result = capture_command("bash", &["-c", &command]).await?;
	if !result.status.success() {
		Err(AnyError::from(ExtensionInstallFailed(
			String::from_utf8_lossy(&result.stderr).to_string(),
		)))
	} else {
		Ok(())
	}
}

pub struct ServerBuilder<'a> {
	logger: &'a log::Logger,
	server_params: &'a ResolvedServerParams,
	launcher_paths: &'a LauncherPaths,
	server_paths: ServerPaths,
	http: BoxedHttp,
}

impl<'a> ServerBuilder<'a> {
	pub fn new(
		logger: &'a log::Logger,
		server_params: &'a ResolvedServerParams,
		launcher_paths: &'a LauncherPaths,
		http: BoxedHttp,
	) -> Self {
		Self {
			logger,
			server_params,
			launcher_paths,
			server_paths: server_params
				.as_installed_server()
				.server_paths(launcher_paths),
			http,
		}
	}

	/// Gets any already-running server from this directory.
	pub async fn get_running(&self) -> Result<Option<AnyCodeServer>, AnyError> {
		info!(
			self.logger,
			"Checking {} and {} for a running server...",
			self.server_paths.logfile.display(),
			self.server_paths.pidfile.display()
		);

		let pid = match self.server_paths.get_running_pid() {
			Some(pid) => pid,
			None => return Ok(None),
		};
		info!(self.logger, "Found running server (pid={})", pid);
		if !Path::new(&self.server_paths.logfile).exists() {
			warning!(self.logger, "{} Server is running but its logfile is missing. Don't delete the {} Server manually, run the command '{} prune'.", QUALITYLESS_PRODUCT_NAME, QUALITYLESS_PRODUCT_NAME, APPLICATION_NAME);
			return Ok(None);
		}

		do_extension_install_on_running_server(
			&self.server_paths.executable,
			&self.server_params.code_server_args.install_extensions,
			self.logger,
		)
		.await?;

		let origin = Arc::new(CodeServerOrigin::Existing(pid));
		let contents = fs::read_to_string(&self.server_paths.logfile)
			.expect("Something went wrong reading log file");

		if let Some(port) = parse_port_from(&contents) {
			Ok(Some(AnyCodeServer::Port(PortCodeServer {
				commit_id: self.server_params.release.commit.to_owned(),
				port,
				origin,
			})))
		} else if let Some(socket) = parse_socket_from(&contents) {
			Ok(Some(AnyCodeServer::Socket(SocketCodeServer {
				commit_id: self.server_params.release.commit.to_owned(),
				socket,
				origin,
			})))
		} else {
			Ok(None)
		}
	}

	/// Ensures the server is set up in the configured directory.
	pub async fn setup(&self) -> Result<(), AnyError> {
		debug!(
			self.logger,
			"Installing and setting up {}...", QUALITYLESS_SERVER_NAME
		);

		let update_service = UpdateService::new(self.logger.clone(), self.http.clone());
		let name = get_server_folder_name(
			self.server_params.release.quality,
			&self.server_params.release.commit,
		);

		self.launcher_paths
			.server_cache
			.create(name, |target_dir| async move {
				let tmpdir =
					tempfile::tempdir().map_err(|e| wrap(e, "error creating temp download dir"))?;

				let response = update_service
					.get_download_stream(&self.server_params.release)
					.await?;
				let archive_path = tmpdir.path().join(response.url_path_basename().unwrap());

				info!(
					self.logger,
					"Downloading {} server -> {}",
					QUALITYLESS_PRODUCT_NAME,
					archive_path.display()
				);

				http::download_into_file(
					&archive_path,
					self.logger.get_download_logger("server download progress:"),
					response,
				)
				.await?;

				unzip_downloaded_release(
					&archive_path,
					&target_dir.join(SERVER_FOLDER_NAME),
					SilentCopyProgress(),
				)?;

				Ok(())
			})
			.await?;

		debug!(self.logger, "Server setup complete");

		Ok(())
	}

	pub async fn listen_on_port(&self, port: u16) -> Result<PortCodeServer, AnyError> {
		let mut cmd = self.get_base_command();
		cmd.arg("--start-server")
			.arg("--enable-remote-auto-shutdown")
			.arg(format!("--port={}", port));

		let child = self.spawn_server_process(cmd)?;
		let log_file = self.get_logfile()?;
		let plog = self.logger.prefixed(&log::new_code_server_prefix());

		let (mut origin, listen_rx) =
			monitor_server::<PortMatcher, u16>(child, Some(log_file), plog, false);

		let port = match timeout(Duration::from_secs(8), listen_rx).await {
			Err(e) => {
				origin.kill().await;
				Err(wrap(e, "timed out looking for port"))
			}
			Ok(Err(e)) => {
				origin.kill().await;
				Err(wrap(e, "server exited without writing port"))
			}
			Ok(Ok(p)) => Ok(p),
		}?;

		info!(self.logger, "Server started");

		Ok(PortCodeServer {
			commit_id: self.server_params.release.commit.to_owned(),
			port,
			origin: Arc::new(origin),
		})
	}

	pub async fn listen_on_default_socket(&self) -> Result<SocketCodeServer, AnyError> {
		let requested_file = get_socket_name();
		self.listen_on_socket(&requested_file).await
	}

	pub async fn listen_on_socket(&self, socket: &Path) -> Result<SocketCodeServer, AnyError> {
		Ok(spanf!(
			self.logger,
			self.logger.span("server.start").with_attributes(vec! {
				KeyValue::new("commit_id", self.server_params.release.commit.to_string()),
				KeyValue::new("quality", format!("{}", self.server_params.release.quality)),
			}),
			self._listen_on_socket(socket)
		)?)
	}

	async fn _listen_on_socket(&self, socket: &Path) -> Result<SocketCodeServer, AnyError> {
		remove_file(&socket).await.ok(); // ignore any error if it doesn't exist

		let mut cmd = self.get_base_command();
		cmd.arg("--start-server")
			.arg("--enable-remote-auto-shutdown")
			.arg(format!("--socket-path={}", socket.display()));

		let child = self.spawn_server_process(cmd)?;
		let log_file = self.get_logfile()?;
		let plog = self.logger.prefixed(&log::new_code_server_prefix());

		let (mut origin, listen_rx) =
			monitor_server::<SocketMatcher, PathBuf>(child, Some(log_file), plog, false);

		let socket = match timeout(Duration::from_secs(8), listen_rx).await {
			Err(e) => {
				origin.kill().await;
				Err(wrap(e, "timed out looking for socket"))
			}
			Ok(Err(e)) => {
				origin.kill().await;
				Err(wrap(e, "server exited without writing socket"))
			}
			Ok(Ok(socket)) => Ok(socket),
		}?;

		info!(self.logger, "Server started");

		Ok(SocketCodeServer {
			commit_id: self.server_params.release.commit.to_owned(),
			socket,
			origin: Arc::new(origin),
		})
	}

	/// Starts with a given opaque set of args. Does not set up any port or
	/// socket, but does return one if present, in the form of a channel.
	pub async fn start_opaque_with_args<M, R>(
		&self,
		args: &[String],
	) -> Result<(CodeServerOrigin, Receiver<R>), AnyError>
	where
		M: ServerOutputMatcher<R>,
		R: 'static + Send + std::fmt::Debug,
	{
		let mut cmd = self.get_base_command();
		cmd.args(args);

		let child = self.spawn_server_process(cmd)?;
		let plog = self.logger.prefixed(&log::new_code_server_prefix());

		Ok(monitor_server::<M, R>(child, None, plog, true))
	}

	fn spawn_server_process(&self, mut cmd: Command) -> Result<Child, AnyError> {
		info!(self.logger, "Starting server...");

		debug!(self.logger, "Starting server with command... {:?}", cmd);

		let child = cmd
			.stderr(std::process::Stdio::piped())
			.stdout(std::process::Stdio::piped())
			.spawn()
			.map_err(|e| wrap(e, "error spawning server"))?;

		self.server_paths
			.write_pid(child.id().expect("expected server to have pid"))?;

		Ok(child)
	}

	fn get_logfile(&self) -> Result<File, WrappedError> {
		File::create(&self.server_paths.logfile).map_err(|e| {
			wrap(
				e,
				format!(
					"error creating log file {}",
					self.server_paths.logfile.display()
				),
			)
		})
	}

	fn get_base_command(&self) -> Command {
		#[cfg(not(windows))]
		let mut cmd = Command::new(&self.server_paths.executable);
		#[cfg(windows)]
		let mut cmd = {
			let mut cmd = Command::new("cmd");
			cmd.arg("/Q");
			cmd.arg("/C");
			cmd.arg(&self.server_paths.executable);
			cmd
		};

		cmd.stdin(std::process::Stdio::null())
			.args(self.server_params.code_server_args.command_arguments());
		cmd
	}
}

fn monitor_server<M, R>(
	mut child: Child,
	log_file: Option<File>,
	plog: log::Logger,
	write_directly: bool,
) -> (CodeServerOrigin, Receiver<R>)
where
	M: ServerOutputMatcher<R>,
	R: 'static + Send + std::fmt::Debug,
{
	let stdout = child
		.stdout
		.take()
		.expect("child did not have a handle to stdout");

	let stderr = child
		.stderr
		.take()
		.expect("child did not have a handle to stdout");

	let (listen_tx, listen_rx) = tokio::sync::oneshot::channel();

	// Handle stderr and stdout in a separate task. Initially scan lines looking
	// for the listening port. Afterwards, just scan and write out to the file.
	tokio::spawn(async move {
		let mut stdout_reader = BufReader::new(stdout).lines();
		let mut stderr_reader = BufReader::new(stderr).lines();
		let write_line = |line: &str| -> std::io::Result<()> {
			if let Some(mut f) = log_file.as_ref() {
				f.write_all(line.as_bytes())?;
				f.write_all(&[b'\n'])?;
			}
			if write_directly {
				println!("{}", line);
			} else {
				trace!(plog, line);
			}
			Ok(())
		};

		loop {
			let line = tokio::select! {
				l = stderr_reader.next_line() => l,
				l = stdout_reader.next_line() => l,
			};

			match line {
				Err(e) => {
					trace!(plog, "error reading from stdout/stderr: {}", e);
					return;
				}
				Ok(None) => break,
				Ok(Some(l)) => {
					write_line(&l).ok();

					if let Some(listen_on) = M::match_line(&l) {
						trace!(plog, "parsed location: {:?}", listen_on);
						listen_tx.send(listen_on).ok();
						break;
					}
				}
			}
		}

		loop {
			let line = tokio::select! {
				l = stderr_reader.next_line() => l,
				l = stdout_reader.next_line() => l,
			};

			match line {
				Err(e) => {
					trace!(plog, "error reading from stdout/stderr: {}", e);
					break;
				}
				Ok(None) => break,
				Ok(Some(l)) => {
					write_line(&l).ok();
				}
			}
		}
	});

	let origin = CodeServerOrigin::New(Box::new(child));
	(origin, listen_rx)
}

fn get_extensions_flag(extension_id: &str) -> String {
	format!("--install-extension={}", extension_id)
}

/// A type that can be used to scan stdout from the VS Code server. Returns
/// some other type that, in turn, is returned from starting the server.
pub trait ServerOutputMatcher<R>
where
	R: Send,
{
	fn match_line(line: &str) -> Option<R>;
}

/// Parses a line like "Extension host agent listening on /tmp/foo.sock"
struct SocketMatcher();

impl ServerOutputMatcher<PathBuf> for SocketMatcher {
	fn match_line(line: &str) -> Option<PathBuf> {
		parse_socket_from(line)
	}
}

/// Parses a line like "Extension host agent listening on 9000"
pub struct PortMatcher();

impl ServerOutputMatcher<u16> for PortMatcher {
	fn match_line(line: &str) -> Option<u16> {
		parse_port_from(line)
	}
}

/// Parses a line like "Web UI available at http://localhost:9000/?tkn=..."
pub struct WebUiMatcher();

impl ServerOutputMatcher<reqwest::Url> for WebUiMatcher {
	fn match_line(line: &str) -> Option<reqwest::Url> {
		WEB_UI_RE.captures(line).and_then(|cap| {
			cap.get(1)
				.and_then(|uri| reqwest::Url::parse(uri.as_str()).ok())
		})
	}
}

/// Does not do any parsing and just immediately returns an empty result.
pub struct NoOpMatcher();

impl ServerOutputMatcher<()> for NoOpMatcher {
	fn match_line(_: &str) -> Option<()> {
		Some(())
	}
}

fn parse_socket_from(text: &str) -> Option<PathBuf> {
	LISTENING_PORT_RE
		.captures(text)
		.and_then(|cap| cap.get(1).map(|path| PathBuf::from(path.as_str())))
}

fn parse_port_from(text: &str) -> Option<u16> {
	LISTENING_PORT_RE.captures(text).and_then(|cap| {
		cap.get(1)
			.and_then(|path| path.as_str().parse::<u16>().ok())
	})
}

pub fn print_listening(log: &log::Logger, tunnel_name: &str) {
	debug!(
		log,
		"{} is listening for incoming connections", QUALITYLESS_SERVER_NAME
	);

	let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from(""));
	let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from(""));

	let dir = if home_dir == current_dir {
		PathBuf::from("")
	} else {
		current_dir
	};

	let base_web_url = match EDITOR_WEB_URL {
		Some(u) => u,
		None => return,
	};

	let mut addr = url::Url::parse(base_web_url).unwrap();
	{
		let mut ps = addr.path_segments_mut().unwrap();
		ps.push("tunnel");
		ps.push(tunnel_name);
		for segment in &dir {
			let as_str = segment.to_string_lossy();
			if !(as_str.len() == 1 && as_str.starts_with(std::path::MAIN_SEPARATOR)) {
				ps.push(as_str.as_ref());
			}
		}
	}

	let message = &format!("\nOpen this link in your browser {}\n", addr);
	log.result(message);
}

pub async fn download_cli_into_cache(
	cache: &DownloadCache,
	release: &Release,
	update_service: &UpdateService,
) -> Result<PathBuf, AnyError> {
	let cache_name = format!(
		"{}-{}-{}",
		release.quality, release.commit, release.platform
	);
	let cli_dir = cache
		.create(&cache_name, |target_dir| async move {
			let tmpdir =
				tempfile::tempdir().map_err(|e| wrap(e, "error creating temp download dir"))?;
			let response = update_service.get_download_stream(release).await?;

			let name = response.url_path_basename().unwrap();
			let archive_path = tmpdir.path().join(name);
			http::download_into_file(&archive_path, SilentCopyProgress(), response).await?;
			unzip_downloaded_release(&archive_path, &target_dir, SilentCopyProgress())?;
			Ok(())
		})
		.await?;

	let cli = std::fs::read_dir(cli_dir)
		.map_err(|_| CodeError::CorruptDownload("could not read cli folder contents"))?
		.next();

	match cli {
		Some(Ok(cli)) => Ok(cli.path()),
		_ => {
			let _ = cache.delete(&cache_name);
			Err(CodeError::CorruptDownload("cli directory is empty").into())
		}
	}
}
