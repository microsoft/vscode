/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use ::http::{Request, Response};
use futures::{SinkExt, StreamExt};
use http_body_util::BodyExt;
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto::Builder as ServerBuilder;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::protocol::Role;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use crate::async_pipe::{
	get_socket_name, get_socket_rw_stream, listen_socket_rw_stream, AsyncPipe, AsyncPipeListener,
};
use crate::constants::VSCODE_CLI_QUALITY;
use crate::download_cache::DownloadCache;
use crate::log;
use crate::options::{Quality, TelemetryLevel};
use crate::state::LauncherPaths;
use crate::update_service::{
	unzip_downloaded_release, Platform, Release, TargetKind, UpdateService,
};
use crate::util::command::{kill_tree, new_script_command};
use crate::util::errors::{wrap, AnyError, CodeError};
use crate::util::http::{self, BoxedHttp};
use crate::util::http::{empty_body, full_body, HyperBody};
use crate::util::io::SilentCopyProgress;
use crate::util::sync::{new_barrier, Barrier, BarrierOpener};

use super::agent_host_registry::{
	self, AgentHostEndpointAddress, AgentHostEndpointIdentity, AgentHostEndpointMetadata,
	AgentHostServerType, AGENT_HOST_PROTOCOL_VERSION,
};
use super::idle_timeout;
use super::paths::{get_server_folder_name, SERVER_FOLDER_NAME};
use super::shutdown_signal::ShutdownSignal;

/// How often to check for server updates.
pub const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// How often to re-check whether the server has exited when an update is pending.
pub const UPDATE_POLL_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// How long to wait for the server to signal readiness.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
/// Environment variable carrying the path of the management control
/// socket the CLI is listening on. Read by the agent host server at
/// startup; its presence is what tells the server that it has a managing
/// CLI and may therefore advertise the management RPC method to clients.
pub const MANAGEMENT_SOCKET_ENV: &str = "VSCODE_AGENT_HOST_MANAGEMENT_SOCKET";

/// Environment variable holding a commit SHA used to override the agent
/// host version the *first* time it is resolved. When set, the agent host
/// is initially downloaded and started at this commit; subsequent upgrades
/// still resolve the real latest version. Intended for testing the upgrade
/// flow.
pub const INITIAL_AGENT_HOST_VERSION_ENV: &str = "VSCODE_CLI_INITIAL_AH_VERSION";

/// Reads {@link INITIAL_AGENT_HOST_VERSION_ENV}, returning the commit SHA
/// override if it is set to a non-empty value. The value is restricted to
/// hex digits so it can't smuggle path separators (`/`, `..`) or other
/// characters into the URL and filesystem paths derived from the commit.
fn initial_agent_host_version() -> Option<String> {
	match std::env::var(INITIAL_AGENT_HOST_VERSION_ENV) {
		Ok(v) => {
			let v = v.trim();
			if !v.is_empty() && v.chars().all(|c| c.is_ascii_hexdigit()) {
				Some(v.to_string())
			} else {
				None
			}
		}
		_ => None,
	}
}

/// Delay between sending the upgrade response and actually killing the
/// running server. Lets the response hop back through the CLI proxy and
/// reach the requesting client before the transport drops out from under
/// it, so the user sees the "upgrading" status before reconnect kicks in.
const UPGRADE_KILL_DELAY: Duration = Duration::from_secs(3);

/// Configuration for the agent host server process.
#[derive(Clone, Debug)]
pub struct AgentHostConfig {
	pub server_data_dir: Option<String>,
	pub telemetry_level: Option<TelemetryLevel>,
	pub without_connection_token: bool,
	pub connection_token: Option<String>,
	pub connection_token_file: Option<String>,
}

/// State of the running VS Code server process.
struct RunningServer {
	child: tokio::process::Child,
	commit: String,
}

/// Manages the VS Code server lifecycle: on-demand start, auto-restart
/// after idle shutdown, and background update checking.
pub struct AgentHostManager {
	log: log::Logger,
	config: AgentHostConfig,
	platform: Platform,
	cache: DownloadCache,
	update_service: UpdateService,
	/// The latest known release, with the time it was checked.
	latest_release: Mutex<Option<(Instant, Release)>>,
	/// The currently running server, if any.
	running: Mutex<Option<RunningServer>>,
	/// Barrier that opens when a server is ready (socket path available).
	/// Reset each time a new server is started.
	ready: Mutex<Option<Barrier<Result<PathBuf, String>>>>,
	/// Path of the management control socket. Generated up-front; cheap.
	/// Spawned servers receive this via {@link MANAGEMENT_SOCKET_ENV} and
	/// dial it to forward client-initiated upgrade requests back to us.
	management_socket_path: PathBuf,
	/// Guards spawning the management listener so it only starts once,
	/// even if multiple server starts race.
	management_listener_started: AtomicBool,
	/// Guards the upgrade pipeline so concurrent `POST /upgrade` requests
	/// don't each spawn their own kill+restart task and trip over each
	/// other. Set once download completes and the kill is scheduled;
	/// cleared by the spawned task once the restart attempt finishes.
	upgrade_in_progress: AtomicBool,
}

impl AgentHostManager {
	pub fn new(
		log: log::Logger,
		platform: Platform,
		cache: DownloadCache,
		http: BoxedHttp,
		config: AgentHostConfig,
	) -> Arc<Self> {
		Arc::new(Self {
			update_service: UpdateService::new(log.clone(), http),
			log,
			config,
			platform,
			cache,
			latest_release: Mutex::new(None),
			running: Mutex::new(None),
			ready: Mutex::new(None),
			management_socket_path: get_socket_name(),
			management_listener_started: AtomicBool::new(false),
			upgrade_in_progress: AtomicBool::new(false),
		})
	}

	/// Returns an endpoint to a running agent host, starting one if needed.
	async fn ensure_server(self: &Arc<Self>) -> Result<PathBuf, CodeError> {
		// Fast path: if we already have a barrier, wait on it
		{
			let ready = self.ready.lock().await;
			if let Some(barrier) = &*ready {
				if barrier.is_open() {
					// Check if the process is still running
					let running = self.running.lock().await;
					if running.is_some() {
						return barrier
							.clone()
							.wait()
							.await
							.unwrap()
							.map_err(CodeError::ServerDownloadError);
					}
				} else {
					// Still starting up, wait for it
					let mut barrier = barrier.clone();
					drop(ready);
					return barrier
						.wait()
						.await
						.unwrap()
						.map_err(CodeError::ServerDownloadError);
				}
			}
		}

		// Need to start a new server
		self.start_server().await
	}

	/// Starts the server with the latest already-downloaded version.
	/// Only blocks on a network fetch if no version has been downloaded yet.
	async fn start_server(self: &Arc<Self>) -> Result<PathBuf, CodeError> {
		// Every managed agent host gets a management listener: the
		// listener is what makes server upgrades possible, and every
		// AgentHostManager-managed server can be upgraded. Idempotent so
		// concurrent first-starts don't race two listeners.
		self.ensure_management_listener();

		let (release, server_dir) = self.get_cached_or_download().await?;

		let (mut barrier, opener) = new_barrier::<Result<PathBuf, String>>();
		{
			let mut ready = self.ready.lock().await;
			*ready = Some(barrier.clone());
		}

		let self_clone = self.clone();
		let release_clone = release.clone();
		tokio::spawn(async move {
			self_clone
				.run_server(release_clone, server_dir, opener)
				.await;
		});

		barrier
			.wait()
			.await
			.unwrap()
			.map_err(CodeError::ServerDownloadError)
	}

	/// Runs the server process to completion, handling readiness signaling.
	async fn run_server(
		self: &Arc<Self>,
		release: Release,
		server_dir: PathBuf,
		opener: BarrierOpener<Result<PathBuf, String>>,
	) {
		let executable = if let Some(p) = option_env!("VSCODE_CLI_OVERRIDE_SERVER_PATH") {
			PathBuf::from(p)
		} else {
			server_dir
				.join(SERVER_FOLDER_NAME)
				.join("bin")
				.join(release.quality.server_entrypoint())
		};

		let agent_host_socket = get_socket_name();
		let mut cmd = new_script_command(&executable);
		cmd.stdin(std::process::Stdio::null());
		cmd.stderr(std::process::Stdio::piped());
		cmd.stdout(std::process::Stdio::piped());
		cmd.arg("--socket-path");
		cmd.arg(get_socket_name());
		cmd.arg("--agent-host-path");
		cmd.arg(&agent_host_socket);
		cmd.args([
			"--start-server",
			"--accept-server-license-terms",
			"--enable-remote-auto-shutdown",
		]);

		if let Some(a) = &self.config.server_data_dir {
			cmd.arg("--server-data-dir");
			cmd.arg(a);
		}
		if let Some(level) = self.config.telemetry_level {
			cmd.arg("--telemetry-level");
			cmd.arg(level.to_string());
		}
		if self.config.without_connection_token {
			cmd.arg("--without-connection-token");
		}
		if let Some(ct) = &self.config.connection_token_file {
			cmd.arg("--connection-token-file");
			cmd.arg(ct);
		}
		cmd.env(MANAGEMENT_SOCKET_ENV, &self.management_socket_path);
		cmd.env_remove("VSCODE_DEV");

		let mut child = match cmd.spawn() {
			Ok(c) => c,
			Err(e) => {
				opener.open(Err(e.to_string()));
				return;
			}
		};

		let commit_prefix = &release.commit[..release.commit.len().min(7)];
		let (mut stdout, mut stderr) = (
			BufReader::new(child.stdout.take().unwrap()).lines(),
			BufReader::new(child.stderr.take().unwrap()).lines(),
		);

		// Wait for readiness with a timeout
		let mut opener = Some(opener);
		let socket_path = agent_host_socket.clone();
		let startup_deadline = tokio::time::sleep(STARTUP_TIMEOUT);
		tokio::pin!(startup_deadline);

		let mut ready = false;
		loop {
			tokio::select! {
				Ok(Some(l)) = stdout.next_line() => {
					debug!(self.log, "[{} stdout]: {}", commit_prefix, l);
					if !ready && l.contains("Agent host server listening on") {
						ready = true;
						if let Some(o) = opener.take() {
							o.open(Ok(socket_path.clone()));
						}
					}
				}
				Ok(Some(l)) = stderr.next_line() => {
					debug!(self.log, "[{} stderr]: {}", commit_prefix, l);
				}
				_ = &mut startup_deadline, if !ready => {
					warning!(self.log, "[{}]: Server did not become ready within {}s", commit_prefix, STARTUP_TIMEOUT.as_secs());
					// Don't fail — the server may still start up, just slowly
					if let Some(o) = opener.take() {
						o.open(Ok(socket_path.clone()));
					}
					ready = true;
				}
				e = child.wait() => {
					info!(self.log, "[{} process]: exited: {:?}", commit_prefix, e);
					if let Some(o) = opener.take() {
						o.open(Err(format!("Server exited before ready: {e:?}")));
					}
					// Child has already exited; don't store it in `running`,
					// otherwise the manager would be wedged with a dead child
					// forever and ensure_server() would never restart.
					return;
				}
			}

			if ready {
				break;
			}
		}

		// Store the running server state
		{
			let mut running = self.running.lock().await;
			*running = Some(RunningServer {
				child,
				commit: release.commit.clone(),
			});
		}

		info!(self.log, "[{}]: Server ready", commit_prefix);

		// Continue reading output until the process exits
		let log = self.log.clone();
		let commit_prefix = commit_prefix.to_string();
		let self_clone = self.clone();
		tokio::spawn(async move {
			loop {
				tokio::select! {
					Ok(Some(l)) = stdout.next_line() => {
						debug!(log, "[{} stdout]: {}", commit_prefix, l);
					}
					Ok(Some(l)) = stderr.next_line() => {
						debug!(log, "[{} stderr]: {}", commit_prefix, l);
					}
					else => break,
				}
			}

			// Server process has exited (auto-shutdown or crash)
			info!(log, "[{}]: Server process ended", commit_prefix);
			let mut running = self_clone.running.lock().await;
			if let Some(r) = &*running {
				if r.commit == commit_prefix || r.commit.starts_with(&commit_prefix) {
					*running = None;
				}
			}
		});
	}

	/// Returns a release and its local directory. Prefers the latest known
	/// release if it has already been downloaded; otherwise falls back to any
	/// cached version. Only fetches from the network and downloads if
	/// nothing is cached at all.
	async fn get_cached_or_download(&self) -> Result<(Release, PathBuf), CodeError> {
		// When using a dev override, skip the update service entirely -
		// the override path is used directly by run_server().
		if option_env!("VSCODE_CLI_OVERRIDE_SERVER_PATH").is_some() {
			let release = Release {
				name: String::new(),
				commit: String::from("dev"),
				platform: self.platform,
				target: TargetKind::Server,
				quality: Quality::Insiders,
			};
			return Ok((release, PathBuf::new()));
		}

		// Best case: the latest known release is already downloaded
		if let Some((_, release)) = &*self.latest_release.lock().await {
			let name = get_server_folder_name(release.quality, &release.commit);
			if let Some(dir) = self.cache.exists(&name) {
				return Ok((release.clone(), dir));
			}
		}

		// On the very first resolution, an explicit initial version override
		// (used to test the upgrade flow) must win over the generic cached
		// fallback below so the requested commit is what we download and start.
		if self.latest_release.lock().await.is_none() && initial_agent_host_version().is_some() {
			let release = self.get_latest_release().await?;
			let dir = self.ensure_downloaded(&release).await?;
			return Ok((release, dir));
		}

		let quality = VSCODE_CLI_QUALITY
			.ok_or(CodeError::UpdatesNotConfigured("no configured quality"))
			.and_then(|q| {
				Quality::try_from(q).map_err(|_| CodeError::UpdatesNotConfigured("unknown quality"))
			})?;

		// Fall back to any cached version (still instant, just not the newest).
		// Cache entries are named "<quality>-<commit>" via get_server_folder_name.
		for entry in self.cache.get() {
			if let Some(dir) = self.cache.exists(&entry) {
				let (entry_quality, commit) = match entry.split_once('-') {
					Some((q, c)) => match Quality::try_from(q.to_lowercase().as_str()) {
						Ok(parsed) => (parsed, c.to_string()),
						Err(_) => (quality, entry.clone()),
					},
					None => (quality, entry.clone()),
				};
				let release = Release {
					name: String::new(),
					commit,
					platform: self.platform,
					target: TargetKind::Server,
					quality: entry_quality,
				};
				return Ok((release, dir));
			}
		}

		// Nothing cached — must fetch and download (blocks the first connection)
		info!(self.log, "No cached server version, downloading latest...");
		let release = self.get_latest_release().await?;
		let dir = self.ensure_downloaded(&release).await?;
		Ok((release, dir))
	}

	/// Ensures the release is downloaded, returning the server directory.
	pub async fn ensure_downloaded(&self, release: &Release) -> Result<PathBuf, CodeError> {
		let cache_name = get_server_folder_name(release.quality, &release.commit);
		if let Some(dir) = self.cache.exists(&cache_name) {
			return Ok(dir);
		}

		info!(self.log, "Downloading server {}", release.commit);
		let release = release.clone();
		let log = self.log.clone();
		let update_service = self.update_service.clone();
		self.cache
			.create(&cache_name, |target_dir| async move {
				let tmpdir = tempfile::tempdir().unwrap();
				let response = update_service.get_download_stream(&release).await?;
				let name = response.url_path_basename().unwrap();
				let archive_path = tmpdir.path().join(name);
				http::download_into_file(
					&archive_path,
					log.get_download_logger("Downloading server:"),
					response,
				)
				.await?;
				let server_dir = target_dir.join(SERVER_FOLDER_NAME);
				unzip_downloaded_release(&archive_path, &server_dir, SilentCopyProgress())?;
				Ok(())
			})
			.await
			.map_err(|e| CodeError::ServerDownloadError(e.to_string()))
	}

	/// Gets the latest release, caching the result.
	pub async fn get_latest_release(&self) -> Result<Release, CodeError> {
		let mut latest = self.latest_release.lock().await;
		let now = Instant::now();

		let quality = VSCODE_CLI_QUALITY
			.ok_or(CodeError::UpdatesNotConfigured("no configured quality"))
			.and_then(|q| {
				Quality::try_from(q).map_err(|_| CodeError::UpdatesNotConfigured("unknown quality"))
			})?;

		// The first time we resolve a version, honor an explicit commit
		// override so the upgrade flow can be tested: the agent host is
		// initially downloaded and started at this commit, and a subsequent
		// upgrade (which calls this method again, with `latest` already set)
		// still resolves the real latest version.
		if latest.is_none() {
			if let Some(commit) = initial_agent_host_version() {
				let release = Release {
					name: String::new(),
					commit,
					platform: self.platform,
					target: TargetKind::Server,
					quality,
				};
				info!(
					self.log,
					"Using initial agent host version override: {}", release.commit
				);
				*latest = Some((now, release.clone()));
				return Ok(release);
			}
		}

		let result = self
			.update_service
			.get_latest_commit(self.platform, TargetKind::Server, quality)
			.await
			.map_err(|e| CodeError::UpdateCheckFailed(e.to_string()));

		// If the update service is unavailable, fall back to the cached version
		if let (Err(e), Some((_, previous))) = (&result, latest.clone()) {
			warning!(self.log, "Error checking for updates, using cached: {}", e);
			*latest = Some((now, previous.clone()));
			return Ok(previous);
		}

		let release = result?;
		debug!(self.log, "Resolved server version: {}", release);
		*latest = Some((now, release.clone()));
		Ok(release)
	}

	/// Background loop: checks for updates periodically and pre-downloads
	/// new versions when the server is idle.
	pub async fn run_update_loop(self: Arc<Self>) {
		let mut interval = tokio::time::interval(UPDATE_CHECK_INTERVAL);
		interval.tick().await; // skip the immediate first tick

		loop {
			interval.tick().await;

			let new_release = match self.get_latest_release().await {
				Ok(r) => r,
				Err(e) => {
					warning!(self.log, "Update check failed: {}", e);
					continue;
				}
			};

			// Check if we already have this version
			let name = get_server_folder_name(new_release.quality, &new_release.commit);
			if self.cache.exists(&name).is_some() {
				continue;
			}

			info!(self.log, "New server version available: {}", new_release);

			// Wait until the server is not running before downloading
			loop {
				{
					let running = self.running.lock().await;
					if running.is_none() {
						break;
					}
				}
				debug!(self.log, "Server still running, waiting before updating...");
				tokio::time::sleep(UPDATE_POLL_INTERVAL).await;
			}

			// Download the new version
			match self.ensure_downloaded(&new_release).await {
				Ok(_) => info!(self.log, "Updated server to {}", new_release),
				Err(e) => warning!(self.log, "Failed to download update: {}", e),
			}
		}
	}

	/// Kills the currently running server, if any.
	///
	/// The server is launched via a bash/cmd shim (`<server>/bin/code-server-<quality>`)
	/// which `spawn`s the underlying `node ... server-main.js` child. A plain
	/// `child.kill()` only terminates the shim and reparents the node child to
	/// PID 1, leaking it. `kill_tree` signals the shim and its descendants so
	/// the node process is reaped along with the launcher. See issue #319516.
	pub async fn kill_running_server(&self) {
		let mut running = self.running.lock().await;
		if let Some(mut server) = running.take() {
			if let Some(pid) = server.child.id() {
				let _ = kill_tree(pid).await;
			}
			// Reap the child so we don't leave a zombie. Bound the wait so a
			// process that ignores SIGTERM can't wedge the supervisor's
			// shutdown or upgrade path; escalate to SIGKILL via Child::kill if
			// the graceful shutdown doesn't land in time.
			const REAP_TIMEOUT: Duration = Duration::from_secs(5);
			if tokio::time::timeout(REAP_TIMEOUT, server.child.wait())
				.await
				.is_err()
			{
				warning!(
					self.log,
					"Server did not exit within {}s after kill_tree; escalating to SIGKILL",
					REAP_TIMEOUT.as_secs()
				);
				let _ = server.child.kill().await;
				let _ = server.child.wait().await;
			}
		}
	}

	/// Path the management socket is (or will be) bound on. Useful for
	/// tests and callers that want to verify the path the spawned server
	/// would dial.
	pub fn management_socket_path(&self) -> &PathBuf {
		&self.management_socket_path
	}

	/// Spawns the management listener task if it hasn't been started yet.
	/// Idempotent: subsequent calls are no-ops, so it's safe to invoke on
	/// every `start_server` call. Called automatically from `start_server`
	/// — direct callers should only need this in tests.
	pub fn ensure_management_listener(self: &Arc<Self>) {
		if self
			.management_listener_started
			.swap(true, Ordering::SeqCst)
		{
			return;
		}
		let self_clone = self.clone();
		tokio::spawn(async move {
			self_clone.run_management_listener().await;
		});
	}

	/// Serves the HTTP control API on the management socket (advertised to
	/// spawned servers via {@link MANAGEMENT_SOCKET_ENV}). Currently
	/// exposes a single endpoint, `POST /upgrade`, used by the agent host
	/// server to forward client-initiated upgrade requests.
	///
	/// On bind failure, clears {@link management_listener_started} so a
	/// subsequent {@link ensure_management_listener} call (e.g. from the
	/// next `start_server`) can retry. Without that, a transient bind
	/// error (leftover socket, EACCES, etc.) would permanently leave
	/// spawned servers with `MANAGEMENT_SOCKET_ENV` set but nothing
	/// listening behind it.
	async fn run_management_listener(self: Arc<Self>) {
		let path = &self.management_socket_path;
		let mut listener = match listen_socket_rw_stream(path).await {
			Ok(l) => l,
			Err(e) => {
				warning!(
					self.log,
					"Failed to bind management socket {:?}: {}",
					path,
					e
				);
				self.management_listener_started
					.store(false, Ordering::SeqCst);
				return;
			}
		};
		debug!(
			self.log,
			"Listening for agent host management requests on {:?}", path
		);
		self.run_management_accept_loop(&mut listener).await;
	}

	async fn run_management_accept_loop(self: &Arc<Self>, listener: &mut AsyncPipeListener) {
		loop {
			let pipe = match listener.accept().await {
				Ok(p) => p,
				Err(e) => {
					warning!(self.log, "Management socket accept failed: {}", e);
					continue;
				}
			};
			let self_clone = self.clone();
			tokio::spawn(async move {
				let log = self_clone.log.clone();
				let io = TokioIo::new(pipe);
				let svc = service_fn(move |req| {
					let self_clone = self_clone.clone();
					async move { self_clone.handle_management_request(req).await }
				});
				if let Err(e) = ServerBuilder::new(TokioExecutor::new())
					.serve_connection(io, svc)
					.await
				{
					debug!(log, "Management connection ended: {:?}", e);
				}
			});
		}
	}

	/// Routes a single HTTP request received on the management socket.
	async fn handle_management_request(
		self: Arc<Self>,
		req: Request<Incoming>,
	) -> Result<Response<HyperBody>, Infallible> {
		if req.method() == ::http::Method::POST && req.uri().path() == "/upgrade" {
			return Ok(self.handle_upgrade_request().await);
		}
		Ok(Response::builder()
			.status(404)
			.body(full_body("Not found"))
			.unwrap())
	}

	/// Implements the `POST /upgrade` endpoint. The download is awaited
	/// *synchronously* so that the `upgradeStarted` flag in the response
	/// reflects committed work — i.e. the kill+restart is actually about
	/// to happen — rather than an aspirational guess that may silently
	/// abort if the download fails. Concurrent requests are deduplicated
	/// through {@link Self::upgrade_in_progress}.
	///
	/// The response carries `restart_delay_ms` so the client knows how long
	/// to wait before reconnecting: the kill is intentionally delayed to
	/// let the response itself drain back through the proxy.
	async fn handle_upgrade_request(self: Arc<Self>) -> Response<HyperBody> {
		let running_commit = {
			let running = self.running.lock().await;
			running.as_ref().map(|r| r.commit.clone())
		};

		let new_release = match self.get_latest_release().await {
			Ok(r) => r,
			Err(e) => {
				warning!(
					self.log,
					"Upgrade request: latest release lookup failed: {}",
					e
				);
				return json_response(
					503,
					&UpgradeResponse {
						ok: false,
						upgrade_needed: None,
						upgrade_started: None,
						running_commit,
						latest_commit: None,
						restart_delay_ms: None,
						error: Some(format!("Failed to check for updates: {e}")),
					},
				);
			}
		};

		let upgrade_needed = match &running_commit {
			Some(c) => *c != new_release.commit,
			None => true,
		};

		if !upgrade_needed {
			return json_response(
				200,
				&UpgradeResponse {
					ok: true,
					upgrade_needed: Some(false),
					upgrade_started: Some(false),
					running_commit,
					latest_commit: Some(new_release.commit.clone()),
					restart_delay_ms: None,
					error: None,
				},
			);
		}

		// Serialize against other in-flight upgrades. We swap to true and
		// only proceed if we were the ones to flip the flag; otherwise
		// surface that an upgrade is already scheduled.
		if self.upgrade_in_progress.swap(true, Ordering::SeqCst) {
			return json_response(
				200,
				&UpgradeResponse {
					ok: true,
					upgrade_needed: Some(true),
					upgrade_started: Some(false),
					running_commit,
					latest_commit: Some(new_release.commit.clone()),
					restart_delay_ms: None,
					error: Some("An upgrade is already in progress.".to_string()),
				},
			);
		}

		// Download synchronously so we don't lie to the client about
		// `upgradeStarted`. The background update loop usually pre-fetches
		// this, so the common path is a no-op.
		if let Err(e) = self.ensure_downloaded(&new_release).await {
			warning!(
				self.log,
				"Failed to download upgrade {}: {}",
				new_release,
				e
			);
			self.upgrade_in_progress.store(false, Ordering::SeqCst);
			return json_response(
				503,
				&UpgradeResponse {
					ok: false,
					upgrade_needed: Some(true),
					upgrade_started: Some(false),
					running_commit,
					latest_commit: Some(new_release.commit.clone()),
					restart_delay_ms: None,
					error: Some(format!("Failed to download upgrade: {e}")),
				},
			);
		}

		// Download succeeded — commit to the kill+restart. Schedule it
		// after the delay so the HTTP response we're about to return can
		// drain back through the proxy to the original requesting client
		// before the transport drops.
		let self_clone = self.clone();
		let release_commit = new_release.commit.clone();
		tokio::spawn(async move {
			tokio::time::sleep(UPGRADE_KILL_DELAY).await;
			self_clone.kill_running_server().await;
			// Eagerly spin up the new server so the next dial sees a
			// ready endpoint instead of paying for startup again.
			match self_clone.start_server().await {
				Ok(_) => info!(self_clone.log, "Restarted agent host on {}", release_commit),
				Err(e) => warning!(
					self_clone.log,
					"Failed to restart agent host after upgrade: {}",
					e
				),
			}
			self_clone
				.upgrade_in_progress
				.store(false, Ordering::SeqCst);
		});

		json_response(
			200,
			&UpgradeResponse {
				ok: true,
				upgrade_needed: Some(true),
				upgrade_started: Some(true),
				running_commit,
				latest_commit: Some(new_release.commit.clone()),
				restart_delay_ms: Some(UPGRADE_KILL_DELAY.as_millis() as u64),
				error: None,
			},
		)
	}
}

/// JSON body returned by the management socket's `POST /upgrade` endpoint.
/// Forwarded verbatim by the agent host server back to the client that
/// invoked the upgrade RPC, so the UI can describe what happened.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
struct UpgradeResponse {
	ok: bool,
	#[serde(rename = "upgradeNeeded", skip_serializing_if = "Option::is_none")]
	upgrade_needed: Option<bool>,
	#[serde(rename = "upgradeStarted", skip_serializing_if = "Option::is_none")]
	upgrade_started: Option<bool>,
	#[serde(rename = "runningCommit", skip_serializing_if = "Option::is_none")]
	running_commit: Option<String>,
	#[serde(rename = "latestCommit", skip_serializing_if = "Option::is_none")]
	latest_commit: Option<String>,
	/// Milliseconds the client should wait after this response before
	/// reconnecting. Set only when `upgrade_started` is true. Lets the
	/// client avoid landing on the still-running pre-upgrade server.
	#[serde(rename = "restartDelayMs", skip_serializing_if = "Option::is_none")]
	restart_delay_ms: Option<u64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	error: Option<String>,
}

fn json_response<T: Serialize>(status: u16, body: &T) -> Response<HyperBody> {
	let serialized = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
	Response::builder()
		.status(status)
		.header("content-type", "application/json")
		.body(full_body(serialized))
		.unwrap()
}

// ---- HTTP/WebSocket proxy ---------------------------------------------------

/// Proxies an incoming HTTP/WebSocket request to the agent host's Unix socket.
pub async fn handle_request(
	manager: Arc<AgentHostManager>,
	req: Request<Incoming>,
) -> Result<Response<HyperBody>, Infallible> {
	let socket_path = match manager.ensure_server().await {
		Ok(p) => p,
		Err(e) => {
			error!(manager.log, "Error starting agent host: {:?}", e);
			return Ok(Response::builder()
				.status(503)
				.body(full_body(format!("Error starting agent host: {e:?}")))
				.unwrap());
		}
	};

	let is_upgrade = req.headers().contains_key(::http::header::UPGRADE);

	let rw = match get_socket_rw_stream(&socket_path).await {
		Ok(rw) => rw,
		Err(e) => {
			error!(
				manager.log,
				"Error connecting to agent host socket: {:?}", e
			);
			return Ok(Response::builder()
				.status(503)
				.body(full_body(format!("Error connecting to agent host: {e:?}")))
				.unwrap());
		}
	};

	if is_upgrade {
		Ok(forward_ws_to_server(manager.log.clone(), rw, req).await)
	} else {
		Ok(forward_http_to_server(rw, req).await)
	}
}

/// Proxies a standard HTTP request through the given upstream stream.
async fn forward_http_to_server<T>(rw: T, req: Request<Incoming>) -> Response<HyperBody>
where
	T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
	let (mut request_sender, connection) =
		match hyper::client::conn::http1::handshake(TokioIo::new(rw)).await {
			Ok(r) => r,
			Err(e) => return connection_err(e),
		};

	tokio::spawn(connection);

	match request_sender.send_request(req).await {
		Ok(res) => res.map(|b| b.boxed()),
		Err(e) => connection_err(e),
	}
}

/// Proxies a WebSocket upgrade request through the given upstream stream.
async fn forward_ws_to_server<T>(
	log: log::Logger,
	rw: T,
	mut req: Request<Incoming>,
) -> Response<HyperBody>
where
	T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
	let (mut request_sender, connection) =
		match hyper::client::conn::http1::handshake(TokioIo::new(rw)).await {
			Ok(r) => r,
			Err(e) => return connection_err(e),
		};

	tokio::spawn(connection.with_upgrades());

	let mut proxied_req = Request::builder().uri(req.uri());
	for (k, v) in req.headers() {
		proxied_req = proxied_req.header(k, v);
	}

	let mut res = match request_sender
		.send_request(
			proxied_req
				.body(http_body_util::Empty::<bytes::Bytes>::new())
				.unwrap(),
		)
		.await
	{
		Ok(r) => r,
		Err(e) => return connection_err(e),
	};

	let mut proxied_res = Response::new(empty_body());
	*proxied_res.status_mut() = res.status();
	for (k, v) in res.headers() {
		proxied_res.headers_mut().insert(k, v.clone());
	}

	if res.status() == ::http::StatusCode::SWITCHING_PROTOCOLS {
		tokio::spawn(async move {
			let (s_req, s_res) =
				tokio::join!(hyper::upgrade::on(&mut req), hyper::upgrade::on(&mut res));

			match (s_req, s_res) {
				(Ok(s_req), Ok(s_res)) => {
					let mut s_req = TokioIo::new(s_req);
					let mut s_res = TokioIo::new(s_res);
					if let Err(e) = tokio::io::copy_bidirectional(&mut s_req, &mut s_res).await {
						debug!(log, "Agent host WebSocket proxy ended with error: {:?}", e);
					}
				}
				(Err(e), _) => {
					warning!(
						log,
						"Agent host client-side WebSocket upgrade failed: {:?}",
						e
					);
				}
				(_, Err(e)) => {
					warning!(
						log,
						"Agent host server-side WebSocket upgrade failed: {:?}",
						e
					);
				}
			}
		});
	}

	proxied_res
}

fn connection_err(err: hyper::Error) -> Response<HyperBody> {
	Response::builder()
		.status(503)
		.body(full_body(format!(
			"Error connecting to agent host: {err:?}"
		)))
		.unwrap()
}

// ---- Sidecar ----------------------------------------------------------------

/// A CLI-owned agent host sidecar: binds a public listener up front, writes
/// the canonical lockfile pointing at it, and lazily starts/maintains the
/// underlying VS Code server through an [`AgentHostManager`]. The lockfile is
/// removed on shutdown / drop only when the recorded PID still matches this
/// process, so a foreign sidecar that has taken over the same path is left
/// alone.
pub struct AgentHostSidecar {
	log: log::Logger,
	manager: Arc<AgentHostManager>,
	listener: TcpListener,
	bound_addr: SocketAddr,
	public_token: Option<String>,
	/// The host label published to the registry for this sidecar (see
	/// [`Self::bind_tcp`]'s `host_label` parameter). Kept so
	/// [`Self::active_agent_host`] can hand back exactly the identity
	/// this sidecar published, without re-deriving it from `bound_addr`.
	host_label: String,
	user_data_path: PathBuf,
	instance_id: String,
	pid: u32,
	/// Set once registry cleanup for this instance's identity has been
	/// performed (successfully or not — a best-effort attempt counts), so
	/// `Drop` never redundantly repeats it after an explicit [`Self::shutdown`].
	registry_cleaned_up: AtomicBool,
	/// Reports connection activity for `--idle-timeout`, when opted into.
	/// `None` (the default) means idle-timeout is disabled and no activity
	/// bookkeeping happens at all.
	activity: Option<idle_timeout::ActivityTracker>,
}

impl AgentHostSidecar {
	/// Binds a TCP listener at `addr`, publishes a `standalone` entry to the
	/// shared local agent-host endpoint registry (schema v2, see
	/// [`agent_host_registry`]) pointing at the bound port, and returns a
	/// sidecar ready to [`serve`](Self::serve) connections. The agent host
	/// backend is *not* started here — the wrapped [`AgentHostManager`]
	/// starts it on demand when the first request arrives.
	///
	/// `loopback_auth` decides whether the local TCP accept loop enforces a
	/// connection token. The caller MUST make this choice deliberately:
	/// loopback is reachable from any local process, so binding without a
	/// token must be a conscious user opt-in (e.g. `--without-connection-token`).
	///
	/// `user_data_path` is the resolved user data directory that homes the
	/// registry (see [`super::user_data_path`]); `instance_id` is this
	/// process's stable identity within the registry, used to disambiguate
	/// PID reuse and to scope `--replace`/removal to exactly this entry.
	///
	/// `activity` opts this sidecar into `--idle-timeout` connection
	/// bookkeeping: pass `Some` (paired with the receiver half raced
	/// against [`Self::serve`] by the caller, see
	/// [`idle_timeout::wait_for_idle_timeout`]) to have every accepted
	/// connection reported to it, or `None` to disable idle-timeout
	/// bookkeeping entirely (the default for manually started local hosts).
	#[allow(clippy::too_many_arguments)]
	pub async fn bind_tcp(
		log: log::Logger,
		manager: Arc<AgentHostManager>,
		addr: SocketAddr,
		host_label: Option<String>,
		loopback_auth: LoopbackAuth,
		tunnel_name: Option<String>,
		user_data_path: PathBuf,
		instance_id: String,
		activity: Option<idle_timeout::ActivityTracker>,
	) -> Result<Arc<Self>, AnyError> {
		let public_token = loopback_auth.into_token();
		let listener = TcpListener::bind(addr)
			.await
			.map_err(CodeError::CouldNotListenOnInterface)?;
		let bound_addr = listener
			.local_addr()
			.map_err(CodeError::CouldNotListenOnInterface)?;

		let pid = std::process::id();
		// Prefer the caller-supplied host label so we record what the user
		// asked for (e.g. `localhost`) instead of the resolved IP. That
		// lets the foreground command compare `--host` invocations
		// character-equal without spuriously flagging hostname-vs-IP
		// equivalents as a config conflict.
		let host = host_label.unwrap_or_else(|| bound_addr.ip().to_string());
		let entry = AgentHostEndpointMetadata::new_standalone(
			pid,
			instance_id.clone(),
			host.clone(),
			bound_addr.port(),
			public_token.clone().unwrap_or_default(),
			AGENT_HOST_PROTOCOL_VERSION.to_string(),
			VSCODE_CLI_QUALITY.map(str::to_string),
			tunnel_name,
		);

		// Registry publish does blocking filesystem I/O (write a temp file and
		// atomically rename it into place); run it on a blocking-safe thread so
		// it never stalls the tokio runtime.
		{
			let publish_log = log.clone();
			let publish_path = user_data_path.clone();
			match tokio::task::spawn_blocking(move || {
				agent_host_registry::publish_agent_host_endpoint(
					&publish_log,
					&publish_path,
					&entry,
				)
			})
			.await
			{
				Ok(Ok(())) => {}
				Ok(Err(e)) => warning!(
					log,
					"Failed to publish agent host endpoint registry entry: {}",
					e
				),
				Err(e) => warning!(
					log,
					"Agent host endpoint registry publish task failed: {}",
					e
				),
			}
		}

		Ok(Arc::new(Self {
			log,
			manager,
			listener,
			bound_addr,
			public_token,
			host_label: host,
			user_data_path,
			instance_id,
			pid,
			registry_cleaned_up: AtomicBool::new(false),
			activity,
		}))
	}

	/// This sidecar's identity in the same shape as
	/// [`super::control_server::SharedActiveAgentHost`]'s resolved value,
	/// exactly matching what [`Self::bind_tcp`] published to the shared
	/// endpoint registry (pid, host, port, token). Lets a caller that
	/// already *is* the running supervisor (e.g. `code agent host
	/// --tunnel` routing its own tunneled `/agent-host` port) build a
	/// ready [`super::control_server::SharedActiveAgentHost`] -- see
	/// [`super::control_server::ready_active_agent_host`] -- without going
	/// through `ensure_supervisor_running`'s registry lookup/spawn path,
	/// which exists for callers that do *not* already know whether a
	/// supervisor is running.
	pub fn active_agent_host(&self) -> crate::commands::agent_host::ActiveAgentHost {
		crate::commands::agent_host::ActiveAgentHost {
			pid: self.pid,
			host: Some(self.host_label.clone()),
			port: self.bound_addr.port(),
			token: self.public_token.clone(),
		}
	}

	/// Returns a cloned handle for reporting client activity to
	/// `--idle-timeout` bookkeeping, or `None` when idle-timeout is
	/// disabled.
	///
	/// Callers serving connections this sidecar did not accept itself (the
	/// dev-tunnel-hosted port in `run_supervisor`, which is handed sockets
	/// by the tunnel relay rather than by [`Self::serve`]'s accept loop)
	/// must report each connection and attach the resulting guard to that
	/// connection's transport with [`idle_timeout::GuardedStream`], so the
	/// client counts as activity for as long as it stays connected.
	pub fn activity_tracker(&self) -> Option<idle_timeout::ActivityTracker> {
		self.activity.clone()
	}

	/// Returns the wrapped manager, e.g. so callers can pre-fetch the latest
	/// release, run an update loop, or directly serve tunnel-relayed
	/// connections that bypass the public connection token.
	pub fn manager(&self) -> Arc<AgentHostManager> {
		self.manager.clone()
	}

	/// The address the local TCP listener is bound to.
	pub fn bound_addr(&self) -> SocketAddr {
		self.bound_addr
	}

	/// Runs the local accept loop, enforcing the public connection token on
	/// every request, until `shutdown` fires.
	pub async fn serve(&self, mut shutdown: Barrier<ShutdownSignal>) -> Result<(), AnyError> {
		loop {
			tokio::select! {
				_ = shutdown.wait() => return Ok(()),
				accepted = self.listener.accept() => {
					let (stream, _) = match accepted {
						Ok(v) => v,
						Err(e) => {
							warning!(self.log, "Failed to accept connection: {}", e);
							continue;
						}
					};
					let mgr = self.manager.clone();
					let token = self.public_token.clone();
					// Attached to the stream (not held by this task) so
					// `--idle-timeout` bookkeeping (when enabled) sees
					// exactly one Connected/Disconnected pair spanning
					// the connection's *whole* life, including after a
					// WebSocket upgrade hands the transport off. See
					// `idle_timeout::GuardedStream`.
					let stream = idle_timeout::GuardedStream::new(
						stream,
						self.activity.as_ref().map(|a| a.client_connected()),
					);
					tokio::spawn(async move {
						let io = TokioIo::new(stream);
						let svc = service_fn(move |req| {
							let mgr = mgr.clone();
							let token = token.clone();
							async move { handle_request_with_auth(mgr, req, token).await }
						});
						if let Err(e) = ServerBuilder::new(TokioExecutor::new())
							.serve_connection_with_upgrades(io, svc)
							.await
						{
							// Connection-level errors are normal (client disconnect, etc.)
							let _ = e;
						}
					});
				}
			}
		}
	}

	/// Serves a single connection coming from the dev tunnel. The relay
	/// authenticates the caller, so this path bypasses the public connection
	/// token check used by [`serve`](Self::serve).
	pub async fn serve_tunnel_connection<RW>(&self, rw: RW)
	where
		RW: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
	{
		debug!(self.log, "Serving tunnel agent host connection");
		// Attached to the stream, same as the local accept loop in
		// `serve`, so a tunnel-relayed client also counts as activity for
		// `--idle-timeout` bookkeeping for as long as it stays connected
		// -- including after a WebSocket upgrade.
		let rw = idle_timeout::GuardedStream::new(
			rw,
			self.activity.as_ref().map(|a| a.client_connected()),
		);
		let mgr = self.manager.clone();
		let svc = service_fn(move |req| {
			let mgr = mgr.clone();
			async move { handle_request(mgr, req).await }
		});
		let io = TokioIo::new(rw);
		if let Err(e) = ServerBuilder::new(TokioExecutor::new())
			.serve_connection_with_upgrades(io, svc)
			.await
		{
			debug!(self.log, "Tunnel agent host connection ended: {:?}", e);
		}
	}

	/// Stops the agent host backend and removes this instance's entry from
	/// the shared local agent-host endpoint registry. Safe to call multiple
	/// times: only the first call performs registry cleanup, and `Drop`
	/// will not repeat it afterwards (see `registry_cleaned_up`).
	pub async fn shutdown(&self) {
		self.manager.kill_running_server().await;
		if self.registry_cleaned_up.swap(true, Ordering::SeqCst) {
			return;
		}
		let identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: self.pid,
			instance_id: self.instance_id.clone(),
		};
		let log = self.log.clone();
		let user_data_path = self.user_data_path.clone();
		if let Err(e) = tokio::task::spawn_blocking(move || {
			agent_host_registry::remove_agent_host_endpoint(&log, &user_data_path, &identity);
		})
		.await
		{
			warning!(
				self.log,
				"Agent host endpoint registry cleanup task failed: {}",
				e
			);
		}
	}
}

impl Drop for AgentHostSidecar {
	fn drop(&mut self) {
		// If `shutdown` already performed (or is performing) registry
		// cleanup, don't repeat it here.
		if self.registry_cleaned_up.swap(true, Ordering::SeqCst) {
			return;
		}

		// Best-effort cleanup for the case where the caller forgot to call
		// `shutdown`. `remove_agent_host_endpoint` only removes the entry
		// that exactly matches our own `(type, pid, instanceId)` identity.
		let identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: self.pid,
			instance_id: self.instance_id.clone(),
		};
		let log = self.log.clone();
		let user_data_path = self.user_data_path.clone();

		// `drop` is synchronous and must not block a Tokio worker thread
		// with this call's blocking filesystem I/O (removing our own entry
		// file). If a runtime is reachable from here, hand the
		// cleanup off to a blocking-safe thread and don't wait for it —
		// this is already a best-effort fallback, so fire-and-forget is
		// acceptable. If no runtime is available (e.g. this sidecar
		// outlived it), there is no worker thread left to protect, so it's
		// safe to just do the blocking removal inline.
		match tokio::runtime::Handle::try_current() {
			Ok(handle) => {
				handle.spawn_blocking(move || {
					agent_host_registry::remove_agent_host_endpoint(
						&log,
						&user_data_path,
						&identity,
					);
				});
			}
			Err(_) => {
				agent_host_registry::remove_agent_host_endpoint(&log, &user_data_path, &identity);
			}
		}
	}
}

/// How the loopback TCP accept loop authenticates incoming connections.
/// Forces callers to make a deliberate choice rather than accidentally
/// exposing the agent host to every process on the host.
pub enum LoopbackAuth {
	/// Require `?tkn=<token>` on every request to the local accept loop.
	Token(String),
	/// The user explicitly opted into running without a connection token
	/// (e.g. `code agent host --without-connection-token`). Anyone on the
	/// host can dial the listener; only use this when that is the intent.
	Disabled,
}

impl LoopbackAuth {
	fn into_token(self) -> Option<String> {
		match self {
			LoopbackAuth::Token(t) => Some(t),
			LoopbackAuth::Disabled => None,
		}
	}
}

/// Wraps [`handle_request`] with public connection-token enforcement. Used by
/// the local TCP accept loop; tunnel connections served through
/// [`AgentHostSidecar::serve_tunnel_connection`] bypass this check because
/// the relay provides its own authentication.
async fn handle_request_with_auth(
	manager: Arc<AgentHostManager>,
	req: Request<Incoming>,
	expected_token: Option<String>,
) -> Result<Response<HyperBody>, Infallible> {
	if let Some(ref token) = expected_token {
		let uri_query = req.uri().query().unwrap_or("");
		let has_valid_token = url::form_urlencoded::parse(uri_query.as_bytes())
			.any(|(k, v)| k == "tkn" && v == token.as_str());

		if !has_valid_token {
			return Ok(Response::builder()
				.status(403)
				.body(full_body("Forbidden: missing or invalid connection token"))
				.unwrap());
		}
	}

	handle_request(manager, req).await
}

// ---- Registry-based reuse ---------------------------------------------------

/// Decision derived from consulting the shared local agent-host endpoint
/// registry (schema v2; see [`agent_host_registry`]). Used by CLI entry
/// points (e.g. `code tunnel`, `code agent host`) to decide whether they
/// may safely start their own supervisor or should forward to / share an
/// existing one.
///
/// The agent host server is downloaded on demand and may speak a newer
/// protocol than the CLI itself is built with, so we deliberately do NOT
/// check the protocol version: any live registered supervisor is always
/// considered reusable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentHostReuseDecision {
	/// No live standalone agent host registered; the caller may start its
	/// own sidecar.
	SpawnFresh,
	/// A live standalone agent host supervisor owns a registry entry.
	/// Tunnel callers should forward to `127.0.0.1:port` instead of
	/// binding a second listener / publishing a conflicting entry. `host`
	/// and `tunnel_name` expose the supervisor's effective config so
	/// foreground callers can detect a configuration conflict and refuse
	/// to silently reuse.
	Reuse {
		pid: u32,
		host: Option<String>,
		port: u16,
		token: Option<String>,
		tunnel_name: Option<String>,
		/// This entry's stable identity within the registry, used by
		/// `--replace` to scope removal to exactly this instance.
		instance_id: String,
	},
}

/// Preferred entry point for CLI commands that need to discover a live
/// standalone agent host: consults the shared local agent-host endpoint
/// registry (schema v2), the sole source of truth for automatic
/// discovery.
///
/// `editor` entries are never selected here — they are owned by running VS
/// Code windows and must remain invisible to (and unkillable by) the
/// standalone CLI's discovery/`--replace` path. See
/// [`agent_host_registry::select_live_standalone_endpoint`].
pub async fn classify_agent_host(
	log: &log::Logger,
	user_data_path: &std::path::Path,
) -> AgentHostReuseDecision {
	match agent_host_registry::select_live_standalone_endpoint(log, user_data_path).await {
		Some(selected) => AgentHostReuseDecision::Reuse {
			pid: selected.pid,
			host: Some(selected.host),
			port: selected.port,
			token: if selected.connection_token.is_empty() {
				None
			} else {
				Some(selected.connection_token)
			},
			tunnel_name: selected.tunnel_name,
			instance_id: selected.instance_id,
		},
		None => AgentHostReuseDecision::SpawnFresh,
	}
}

/// Routes one raw tunneled connection accepted on the forwarded
/// agent-host port (`AGENT_HOST_PORT`, protocol tag `protocolv6`).
/// Requests to [`AGENT_HOST_GATEWAY_SELECT_PATH`] run the protocol-v6
/// registry-based selection gateway (see [`run_gateway_session`]); every
/// other request preserves the unchanged protocol-v5 behavior -- lazily
/// ensure/reuse the single legacy supervisor via `active_agent_host` and
/// proxy directly, injecting `?tkn=<token>` into the request URI the same
/// way the old `forward_tunnel_connection_to_existing_ah` did. Because
/// the route is decided per request, a v5 client that never asks for the
/// selection path never drives `active_agent_host` from here either --
/// only an actual legacy request does, so a tunnel that nobody connects
/// to never spawns a standalone supervisor by itself.
///
/// This is the single request router shared by every caller that hosts
/// the forwarded agent-host tunnel port, regardless of who owns
/// `active_agent_host`: `code tunnel`'s `control_server` passes a lazily
/// `ensure_supervisor_running`-backed future (it may not know of a live
/// supervisor yet), while `code agent host --tunnel` passes an
/// already-resolved [`super::control_server::ready_active_agent_host`]
/// pointing at its own running sidecar (see
/// [`AgentHostSidecar::active_agent_host`]) -- it already *is* the
/// supervisor, so it must never call `ensure_supervisor_running` (which
/// could spawn or reuse an unrelated one) from this path.
///
/// `user_data_path` is passed in explicitly (rather than re-resolved
/// internally) so it reflects whatever `--user-data-dir` (if any) the
/// caller's own supervisor is actually using -- this must match the
/// directory [`AgentHostSidecar::bind_tcp`] published its registry entry
/// under, or the selection gateway's inventory would look at the wrong
/// registry file. When `delegate_to_editor` is set, protocol-v6 serves only
/// the live editor endpoint and protocol-v5 requests are rejected so they
/// cannot spawn or reuse an unrelated standalone supervisor.
pub async fn serve_agent_host_tunnel_connection<RW>(
	log: log::Logger,
	rw: RW,
	active_agent_host: super::control_server::SharedActiveAgentHost,
	launcher_paths: LauncherPaths,
	user_data_path: PathBuf,
	delegate_to_editor: bool,
) where
	RW: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
	let svc_log = log.clone();
	let svc = service_fn(move |req: Request<Incoming>| {
		let log = svc_log.clone();
		let active_agent_host = active_agent_host.clone();
		let launcher_paths = launcher_paths.clone();
		let user_data_path = user_data_path.clone();
		async move {
			let path = req.uri().path().to_string();
			if is_gateway_select_request(&req) {
				debug!(
					log,
					"Agent-host tunnel: dispatching {} to protocol-v6 selection gateway", path
				);
				return handle_gateway_select_request(
					log,
					launcher_paths,
					user_data_path,
					delegate_to_editor,
					req,
				)
				.await;
			}

			if delegate_to_editor {
				return Ok(Response::builder()
					.status(503)
					.body(full_body(
						"This tunnel serves a specific agent host; upgrade required".to_string(),
					))
					.unwrap());
			}

			let active = match active_agent_host.await {
				Ok(a) => a,
				Err(e) => {
					warning!(
						log,
						"Cannot forward agent-host tunnel connection; supervisor unavailable: {}",
						e
					);
					return Ok(Response::builder()
						.status(503)
						.body(full_body(format!("Agent host supervisor unavailable: {e}")))
						.unwrap());
				}
			};
			debug!(
				log,
				"Agent-host tunnel: routing {} to legacy direct proxy (pid={}, {}:{})",
				path,
				active.pid,
				active.dial_host(),
				active.port
			);
			handle_reuse_request(
				log,
				active.dial_host().to_string(),
				active.port,
				active.token.clone(),
				req,
			)
			.await
		}
	});
	let io = TokioIo::new(rw);
	if let Err(e) = ServerBuilder::new(TokioExecutor::new())
		.serve_connection_with_upgrades(io, svc)
		.await
	{
		debug!(log, "Tunnel agent-host connection ended: {:?}", e);
	}
}

async fn handle_reuse_request(
	log: log::Logger,
	upstream_host: String,
	upstream_port: u16,
	token: Option<String>,
	mut req: Request<Incoming>,
) -> Result<Response<HyperBody>, Infallible> {
	if let Some(ref tok) = token {
		let new_uri = inject_connection_token(req.uri(), tok);
		*req.uri_mut() = new_uri;
	}

	// Resolve via `lookup_host` so we tolerate hostnames (`localhost`) and
	// IPv6 literals (`::1`) in addition to bare IPv4. `TcpStream::connect`
	// also accepts `(host, port)` directly but doing the lookup explicitly
	// gives us a clearer error path.
	let target = format!("{upstream_host}:{upstream_port}");
	let stream = match tokio::net::TcpStream::connect(&target).await {
		Ok(s) => s,
		Err(e) => {
			warning!(
				log,
				"Failed to connect to existing agent host on {}: {}",
				target,
				e
			);
			return Ok(Response::builder()
				.status(503)
				.body(full_body(format!(
					"Error connecting to existing agent host: {e}"
				)))
				.unwrap());
		}
	};

	let is_upgrade = req.headers().contains_key(::http::header::UPGRADE);
	if is_upgrade {
		Ok(forward_ws_to_server(log, stream, req).await)
	} else {
		Ok(forward_http_to_server(stream, req).await)
	}
}

/// Append `tkn=<token>` to a request-target URI's query string, preserving
/// any existing query parameters. Mirrors `AgentHostProxy._rewriteUri` on
/// the TypeScript side.
fn inject_connection_token(uri: &::http::Uri, token: &str) -> ::http::Uri {
	let path = uri.path();
	let path = if path.is_empty() { "/" } else { path };
	let encoded: String = url::form_urlencoded::byte_serialize(token.as_bytes()).collect();
	let new_path_and_query = match uri.query() {
		Some(q) if !q.is_empty() => format!("{path}?{q}&tkn={encoded}"),
		_ => format!("{path}?tkn={encoded}"),
	};
	::http::Uri::builder()
		.path_and_query(new_path_and_query.as_str())
		.build()
		.unwrap_or_else(|_| uri.clone())
}

// ---- Protocol-v6 tunnel gateway: registry-based endpoint selection ---------
//
// Adds a second WebSocket route on the same forwarded agent-host tunnel
// port used by the legacy (protocol-v5) direct-reuse route above. A
// protocol-v6-aware client opens this route instead of the root route to
// pick, from the live local registry, which endpoint it actually wants
// (any live `editor`/`standalone` entry, or a freshly spawned dedicated
// standalone) rather than always being handed the single deterministic
// legacy reuse target. It reuses the same tunnel relay connection and
// forwarded port as the legacy route -- no tunnel-per-endpoint -- and,
// like the legacy route, injects the target's connection token itself so
// it is never exposed to the renderer.

/// WebSocket route on the forwarded agent-host tunnel port
/// (`AGENT_HOST_PORT`) used by protocol-v6-aware clients to run the
/// registry-based selection handshake in [`run_gateway_session`]. Any
/// other path keeps the unchanged protocol-v5 root/default behavior in
/// [`serve_agent_host_tunnel_connection`].
pub const AGENT_HOST_GATEWAY_SELECT_PATH: &str = "/agent-host/select";

/// Whether a request on the forwarded agent-host tunnel port should be
/// routed to the protocol-v6 selection gateway rather than the legacy
/// (v5) direct-reuse route: it must both target the dedicated selection
/// path and be a WebSocket upgrade (a plain GET to that path, e.g. a
/// health probe, still falls through to legacy handling rather than
/// erroring). Generic over the body type so it can be exercised directly
/// in tests without needing a real hyper connection.
fn is_gateway_select_request<B>(req: &Request<B>) -> bool {
	req.uri().path() == AGENT_HOST_GATEWAY_SELECT_PATH
		&& req.headers().contains_key(::http::header::UPGRADE)
}

/// Idle timeout applied to a supervisor spawned via a `newDedicated`
/// gateway selection, matching `code agent host --new-instance
/// --idle-timeout 300`: if no client connects to it for five minutes
/// after the gateway connection that spawned it goes away, the dedicated
/// supervisor exits on its own.
const GATEWAY_NEW_INSTANCE_IDLE_TIMEOUT_SECS: u64 = 300;

/// One live registry endpoint as reported to the tunnel client in the
/// protocol-v6 selection inventory. Deliberately excludes
/// `connectionToken` -- the gateway injects the target's token itself
/// once selection completes and never exposes it to the renderer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHostGatewayEndpoint {
	#[serde(rename = "type")]
	pub server_type: AgentHostServerType,
	pub pid: u32,
	pub instance_id: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub quality: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub tunnel_name: Option<String>,
	/// `"tcp"` or `"socket"`.
	pub endpoint_kind: &'static str,
	/// Short human address label (`host:port`, or the socket/pipe path);
	/// never the connection token.
	pub endpoint_label: String,
}

impl From<&AgentHostEndpointMetadata> for AgentHostGatewayEndpoint {
	fn from(e: &AgentHostEndpointMetadata) -> Self {
		Self {
			server_type: e.server_type,
			pid: e.pid,
			instance_id: e.instance_id.clone(),
			quality: e.quality.clone(),
			tunnel_name: e.tunnel_name.clone(),
			endpoint_kind: match e.endpoint {
				AgentHostEndpointAddress::Tcp { .. } => "tcp",
				AgentHostEndpointAddress::Socket { .. } => "socket",
			},
			endpoint_label: e.address_label(),
		}
	}
}

/// One-time inventory message the gateway sends immediately after the
/// protocol-v6 selection WebSocket upgrades.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayInventory {
	user_data_path: String,
	endpoints: Vec<AgentHostGatewayEndpoint>,
	/// Set when this tunnel is bound to one specific agent host instance:
	/// the inventory lists only that endpoint and no dedicated host can be spawned.
	#[serde(skip_serializing_if = "Option::is_none")]
	delegated_instance_id: Option<String>,
}

/// The client's one-time selection message: either an existing live
/// endpoint's `instanceId`, or a request to spawn a new dedicated
/// standalone instance. Modeled as a plain struct with two optional
/// fields (rather than a tagged enum) so the wire shape stays exactly
/// `{"instanceId": "..."}` or `{"newDedicated": true}`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySelectionRequest {
	#[serde(default)]
	instance_id: Option<String>,
	#[serde(default)]
	new_dedicated: Option<bool>,
}

/// Parsed, validated form of [`GatewaySelectionRequest`].
enum GatewaySelection {
	Existing { instance_id: String },
	NewDedicated,
}

impl GatewaySelectionRequest {
	fn parse(self) -> Result<GatewaySelection, &'static str> {
		match (self.instance_id, self.new_dedicated) {
			(Some(id), _) if !id.is_empty() => Ok(GatewaySelection::Existing { instance_id: id }),
			(_, Some(true)) => Ok(GatewaySelection::NewDedicated),
			_ => Err(
				"Selection must include either a non-empty `instanceId` or `newDedicated: true`",
			),
		}
	}
}

/// Lifecycle of the selected endpoint as reported back to the client,
/// mirroring `ITunnelConnectResult.lifecycle` on the TypeScript side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum GatewayLifecycle {
	/// An already-running editor window, or a standalone instance that
	/// was already live and merely reused; the gateway did not spawn it
	/// and is not responsible for its lifetime.
	External,
	/// A standalone instance the gateway just spawned for this
	/// `newDedicated` selection. It outlives this connection and
	/// self-terminates via its own no-client idle timeout.
	Managed,
}

/// Metadata about the selected endpoint, included in the success
/// acknowledgement and mirrored into `ITunnelConnectResult` on the
/// TypeScript side.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySelectedInfo {
	#[serde(rename = "type")]
	server_type: AgentHostServerType,
	instance_id: String,
	/// Always `"primary"` today; reserved for future multi-role
	/// selections.
	role: &'static str,
	lifecycle: GatewayLifecycle,
}

/// The gateway's one-time reply to a selection message: either a
/// selected/ready acknowledgement (after which frames are proxied to the
/// target) or a clear error (after which the connection is closed; the
/// gateway never silently substitutes a different target).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySelectionResponse {
	ok: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	selected: Option<GatewaySelectedInfo>,
	#[serde(skip_serializing_if = "Option::is_none")]
	error: Option<String>,
}

/// Completes a protocol-v6 selection WebSocket handshake for the current
/// HTTP/1 request. Unlike the legacy route, the gateway is itself the
/// WebSocket endpoint here (there is no upstream to proxy to until a
/// selection is made), so it answers the upgrade directly and hands the
/// upgraded connection to [`run_gateway_session`]. `user_data_path` is
/// the caller-resolved directory to consult for the live-endpoint
/// registry -- see [`serve_agent_host_tunnel_connection`]'s doc comment
/// for why this must not be re-resolved internally.
async fn handle_gateway_select_request(
	log: log::Logger,
	launcher_paths: LauncherPaths,
	user_data_path: PathBuf,
	delegate_to_editor: bool,
	mut req: Request<Incoming>,
) -> Result<Response<HyperBody>, Infallible> {
	let key = match req.headers().get(::http::header::SEC_WEBSOCKET_KEY) {
		Some(k) => k.clone(),
		None => {
			return Ok(Response::builder()
				.status(400)
				.body(full_body(
					"Gateway selection route requires a WebSocket upgrade".to_string(),
				))
				.unwrap())
		}
	};

	let accept = tokio_tungstenite::tungstenite::handshake::derive_accept_key(key.as_bytes());
	let response = Response::builder()
		.status(::http::StatusCode::SWITCHING_PROTOCOLS)
		.header(::http::header::CONNECTION, "Upgrade")
		.header(::http::header::UPGRADE, "websocket")
		.header(::http::header::SEC_WEBSOCKET_ACCEPT, accept)
		.body(empty_body())
		.unwrap();

	let svc_log = log.clone();
	tokio::spawn(async move {
		match hyper::upgrade::on(&mut req).await {
			Ok(upgraded) => {
				let io = TokioIo::new(upgraded);
				let ws = WebSocketStream::from_raw_socket(io, Role::Server, None).await;
				run_gateway_session(
					svc_log,
					launcher_paths,
					user_data_path,
					delegate_to_editor,
					ws,
				)
				.await;
			}
			Err(e) => {
				warning!(
					svc_log,
					"Gateway selection: WebSocket upgrade failed: {:?}",
					e
				);
			}
		}
	});

	Ok(response)
}

/// Drives one protocol-v6 selection WebSocket end-to-end: sends the
/// inventory, waits for exactly one selection message, resolves it
/// (rereading the registry fresh for an existing instance, or spawning a
/// new dedicated one without touching any existing entry), dials the
/// selected target, sends the selected/ready acknowledgement, then
/// proxies every subsequent frame bidirectionally. Never touches
/// `active_agent_host` -- the legacy shared future used by the root
/// route -- since this path resolves its own target directly from the
/// registry. `user_data_path` is resolved once by the caller (rather
/// than internally) so tests can drive this end-to-end against an
/// isolated registry directory.
async fn run_gateway_session<S>(
	log: log::Logger,
	launcher_paths: LauncherPaths,
	user_data_path: PathBuf,
	delegate_to_editor: bool,
	mut client: WebSocketStream<S>,
) where
	S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
	let live_endpoints = agent_host_registry::list_live_endpoints(&log, &user_data_path).await;
	let (endpoints, delegated_instance_id) = if delegate_to_editor {
		// `list_live_endpoints` returns newest-first entries, so prefer the
		// editor that most recently published its endpoint.
		let mut editor_endpoints: Vec<_> = live_endpoints
			.into_iter()
			.filter(|endpoint| endpoint.server_type == AgentHostServerType::Editor)
			.collect();
		if editor_endpoints.is_empty() {
			send_gateway_error(
				&log,
				&mut client,
				"This tunnel serves the editor's agent host, but no live editor agent host was found"
					.to_string(),
			)
			.await;
			return;
		}
		if editor_endpoints.len() > 1 {
			warning!(
				log,
				"Multiple live editor agent host endpoints were found; selecting instance {}",
				editor_endpoints[0].instance_id
			);
		}
		let endpoint = editor_endpoints.remove(0);
		let delegated_instance_id = endpoint.instance_id.clone();
		(
			vec![AgentHostGatewayEndpoint::from(&endpoint)],
			Some(delegated_instance_id),
		)
	} else {
		(
			live_endpoints
				.iter()
				.map(AgentHostGatewayEndpoint::from)
				.collect(),
			None,
		)
	};
	let inventory = GatewayInventory {
		user_data_path: user_data_path.to_string_lossy().to_string(),
		endpoints,
		delegated_instance_id: delegated_instance_id.clone(),
	};
	let inventory_json = match serde_json::to_string(&inventory) {
		Ok(j) => j,
		Err(e) => {
			warning!(log, "Failed to serialize gateway inventory: {:?}", e);
			return;
		}
	};
	if let Err(e) = client.send(Message::Text(inventory_json.into())).await {
		debug!(log, "Gateway selection: failed to send inventory: {:?}", e);
		return;
	}

	// Wait for exactly one selection message, ignoring any control frames
	// (ping/pong) tungstenite surfaces along the way.
	let selection = loop {
		match client.next().await {
			Some(Ok(Message::Text(s))) => {
				match serde_json::from_str::<GatewaySelectionRequest>(&s) {
					Ok(req) => break req,
					Err(e) => {
						send_gateway_error(&log, &mut client, format!("Malformed selection: {e}"))
							.await;
						return;
					}
				}
			}
			Some(Ok(Message::Binary(_))) => {
				send_gateway_error(
					&log,
					&mut client,
					"Selection must be a JSON text message".to_string(),
				)
				.await;
				return;
			}
			Some(Ok(Message::Close(_))) | None => {
				debug!(
					log,
					"Gateway selection: client disconnected before selecting"
				);
				return;
			}
			Some(Ok(_)) => continue,
			Some(Err(e)) => {
				debug!(log, "Gateway selection: client connection error: {:?}", e);
				return;
			}
		}
	};

	let selection = match selection.parse() {
		Ok(s) => s,
		Err(msg) => {
			send_gateway_error(&log, &mut client, msg.to_string()).await;
			return;
		}
	};

	// A delegated tunnel serves exactly one agent host, so resolve whatever
	// the client asked for to that endpoint instead of failing. Clients that
	// do not understand `delegatedInstanceId` -- including any editor older
	// than this one on the far side of the tunnel -- legitimately ask for a
	// dedicated host, and every background reconnect does so unconditionally.
	// Rejecting them would break cross-version connections for no benefit:
	// there is only one endpoint to hand out either way, and the ready
	// acknowledgement reports the endpoint's real `type` and `instanceId`, so
	// the client is never misled about what it got.
	let selection = match &delegated_instance_id {
		Some(delegated) => {
			let already_bound = matches!(
				&selection,
				GatewaySelection::Existing { instance_id } if instance_id == delegated
			);
			if !already_bound {
				debug!(
					log,
					"Delegated tunnel: resolving client selection to the bound agent host {}",
					delegated
				);
			}
			GatewaySelection::Existing {
				instance_id: delegated.clone(),
			}
		}
		None => selection,
	};

	let (endpoint, lifecycle) = match selection {
		GatewaySelection::Existing { instance_id } => {
			// Reread the registry fresh here -- never reuse the inventory
			// snapshot -- and require the *exact* entry to still be live.
			// If it disappeared, fail clearly instead of silently
			// switching to a different one.
			match agent_host_registry::list_live_endpoints(&log, &user_data_path)
				.await
				.into_iter()
				.find(|e| e.instance_id == instance_id)
			{
				Some(e) => (e, GatewayLifecycle::External),
				None => {
					send_gateway_error(
						&log,
						&mut client,
						format!("Selected agent host instance {instance_id} is no longer live"),
					)
					.await;
					return;
				}
			}
		}
		GatewaySelection::NewDedicated => {
			match crate::commands::agent_host::spawn_dedicated_supervisor(
				&launcher_paths,
				&log,
				&user_data_path,
				GATEWAY_NEW_INSTANCE_IDLE_TIMEOUT_SECS,
			)
			.await
			{
				Ok(e) => (e, GatewayLifecycle::Managed),
				Err(e) => {
					send_gateway_error(
						&log,
						&mut client,
						format!("Failed to start a new dedicated agent host: {e}"),
					)
					.await;
					return;
				}
			}
		}
	};

	let target = match dial_gateway_target(&endpoint).await {
		Ok(t) => t,
		Err(e) => {
			send_gateway_error(
				&log,
				&mut client,
				format!("Selected agent host became unreachable: {e}"),
			)
			.await;
			return;
		}
	};

	let ack = GatewaySelectionResponse {
		ok: true,
		selected: Some(GatewaySelectedInfo {
			server_type: endpoint.server_type,
			instance_id: endpoint.instance_id.clone(),
			role: "primary",
			lifecycle,
		}),
		error: None,
	};
	let ack_json = match serde_json::to_string(&ack) {
		Ok(j) => j,
		Err(e) => {
			warning!(log, "Failed to serialize gateway selection ack: {:?}", e);
			return;
		}
	};
	if let Err(e) = client.send(Message::Text(ack_json.into())).await {
		debug!(log, "Gateway selection: failed to send ready ack: {:?}", e);
		return;
	}

	match target {
		GatewayTargetWs::Tcp(t) => proxy_gateway_frames(&log, client, *t).await,
		GatewayTargetWs::Socket(t) => proxy_gateway_frames(&log, client, *t).await,
	}
}

/// Sends a `{"ok":false,"error":...}` response and closes the connection.
/// Used for every selection failure path so a failed selection always
/// gets a clear error rather than the connection just dropping silently.
async fn send_gateway_error<S>(log: &log::Logger, client: &mut WebSocketStream<S>, message: String)
where
	S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
	let resp = GatewaySelectionResponse {
		ok: false,
		selected: None,
		error: Some(message.clone()),
	};
	if let Ok(json) = serde_json::to_string(&resp) {
		let _ = client.send(Message::Text(json.into())).await;
	}
	let _ = client.close(None).await;
	debug!(log, "Gateway selection failed: {}", message);
}

/// The gateway's outbound connection to a selected target, opened after
/// selection completes. Kept as an enum (rather than a boxed trait
/// object) since [`AgentHostEndpointAddress`] is only ever `Tcp` or
/// `Socket`; [`proxy_gateway_frames`] is generic so each variant is
/// proxied via its own monomorphization.
enum GatewayTargetWs {
	// Both variants are boxed: these streams carry large inline buffers (and a
	// TLS state for TCP), so leaving either unboxed makes every value of this
	// enum as large as the biggest one.
	Tcp(Box<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>),
	Socket(Box<WebSocketStream<AsyncPipe>>),
}

/// Opens a raw WebSocket connection to a selected registry endpoint,
/// injecting its connection token as the `tkn` query parameter the same
/// way [`inject_connection_token`] does for the legacy per-request proxy.
/// No AHP-level handshake is performed here -- once selection completes
/// the gateway proxies frames verbatim, so this only needs to reach the
/// WebSocket layer.
async fn dial_gateway_target(
	endpoint: &AgentHostEndpointMetadata,
) -> Result<GatewayTargetWs, AnyError> {
	let token_query = if endpoint.connection_token.is_empty() {
		String::new()
	} else {
		let encoded: String =
			url::form_urlencoded::byte_serialize(endpoint.connection_token.as_bytes()).collect();
		format!("?tkn={encoded}")
	};

	match &endpoint.endpoint {
		AgentHostEndpointAddress::Tcp { host, port } => {
			let dial_host = crate::commands::agent_host::dial_host(Some(host));
			let url = format!("ws://{dial_host}:{port}/{token_query}");
			let (ws, _) = tokio_tungstenite::connect_async(url)
				.await
				.map_err(|e| wrap(e, "Failed to connect to selected agent host"))?;
			Ok(GatewayTargetWs::Tcp(Box::new(ws)))
		}
		AgentHostEndpointAddress::Socket { path } => {
			let pipe = get_socket_rw_stream(std::path::Path::new(path))
				.await
				.map_err(|e| {
					wrap(
						e,
						format!("Failed to connect to selected agent host socket at {path}"),
					)
				})?;
			let url = format!("ws://localhost/{token_query}");
			let (ws, _) = tokio_tungstenite::client_async(url, pipe)
				.await
				.map_err(|e| {
					wrap(
						e,
						format!(
							"WebSocket handshake over selected agent host socket {path} failed"
						),
					)
				})?;
			Ok(GatewayTargetWs::Socket(Box::new(ws)))
		}
	}
}

/// Bidirectionally forwards WebSocket frames between the tunnel client
/// and the selected target until either side closes or errors. Generic
/// over both stream types so it is shared between the `Tcp` and `Socket`
/// [`GatewayTargetWs`] variants.
async fn proxy_gateway_frames<A, B>(
	log: &log::Logger,
	mut client: WebSocketStream<A>,
	mut target: WebSocketStream<B>,
) where
	A: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
	B: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
	loop {
		tokio::select! {
			msg = client.next() => match msg {
				Some(Ok(Message::Close(_))) | None => {
					let _ = target.close(None).await;
					return;
				}
				Some(Ok(m)) => {
					if let Err(e) = target.send(m).await {
						debug!(log, "Gateway proxy: failed forwarding client frame to target: {:?}", e);
						return;
					}
				}
				Some(Err(e)) => {
					debug!(log, "Gateway proxy: client connection error: {:?}", e);
					return;
				}
			},
			msg = target.next() => match msg {
				Some(Ok(Message::Close(_))) | None => {
					let _ = client.close(None).await;
					return;
				}
				Some(Ok(m)) => {
					if let Err(e) = client.send(m).await {
						debug!(log, "Gateway proxy: failed forwarding target frame to client: {:?}", e);
						return;
					}
				}
				Some(Err(e)) => {
					debug!(log, "Gateway proxy: target connection error: {:?}", e);
					return;
				}
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::util::http::ReqwestSimpleHttp;
	use std::path::Path;

	fn make_test_manager(cache_dir: &Path) -> Arc<AgentHostManager> {
		AgentHostManager::new(
			log::Logger::test(),
			Platform::LinuxX64,
			DownloadCache::new(cache_dir.to_path_buf()),
			Arc::new(ReqwestSimpleHttp::new()),
			AgentHostConfig {
				server_data_dir: None,
				telemetry_level: None,
				without_connection_token: true,
				connection_token: None,
				connection_token_file: None,
			},
		)
	}

	#[tokio::test]
	async fn management_listener_returns_404_for_unknown_paths() {
		let dir = tempfile::tempdir().unwrap();
		let manager = make_test_manager(dir.path());
		let socket_path = manager.management_socket_path().clone();
		manager.ensure_management_listener();
		// First-bind is synchronous but spawn scheduling is not; a short
		// sleep makes the test deterministic on slow CI hosts.
		tokio::time::sleep(Duration::from_millis(50)).await;

		let pipe = get_socket_rw_stream(&socket_path).await.expect("connect");
		let io = TokioIo::new(pipe);
		let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
		tokio::spawn(async move {
			let _ = conn.await;
		});
		let req = Request::builder()
			.method("GET")
			.uri("/nope")
			.body(http_body_util::Empty::<bytes::Bytes>::new())
			.unwrap();
		let res = sender.send_request(req).await.expect("send");
		assert_eq!(res.status(), 404);
	}

	#[test]
	fn ensure_management_listener_is_idempotent() {
		let dir = tempfile::tempdir().unwrap();
		let manager = make_test_manager(dir.path());
		// Without a tokio runtime spawn would panic, but the atomic flip
		// itself is the contract we care about: a second call must not
		// re-trigger the spawn path. Verify by reading the underlying
		// atomic before/after manual flips.
		assert!(!manager
			.management_listener_started
			.swap(true, Ordering::SeqCst));
		assert!(manager
			.management_listener_started
			.swap(true, Ordering::SeqCst));
	}

	#[test]
	fn upgrade_response_serializes_compactly() {
		let resp = UpgradeResponse {
			ok: true,
			upgrade_needed: Some(false),
			upgrade_started: Some(false),
			running_commit: Some("abc123".into()),
			latest_commit: Some("abc123".into()),
			restart_delay_ms: None,
			error: None,
		};
		let json = serde_json::to_string(&resp).unwrap();
		assert_eq!(
			json,
			r#"{"ok":true,"upgradeNeeded":false,"upgradeStarted":false,"runningCommit":"abc123","latestCommit":"abc123"}"#
		);
	}

	#[test]
	fn upgrade_response_omits_empty_fields() {
		let resp = UpgradeResponse {
			ok: false,
			upgrade_needed: None,
			upgrade_started: None,
			running_commit: None,
			latest_commit: None,
			restart_delay_ms: None,
			error: Some("boom".into()),
		};
		let json = serde_json::to_string(&resp).unwrap();
		assert_eq!(json, r#"{"ok":false,"error":"boom"}"#);
	}

	#[test]
	fn upgrade_response_includes_restart_delay_when_set() {
		let resp = UpgradeResponse {
			ok: true,
			upgrade_needed: Some(true),
			upgrade_started: Some(true),
			running_commit: Some("old".into()),
			latest_commit: Some("new".into()),
			restart_delay_ms: Some(3000),
			error: None,
		};
		let json = serde_json::to_string(&resp).unwrap();
		assert!(json.contains(r#""restartDelayMs":3000"#), "got: {}", json);
	}

	#[tokio::test]
	async fn bind_tcp_publishes_registry_entry_with_bound_port_and_pid() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let manager = make_test_manager(dir.path());

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			Some("localhost".to_string()),
			LoopbackAuth::Token("tok".to_string()),
			Some("my-tunnel".to_string()),
			user_data_path.clone(),
			"instance-a".to_string(),
			None,
		)
		.await
		.unwrap();

		let entries =
			agent_host_registry::read_registry(&log::Logger::test(), &user_data_path).unwrap();
		assert_eq!(entries.len(), 1);
		let entry = &entries[0];
		assert_eq!(entry.server_type, AgentHostServerType::Standalone);
		assert_eq!(entry.pid, std::process::id());
		assert_eq!(entry.instance_id, "instance-a");
		assert_eq!(entry.connection_token, "tok");
		assert_eq!(entry.tunnel_name.as_deref(), Some("my-tunnel"));
		assert_eq!(entry.protocol_version, AGENT_HOST_PROTOCOL_VERSION);
		match &entry.endpoint {
			AgentHostEndpointAddress::Tcp { host, port } => {
				assert_eq!(host, "localhost");
				assert_eq!(*port, sidecar.bound_addr().port());
				assert_ne!(*port, 0);
			}
			other => panic!("expected a tcp endpoint, got {:?}", other),
		}
	}

	#[tokio::test]
	async fn serve_reports_activity_for_idle_timeout_when_enabled() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let manager = make_test_manager(dir.path());
		let (tracker, mut activity_rx) = idle_timeout::new_activity_channel();

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			None,
			LoopbackAuth::Disabled,
			None,
			user_data_path.clone(),
			"instance-activity".to_string(),
			Some(tracker),
		)
		.await
		.unwrap();

		let (shutdown, opener) = new_barrier::<ShutdownSignal>();
		let bound_addr = sidecar.bound_addr();
		let serve_task = tokio::spawn(async move { sidecar.serve(shutdown).await });

		let client = tokio::net::TcpStream::connect(bound_addr).await.unwrap();

		// A bounded wait is used only to prove the event actually
		// arrived promptly (rather than hanging the test forever if the
		// wiring were broken), not as the pass condition itself: which
		// event arrives is fully deterministic given a real accepted
		// connection.
		let connected = tokio::time::timeout(Duration::from_secs(2), activity_rx.recv())
			.await
			.expect("did not observe a Connected activity event in time");
		assert_eq!(connected, Some(idle_timeout::ActivityEvent::Connected));

		drop(client);

		let disconnected = tokio::time::timeout(Duration::from_secs(2), activity_rx.recv())
			.await
			.expect("did not observe a Disconnected activity event in time");
		assert_eq!(
			disconnected,
			Some(idle_timeout::ActivityEvent::Disconnected)
		);

		opener.open(ShutdownSignal::CtrlC);
		serve_task.await.unwrap().unwrap();
	}

	/// Regression test for the ~5-minute agent host recycle: the
	/// `--idle-timeout` activity guard must span a connection's *whole*
	/// life, including after it upgrades to a WebSocket.
	///
	/// `serve_connection_with_upgrades` resolves as soon as the upgrade is
	/// handed off, so a guard held by the task awaiting it reported a
	/// disconnect within milliseconds of a WebSocket starting. The idle
	/// timer then saw zero clients, armed, and 300s later killed a
	/// supervisor that was actively serving that WebSocket -- taking the
	/// agent host server process tree (and any in-flight turn) with it.
	/// Mirrors `AgentHostSidecar::serve`'s accept loop, including its use
	/// of `idle_timeout::GuardedStream`.
	#[tokio::test]
	async fn activity_guard_spans_whole_websocket_session_not_just_the_upgrade() {
		let (tracker, mut activity_rx) = idle_timeout::new_activity_channel();
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let addr = listener.local_addr().unwrap();

		tokio::spawn(async move {
			loop {
				let (stream, _) = listener.accept().await.unwrap();
				let stream =
					idle_timeout::GuardedStream::new(stream, Some(tracker.client_connected()));
				tokio::spawn(async move {
					let io = TokioIo::new(stream);
					let svc = service_fn(move |mut req: Request<Incoming>| async move {
						let key = req
							.headers()
							.get("sec-websocket-key")
							.map(|k| {
								tokio_tungstenite::tungstenite::handshake::derive_accept_key(
									k.as_bytes(),
								)
							})
							.unwrap();
						tokio::spawn(async move {
							if let Ok(upgraded) = hyper::upgrade::on(&mut req).await {
								let mut ws = WebSocketStream::from_raw_socket(
									TokioIo::new(upgraded),
									Role::Server,
									None,
								)
								.await;
								while let Some(Ok(m)) = ws.next().await {
									if m.is_text() {
										let _ = ws.send(m).await;
									}
								}
							}
						});
						Ok::<_, Infallible>(
							Response::builder()
								.status(101)
								.header("connection", "Upgrade")
								.header("upgrade", "websocket")
								.header("sec-websocket-accept", key)
								.body(empty_body())
								.unwrap(),
						)
					});
					let _ = ServerBuilder::new(TokioExecutor::new())
						.serve_connection_with_upgrades(io, svc)
						.await;
				});
			}
		});

		let stream = tokio::net::TcpStream::connect(addr).await.unwrap();
		let (mut client_ws, _) = tokio_tungstenite::client_async("ws://localhost/", stream)
			.await
			.expect("ws upgrade should succeed");

		assert_eq!(
			activity_rx.recv().await,
			Some(idle_timeout::ActivityEvent::Connected)
		);

		// Prove the WebSocket is genuinely alive and carrying traffic.
		client_ws
			.send(Message::Text("still here".into()))
			.await
			.unwrap();
		match client_ws.next().await {
			Some(Ok(Message::Text(t))) => assert_eq!(t.as_str(), "still here"),
			other => panic!("expected echo, got {other:?}"),
		}

		// A bounded wait is used only to prove no disconnect is reported
		// while the session is demonstrably in use; it is not a timing
		// dependency, since the pre-fix disconnect arrived immediately on
		// upgrade (long before this point) and is already queued.
		let premature = tokio::time::timeout(Duration::from_millis(500), activity_rx.recv()).await;
		assert!(
			premature.is_err(),
			"no activity event may be reported while the websocket is still open, got {premature:?}"
		);

		// Closing the connection must still report the disconnect, so the
		// idle timer can arm once the client is genuinely gone.
		drop(client_ws);
		let disconnected = tokio::time::timeout(Duration::from_secs(2), activity_rx.recv())
			.await
			.expect("did not observe a Disconnected activity event in time");
		assert_eq!(
			disconnected,
			Some(idle_timeout::ActivityEvent::Disconnected)
		);
	}

	#[tokio::test]
	async fn drop_removes_registry_entry_matching_our_identity_without_blocking_worker() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let manager = make_test_manager(dir.path());

		{
			let _sidecar = AgentHostSidecar::bind_tcp(
				log::Logger::test(),
				manager,
				SocketAddr::from(([127, 0, 0, 1], 0)),
				None,
				LoopbackAuth::Disabled,
				None,
				user_data_path.clone(),
				"instance-fallback".to_string(),
				None,
			)
			.await
			.unwrap();
			assert_eq!(
				agent_host_registry::read_registry(&log::Logger::test(), &user_data_path)
					.unwrap()
					.len(),
				1
			);
		}

		// `shutdown` was never called, so `Drop`'s fallback cleanup is
		// responsible here. It dispatches the blocking removal to a
		// separate blocking-safe thread rather than doing it inline on
		// this async task's worker, so poll briefly for it to land instead
		// of asserting immediately.
		let deadline = Instant::now() + Duration::from_secs(2);
		loop {
			if agent_host_registry::read_registry(&log::Logger::test(), &user_data_path)
				.unwrap()
				.is_empty()
			{
				break;
			}
			if Instant::now() >= deadline {
				panic!("drop's fallback registry cleanup did not complete in time");
			}
			tokio::time::sleep(Duration::from_millis(20)).await;
		}
	}

	#[tokio::test]
	async fn shutdown_leaves_registry_entry_owned_by_a_different_instance() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let manager = make_test_manager(dir.path());

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			None,
			LoopbackAuth::Disabled,
			None,
			user_data_path.clone(),
			"instance-c".to_string(),
			None,
		)
		.await
		.unwrap();

		// Simulate another live process taking over with a distinct
		// instance ID; `shutdown`/`Drop` must only ever remove the entry
		// exactly matching our own `(type, pid, instanceId)` identity.
		let foreign = AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			"instance-foreign".to_string(),
			"127.0.0.1".to_string(),
			9999,
			String::new(),
			AGENT_HOST_PROTOCOL_VERSION.to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&foreign,
		)
		.unwrap();

		sidecar.shutdown().await;

		let entries =
			agent_host_registry::read_registry(&log::Logger::test(), &user_data_path).unwrap();
		assert_eq!(entries.len(), 1);
		assert_eq!(entries[0].instance_id, "instance-foreign");
	}

	#[tokio::test]
	async fn drop_does_not_redundantly_clean_up_after_shutdown() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let manager = make_test_manager(dir.path());

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			None,
			LoopbackAuth::Disabled,
			None,
			user_data_path.clone(),
			"instance-shutdown-then-drop".to_string(),
			None,
		)
		.await
		.unwrap();

		sidecar.shutdown().await;
		assert!(
			agent_host_registry::read_registry(&log::Logger::test(), &user_data_path)
				.unwrap()
				.is_empty()
		);

		// Republish an entry reusing our own identity, simulating a case
		// where some other writer took over that exact (type, pid,
		// instanceId) slot right after `shutdown` removed it. If `Drop`
		// were to redundantly repeat cleanup after `shutdown` already
		// claimed it, it would incorrectly remove this entry too.
		let republished = AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			"instance-shutdown-then-drop".to_string(),
			"127.0.0.1".to_string(),
			9999,
			String::new(),
			AGENT_HOST_PROTOCOL_VERSION.to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&republished,
		)
		.unwrap();

		drop(sidecar);

		// Give any (incorrectly) dispatched fallback cleanup a moment to
		// run before asserting it left the republished entry untouched.
		tokio::time::sleep(Duration::from_millis(100)).await;

		let entries =
			agent_host_registry::read_registry(&log::Logger::test(), &user_data_path).unwrap();
		assert_eq!(entries.len(), 1);
		assert_eq!(entries[0].instance_id, "instance-shutdown-then-drop");
	}

	#[tokio::test]
	async fn classify_agent_host_returns_spawn_fresh_when_registry_empty() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");

		let decision = classify_agent_host(&log::Logger::test(), &user_data_path).await;

		assert_eq!(decision, AgentHostReuseDecision::SpawnFresh);
	}

	#[tokio::test]
	async fn classify_agent_host_prefers_live_registry_standalone_entry() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let pid = std::process::id();
		let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
		let port = listener.local_addr().unwrap().port();

		let entry = AgentHostEndpointMetadata::new_standalone(
			pid,
			"instance-registry".to_string(),
			"127.0.0.1".to_string(),
			port,
			"registry-tok".to_string(),
			AGENT_HOST_PROTOCOL_VERSION.to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&entry,
		)
		.unwrap();

		let decision = classify_agent_host(&log::Logger::test(), &user_data_path).await;

		assert_eq!(
			decision,
			AgentHostReuseDecision::Reuse {
				pid,
				host: Some("127.0.0.1".to_string()),
				port,
				token: Some("registry-tok".to_string()),
				tunnel_name: None,
				instance_id: "instance-registry".to_string(),
			}
		);
	}

	#[tokio::test]
	async fn classify_agent_host_never_selects_an_editor_registry_entry() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");

		let editor = AgentHostEndpointMetadata {
			schema_version:
				crate::tunnels::agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: "editor-instance".to_string(),
			protocol_version: AGENT_HOST_PROTOCOL_VERSION.to_string(),
			connection_token: "editor-tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: "/tmp/editor.sock".to_string(),
			},
			quality: None,
			tunnel_name: None,
		};
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&editor,
		)
		.unwrap();

		// With only an (ignored) editor entry present, the caller must be
		// told to spawn a fresh standalone supervisor rather than ever
		// touching the editor entry.
		let decision = classify_agent_host(&log::Logger::test(), &user_data_path).await;

		assert_eq!(decision, AgentHostReuseDecision::SpawnFresh);
	}

	#[test]
	fn inject_connection_token_appends_when_no_query() {
		let uri: ::http::Uri = "/path".parse().unwrap();
		let out = inject_connection_token(&uri, "abc def");
		assert_eq!(out.path_and_query().unwrap().as_str(), "/path?tkn=abc+def");
	}

	#[test]
	fn inject_connection_token_appends_when_query_present() {
		let uri: ::http::Uri = "/path?foo=bar".parse().unwrap();
		let out = inject_connection_token(&uri, "tok");
		assert_eq!(
			out.path_and_query().unwrap().as_str(),
			"/path?foo=bar&tkn=tok"
		);
	}

	#[test]
	fn inject_connection_token_handles_empty_path() {
		let uri: ::http::Uri = "/".parse().unwrap();
		let out = inject_connection_token(&uri, "tok");
		assert_eq!(out.path_and_query().unwrap().as_str(), "/?tkn=tok");
	}

	// ---- Protocol-v6 gateway ------------------------------------------------

	#[test]
	fn gateway_select_routing_requires_exact_path_and_upgrade_header() {
		let select_with_upgrade = Request::builder()
			.uri(AGENT_HOST_GATEWAY_SELECT_PATH)
			.header(::http::header::UPGRADE, "websocket")
			.body(())
			.unwrap();
		assert!(is_gateway_select_request(&select_with_upgrade));

		let select_without_upgrade = Request::builder()
			.uri(AGENT_HOST_GATEWAY_SELECT_PATH)
			.body(())
			.unwrap();
		assert!(
			!is_gateway_select_request(&select_without_upgrade),
			"a non-upgrade request to the select path must fall through to legacy handling"
		);

		let root_with_upgrade = Request::builder()
			.uri("/")
			.header(::http::header::UPGRADE, "websocket")
			.body(())
			.unwrap();
		assert!(
			!is_gateway_select_request(&root_with_upgrade),
			"the root route must keep going through legacy handling even for an upgrade"
		);
	}

	fn make_tcp_endpoint(instance_id: &str, port: u16, token: &str) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata::new_standalone(
			// The registry prunes entries whose pid is not a live process,
			// so tests that expect an entry to survive `list_live_endpoints`
			// must use this test process's own real pid.
			std::process::id(),
			instance_id.to_string(),
			"127.0.0.1".to_string(),
			port,
			token.to_string(),
			AGENT_HOST_PROTOCOL_VERSION.to_string(),
			Some("stable".to_string()),
			Some("my-tunnel".to_string()),
		)
	}

	async fn spawn_fake_editor_endpoint(instance_id: &str) -> AgentHostEndpointMetadata {
		let socket_path = get_socket_name();
		let mut listener = listen_socket_rw_stream(&socket_path).await.unwrap();
		tokio::spawn(async move {
			loop {
				let _connection = listener.accept().await.unwrap();
			}
		});

		AgentHostEndpointMetadata {
			schema_version:
				crate::tunnels::agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: instance_id.to_string(),
			protocol_version: AGENT_HOST_PROTOCOL_VERSION.to_string(),
			connection_token: "editor-token".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: socket_path.to_string_lossy().to_string(),
			},
			quality: Some("stable".to_string()),
			tunnel_name: None,
		}
	}

	/// Publishes an `editor` endpoint backed by a TCP listener that completes a
	/// real WebSocket handshake, so the gateway's dial path can be exercised.
	/// [`spawn_fake_editor_endpoint`] only accepts raw connections and is for
	/// tests that never get as far as dialing.
	async fn spawn_dialable_editor_endpoint(instance_id: &str) -> AgentHostEndpointMetadata {
		let port = spawn_fake_target_endpoint().await;
		AgentHostEndpointMetadata {
			schema_version:
				crate::tunnels::agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: instance_id.to_string(),
			protocol_version: AGENT_HOST_PROTOCOL_VERSION.to_string(),
			connection_token: "editor-token".to_string(),
			endpoint: AgentHostEndpointAddress::Tcp {
				host: "127.0.0.1".to_string(),
				port,
			},
			quality: Some("stable".to_string()),
			tunnel_name: None,
		}
	}

	#[test]
	fn gateway_endpoint_from_metadata_never_includes_connection_token() {
		let entry = make_tcp_endpoint("instance-a", 12345, "super-secret-token");
		let gw: AgentHostGatewayEndpoint = (&entry).into();
		let json = serde_json::to_string(&gw).unwrap();

		assert!(
			!json.contains("super-secret-token") && !json.contains("connectionToken"),
			"gateway inventory entries must never expose the connection token: {json}"
		);
		assert_eq!(
			json,
			format!(
				r#"{{"type":"standalone","pid":{},"instanceId":"instance-a","quality":"stable","tunnelName":"my-tunnel","endpointKind":"tcp","endpointLabel":"127.0.0.1:12345"}}"#,
				std::process::id()
			)
		);
	}

	#[test]
	fn gateway_endpoint_from_metadata_reports_socket_kind_and_label() {
		let entry = AgentHostEndpointMetadata {
			schema_version:
				crate::tunnels::agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: 1,
			instance_id: "editor-a".to_string(),
			protocol_version: AGENT_HOST_PROTOCOL_VERSION.to_string(),
			connection_token: "tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: "/tmp/editor.sock".to_string(),
			},
			quality: None,
			tunnel_name: None,
		};
		let gw: AgentHostGatewayEndpoint = (&entry).into();
		assert_eq!(gw.endpoint_kind, "socket");
		assert_eq!(gw.endpoint_label, "/tmp/editor.sock");
	}

	#[test]
	fn gateway_selection_request_parses_existing_instance_id() {
		let req: GatewaySelectionRequest =
			serde_json::from_str(r#"{"instanceId":"instance-a"}"#).unwrap();
		match req.parse().unwrap() {
			GatewaySelection::Existing { instance_id } => assert_eq!(instance_id, "instance-a"),
			GatewaySelection::NewDedicated => panic!("expected Existing"),
		}
	}

	#[test]
	fn gateway_selection_request_parses_new_dedicated() {
		let req: GatewaySelectionRequest =
			serde_json::from_str(r#"{"newDedicated":true}"#).unwrap();
		match req.parse().unwrap() {
			GatewaySelection::NewDedicated => {}
			GatewaySelection::Existing { .. } => panic!("expected NewDedicated"),
		}
	}

	#[test]
	fn gateway_selection_request_rejects_empty_selection() {
		let req: GatewaySelectionRequest = serde_json::from_str(r#"{}"#).unwrap();
		assert!(req.parse().is_err());

		let req: GatewaySelectionRequest = serde_json::from_str(r#"{"instanceId":""}"#).unwrap();
		assert!(
			req.parse().is_err(),
			"an empty instanceId must not be treated as a valid selection"
		);
	}

	#[test]
	fn gateway_selection_response_serializes_success_without_error_field() {
		let resp = GatewaySelectionResponse {
			ok: true,
			selected: Some(GatewaySelectedInfo {
				server_type: AgentHostServerType::Standalone,
				instance_id: "instance-a".to_string(),
				role: "primary",
				lifecycle: GatewayLifecycle::External,
			}),
			error: None,
		};
		let json = serde_json::to_string(&resp).unwrap();
		assert_eq!(
			json,
			r#"{"ok":true,"selected":{"type":"standalone","instanceId":"instance-a","role":"primary","lifecycle":"external"}}"#
		);
	}

	#[test]
	fn gateway_selection_response_serializes_error_without_selected_field() {
		let resp = GatewaySelectionResponse {
			ok: false,
			selected: None,
			error: Some("boom".to_string()),
		};
		let json = serde_json::to_string(&resp).unwrap();
		assert_eq!(json, r#"{"ok":false,"error":"boom"}"#);
	}

	/// Binds a TCP listener that completes exactly one WebSocket server
	/// handshake, echoes back one text message, then closes -- standing in
	/// for a real target agent host so [`run_gateway_session`]'s dial +
	/// proxy path can be exercised end-to-end without spawning a real
	/// supervisor process.
	async fn spawn_fake_target_endpoint() -> u16 {
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let port = listener.local_addr().unwrap().port();
		tokio::spawn(async move {
			loop {
				let (stream, _) = listener.accept().await.unwrap();
				tokio::spawn(async move {
					if let Ok(mut ws) = tokio_tungstenite::accept_async(stream).await {
						if let Some(Ok(msg)) = ws.next().await {
							let _ = ws.send(msg).await;
						}
						let _ = ws.close(None).await;
					}
				});
			}
		});
		port
	}

	/// Like [`spawn_fake_target_endpoint`], but keeps echoing for as long
	/// as the client stays connected instead of closing after one message.
	/// Needed when a test must distinguish "the proxied session is still
	/// live" from "the target hung up".
	async fn spawn_persistent_fake_target_endpoint() -> u16 {
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let port = listener.local_addr().unwrap().port();
		tokio::spawn(async move {
			loop {
				let (stream, _) = listener.accept().await.unwrap();
				tokio::spawn(async move {
					if let Ok(mut ws) = tokio_tungstenite::accept_async(stream).await {
						while let Some(Ok(msg)) = ws.next().await {
							if msg.is_text() && ws.send(msg).await.is_err() {
								break;
							}
						}
					}
				});
			}
		});
		port
	}

	/// Drives a full client-side selection session against an in-process
	/// [`run_gateway_session`] over an in-memory duplex pipe, returning the
	/// client's WebSocket end after the initial inventory message (parsed
	/// as generic JSON, since [`GatewayInventory`] only derives
	/// `Serialize`) so the test can send a selection and inspect the
	/// response.
	async fn start_gateway_session_with_registry(
		user_data_path: PathBuf,
		launcher_paths: LauncherPaths,
		delegate_to_editor: bool,
	) -> (WebSocketStream<tokio::io::DuplexStream>, serde_json::Value) {
		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		tokio::spawn(async move {
			let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
			run_gateway_session(
				log::Logger::test(),
				launcher_paths,
				user_data_path,
				delegate_to_editor,
				server_ws,
			)
			.await;
		});
		let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;
		let inventory = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => serde_json::from_str::<serde_json::Value>(&t).unwrap(),
			other => panic!("expected inventory message, got {other:?}"),
		};
		(client_ws, inventory)
	}

	#[tokio::test]
	async fn gateway_session_selects_existing_endpoint_and_proxies_frames() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());

		let port = spawn_fake_target_endpoint().await;
		let entry = make_tcp_endpoint("instance-existing", port, "");
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&entry,
		)
		.unwrap();

		let (mut client_ws, inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, false).await;
		let endpoints = inventory["endpoints"].as_array().unwrap();
		assert_eq!(endpoints.len(), 1);
		assert_eq!(endpoints[0]["instanceId"], "instance-existing");
		assert!(inventory.get("delegatedInstanceId").is_none());

		client_ws
			.send(Message::Text(
				r#"{"instanceId":"instance-existing"}"#.into(),
			))
			.await
			.unwrap();
		let ack = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => t,
			other => panic!("expected selection ack, got {other:?}"),
		};
		assert!(ack.contains(r#""ok":true"#), "got: {ack}");
		assert!(
			ack.contains(r#""instanceId":"instance-existing""#),
			"got: {ack}"
		);
		assert!(ack.contains(r#""lifecycle":"external""#), "got: {ack}");

		// Frames must now be proxied verbatim to the fake target, which
		// echoes exactly what it receives.
		client_ws.send(Message::Text("ping".into())).await.unwrap();
		let echoed = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => t,
			other => panic!("expected echoed frame, got {other:?}"),
		};
		assert_eq!(echoed, "ping");
	}

	#[tokio::test]
	async fn delegate_to_editor_gateway_inventory_contains_only_the_editor_endpoint() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let delegated = spawn_fake_editor_endpoint("editor-instance").await;
		let other = make_tcp_endpoint("other-instance", 12346, "");
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&delegated,
		)
		.unwrap();
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&other,
		)
		.unwrap();

		let (_client_ws, inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, true).await;
		assert_eq!(inventory["delegatedInstanceId"], "editor-instance");
		assert_eq!(
			inventory["endpoints"],
			serde_json::json!([{
				"type": "editor",
				"pid": std::process::id(),
				"instanceId": "editor-instance",
				"quality": "stable",
				"endpointKind": "socket",
				"endpointLabel": delegated.address_label(),
			}])
		);
	}

	#[tokio::test]
	async fn delegated_gateway_serves_bound_host_for_new_dedicated_selection() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let delegated = spawn_dialable_editor_endpoint("editor-instance").await;
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&delegated,
		)
		.unwrap();

		let (mut client_ws, _inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, true).await;
		client_ws
			.send(Message::Text(r#"{"newDedicated":true}"#.into()))
			.await
			.unwrap();
		let response = match client_ws.next().await {
			Some(Ok(Message::Text(text))) => text,
			other => panic!("expected ready acknowledgement, got {other:?}"),
		};
		// Clients that predate `delegatedInstanceId` -- and every background
		// reconnect -- ask for a dedicated host unconditionally. A delegated
		// tunnel must serve them its bound endpoint rather than failing, or
		// cross-version connections break.
		assert!(response.contains(r#""ok":true"#), "got: {response}");
		assert!(response.contains("editor-instance"), "got: {response}");
	}

	#[tokio::test]
	async fn delegated_gateway_serves_bound_host_for_a_different_instance_selection() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let delegated = spawn_dialable_editor_endpoint("editor-instance").await;
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&delegated,
		)
		.unwrap();

		let (mut client_ws, _inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, true).await;
		client_ws
			.send(Message::Text(r#"{"instanceId":"other-instance"}"#.into()))
			.await
			.unwrap();
		let response = match client_ws.next().await {
			Some(Ok(Message::Text(text))) => text,
			other => panic!("expected ready acknowledgement, got {other:?}"),
		};
		assert!(response.contains(r#""ok":true"#), "got: {response}");
		assert!(response.contains("editor-instance"), "got: {response}");
	}

	#[tokio::test]
	async fn delegate_to_editor_gateway_errors_without_a_live_editor_endpoint() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		tokio::spawn(async move {
			let server_ws = WebSocketStream::from_raw_socket(server_io, Role::Server, None).await;
			run_gateway_session(
				log::Logger::test(),
				launcher_paths,
				user_data_path,
				true,
				server_ws,
			)
			.await;
		});
		let mut client_ws = WebSocketStream::from_raw_socket(client_io, Role::Client, None).await;
		let response = match client_ws.next().await {
			Some(Ok(Message::Text(text))) => text,
			other => panic!("expected error response, got {other:?}"),
		};
		assert!(response.contains(r#""ok":false"#), "got: {response}");
		assert!(
			response.contains("no live editor agent host was found"),
			"got: {response}"
		);
	}

	#[tokio::test]
	async fn gateway_session_errors_clearly_when_selected_instance_disappeared() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());

		// Registry is empty: nothing is live, so any `instanceId` selection
		// must fail with a clear error rather than silently switching to a
		// different (nonexistent) target.
		let (mut client_ws, inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, false).await;
		assert!(inventory["endpoints"].as_array().unwrap().is_empty());

		client_ws
			.send(Message::Text(r#"{"instanceId":"does-not-exist"}"#.into()))
			.await
			.unwrap();
		let ack = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => t,
			other => panic!("expected error ack, got {other:?}"),
		};
		assert!(ack.contains(r#""ok":false"#), "got: {ack}");
		assert!(ack.contains("no longer live"), "got: {ack}");
	}

	#[tokio::test]
	async fn gateway_session_errors_on_malformed_selection() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());

		let (mut client_ws, _inventory) =
			start_gateway_session_with_registry(user_data_path, launcher_paths, false).await;

		client_ws
			.send(Message::Text("not json".into()))
			.await
			.unwrap();
		let ack = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => t,
			other => panic!("expected error ack, got {other:?}"),
		};
		assert!(ack.contains(r#""ok":false"#), "got: {ack}");
	}

	// ---- Direct-hosted tunnel router (`serve_agent_host_tunnel_connection`) --
	//
	// These exercise the exact request router `code agent host --tunnel`'s
	// `run_supervisor` now dispatches its dev-tunnel-hosted `AGENT_HOST_PORT`
	// connections through -- previously it called
	// `AgentHostSidecar::serve_tunnel_connection` unconditionally, which
	// never looked at the request path, so a renderer's `/agent-host/select`
	// upgrade (sent because the tunnel is tagged with the current
	// `PROTOCOL_VERSION_TAG`, see `constants::PROTOCOL_VERSION`'s doc
	// comment) fell straight through to the AH backend and no inventory was
	// ever sent.

	/// Accepts exactly one raw TCP connection, reads until the request's
	/// header terminator, and replies with a fixed HTTP/1.1 body -- a
	/// minimal stand-in for "the current sidecar's own local accept loop"
	/// so tests can assert the direct-hosted-tunnel router's root/default
	/// route reaches *this* fake endpoint specifically, without needing a
	/// real `AgentHostManager`-backed server.
	async fn spawn_fake_http_endpoint(body: &'static str) -> u16 {
		use tokio::io::{AsyncReadExt, AsyncWriteExt};

		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let port = listener.local_addr().unwrap().port();
		tokio::spawn(async move {
			let (mut stream, _) = listener.accept().await.unwrap();
			let mut buf = [0u8; 1024];
			let mut seen = Vec::new();
			loop {
				let n = stream.read(&mut buf).await.unwrap();
				if n == 0 {
					break;
				}
				seen.extend_from_slice(&buf[..n]);
				if seen.windows(4).any(|w| w == b"\r\n\r\n") {
					break;
				}
			}
			let response = format!(
				"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
				body.len(),
				body
			);
			stream.write_all(response.as_bytes()).await.unwrap();
		});
		port
	}

	/// The root/default route of the direct-hosted-tunnel router must
	/// resolve to exactly the `ActiveAgentHost` the caller already handed
	/// it -- mirroring how `run_supervisor` builds one from its own
	/// running sidecar's published identity (see
	/// `AgentHostSidecar::active_agent_host`) -- rather than falling back
	/// to some other discovery/spawn path. The registry here is left
	/// completely empty (no `standalone`/`editor` entries at all): if the
	/// router ever ignored the passed-in `active_agent_host` and instead
	/// consulted the registry (e.g. via `ensure_supervisor_running`), it
	/// would either 503 or try to spawn a brand-new supervisor process
	/// instead of reaching the fake endpoint below, so reaching it proves
	/// neither happened.
	#[tokio::test]
	async fn direct_tunnel_root_route_reaches_current_sidecar_without_spawning_supervisor() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());

		let fake_port = spawn_fake_http_endpoint("current-sidecar-ok").await;
		let active_agent_host = crate::tunnels::control_server::ready_active_agent_host(
			crate::commands::agent_host::ActiveAgentHost {
				pid: std::process::id(),
				host: Some("127.0.0.1".to_string()),
				port: fake_port,
				token: None,
			},
		);

		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		tokio::spawn(async move {
			serve_agent_host_tunnel_connection(
				log::Logger::test(),
				server_io,
				active_agent_host,
				launcher_paths,
				user_data_path,
				false,
			)
			.await;
		});

		let io = TokioIo::new(client_io);
		let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
		tokio::spawn(async move {
			let _ = conn.await;
		});
		let req = Request::builder()
			.method("GET")
			.uri("/")
			.body(http_body_util::Empty::<bytes::Bytes>::new())
			.unwrap();
		let res = sender.send_request(req).await.expect("send request");
		assert_eq!(res.status(), 200);
		let body = res.into_body().collect().await.unwrap().to_bytes();
		assert_eq!(&body[..], b"current-sidecar-ok" as &[u8]);
	}

	#[tokio::test]
	async fn delegated_tunnel_rejects_legacy_root_route_without_starting_a_supervisor() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let active_agent_host = crate::tunnels::control_server::ready_active_agent_host(
			crate::commands::agent_host::ActiveAgentHost {
				pid: 0,
				host: Some("127.0.0.1".to_string()),
				port: 1,
				token: None,
			},
		);

		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		tokio::spawn(async move {
			serve_agent_host_tunnel_connection(
				log::Logger::test(),
				server_io,
				active_agent_host,
				launcher_paths,
				user_data_path,
				true,
			)
			.await;
		});

		let io = TokioIo::new(client_io);
		let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await.unwrap();
		tokio::spawn(async move {
			let _ = conn.await;
		});
		let req = Request::builder()
			.method("GET")
			.uri("/")
			.body(http_body_util::Empty::<bytes::Bytes>::new())
			.unwrap();
		let res = sender.send_request(req).await.expect("send request");
		assert_eq!(res.status(), 503);
		let body = res.into_body().collect().await.unwrap().to_bytes();
		assert_eq!(
			&body[..],
			b"This tunnel serves a specific agent host; upgrade required" as &[u8]
		);
	}

	/// End-to-end regression test for the reported tunnel inventory
	/// timeout: drives an actual HTTP/1 WebSocket upgrade request for
	/// `AGENT_HOST_GATEWAY_SELECT_PATH` through
	/// `serve_agent_host_tunnel_connection` -- the same router
	/// `run_supervisor` now uses for `code agent host --tunnel`'s
	/// dev-tunnel-hosted `AGENT_HOST_PORT` -- and observes the inventory
	/// message the gateway sends immediately after upgrading. The
	/// root/default route is deliberately pointed at an unreachable
	/// address (port `1`, universally reserved/refused) so the test also
	/// proves the select path never touches the legacy direct-proxy route
	/// at all: if it did, this would hang or error instead of yielding an
	/// inventory immediately.
	///
	/// This also ties the tunnel's protocol tag to the served route: the
	/// tunnel `code agent host --tunnel` creates is tagged with the
	/// current `PROTOCOL_VERSION_TAG` (`constants::PROTOCOL_VERSION`,
	/// currently `6`), which is exactly the version that introduced this
	/// selection route (see that constant's doc comment) -- so a tunnel
	/// tagged this way must always be served by a router that understands
	/// `AGENT_HOST_GATEWAY_SELECT_PATH`.
	#[tokio::test]
	async fn direct_tunnel_select_route_dispatches_gateway_and_returns_inventory() {
		const {
			assert!(
				crate::constants::PROTOCOL_VERSION >= 6,
				"the gateway selection route requires protocol v6+"
			);
		};

		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());

		let target_port = spawn_fake_target_endpoint().await;
		let entry = make_tcp_endpoint("instance-direct-tunnel", target_port, "");
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&entry,
		)
		.unwrap();

		let active_agent_host = crate::tunnels::control_server::ready_active_agent_host(
			crate::commands::agent_host::ActiveAgentHost {
				pid: 0,
				host: Some("127.0.0.1".to_string()),
				// Port 1 is a reserved, universally-refused TCP port: any
				// attempt to dial it (i.e. the legacy root route) fails
				// immediately rather than silently succeeding.
				port: 1,
				token: None,
			},
		);

		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		tokio::spawn(async move {
			serve_agent_host_tunnel_connection(
				log::Logger::test(),
				server_io,
				active_agent_host,
				launcher_paths,
				user_data_path,
				false,
			)
			.await;
		});

		let (mut client_ws, _resp) = tokio_tungstenite::client_async(
			format!("ws://localhost{AGENT_HOST_GATEWAY_SELECT_PATH}"),
			client_io,
		)
		.await
		.expect("gateway select upgrade should succeed");

		let inventory = match client_ws.next().await {
			Some(Ok(Message::Text(t))) => serde_json::from_str::<serde_json::Value>(&t).unwrap(),
			other => panic!("expected inventory message, got {other:?}"),
		};
		let endpoints = inventory["endpoints"].as_array().unwrap();
		assert_eq!(endpoints.len(), 1);
		assert_eq!(endpoints[0]["instanceId"], "instance-direct-tunnel");
	}

	/// The dev-tunnel-hosted port in `run_supervisor` is handed sockets by
	/// the tunnel relay, so they never pass through
	/// `AgentHostSidecar::serve`'s accept loop and get no guard from it.
	/// The gateway's inner dial back into our own listener does not cover
	/// this either: a client still deciding what to select, or one whose
	/// selection resolves to a *different* endpoint (as here), never
	/// reaches that accept loop, so the supervisor owning the tunnel would
	/// see zero clients and could time itself out while actively proxying.
	///
	/// Drives the real router (`serve_agent_host_tunnel_connection`) over a
	/// guarded transport, exactly as `run_supervisor` now wires it up.
	#[tokio::test]
	async fn tunnel_hosted_gateway_connection_counts_as_activity_for_its_whole_session() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let launcher_paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		let (tracker, mut activity_rx) = idle_timeout::new_activity_channel();

		// A live endpoint that is *not* this supervisor, so a selection
		// resolving to it never dials our own listener.
		let target_port = spawn_persistent_fake_target_endpoint().await;
		let entry = make_tcp_endpoint("instance-other-host", target_port, "");
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&entry,
		)
		.unwrap();

		let active_agent_host = crate::tunnels::control_server::ready_active_agent_host(
			crate::commands::agent_host::ActiveAgentHost {
				pid: 0,
				host: Some("127.0.0.1".to_string()),
				port: 1,
				token: None,
			},
		);

		let (client_io, server_io) = tokio::io::duplex(64 * 1024);
		let server_io =
			idle_timeout::GuardedStream::new(server_io, Some(tracker.client_connected()));
		tokio::spawn(async move {
			serve_agent_host_tunnel_connection(
				log::Logger::test(),
				server_io,
				active_agent_host,
				launcher_paths,
				user_data_path,
				false,
			)
			.await;
		});

		let (mut client_ws, _resp) = tokio_tungstenite::client_async(
			format!("ws://localhost{AGENT_HOST_GATEWAY_SELECT_PATH}"),
			client_io,
		)
		.await
		.expect("gateway select upgrade should succeed");

		assert_eq!(
			activity_rx.recv().await,
			Some(idle_timeout::ActivityEvent::Connected)
		);

		match client_ws.next().await {
			Some(Ok(Message::Text(_))) => {}
			other => panic!("expected inventory message, got {other:?}"),
		}

		// Select the *other* endpoint and exchange a frame through the
		// proxy, proving the session is live and served entirely by this
		// tunnel connection without any inner dial back into our listener.
		client_ws
			.send(Message::Text(
				r#"{"instanceId":"instance-other-host"}"#.into(),
			))
			.await
			.unwrap();
		match client_ws.next().await {
			Some(Ok(Message::Text(t))) => {
				let ack: serde_json::Value = serde_json::from_str(&t).unwrap();
				assert_eq!(ack["ok"], true);
			}
			other => panic!("expected selection ack, got {other:?}"),
		}
		client_ws.send(Message::Text("ping".into())).await.unwrap();
		match client_ws.next().await {
			Some(Ok(Message::Text(t))) => assert_eq!(t.as_str(), "ping"),
			other => panic!("expected proxied echo, got {other:?}"),
		}

		let premature = tokio::time::timeout(Duration::from_millis(500), activity_rx.recv()).await;
		assert!(
			premature.is_err(),
			"a proxied tunnel client must count as activity for its whole session, got {premature:?}"
		);

		drop(client_ws);
		let disconnected = tokio::time::timeout(Duration::from_secs(2), activity_rx.recv())
			.await
			.expect("did not observe a Disconnected activity event in time");
		assert_eq!(
			disconnected,
			Some(idle_timeout::ActivityEvent::Disconnected)
		);
	}
}
