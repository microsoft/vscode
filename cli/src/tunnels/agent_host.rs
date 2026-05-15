/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ::http::{Request, Response};
use http_body_util::BodyExt;
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto::Builder as ServerBuilder;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

use crate::async_pipe::{get_socket_name, get_socket_rw_stream};
use crate::constants::VSCODE_CLI_QUALITY;
use crate::download_cache::DownloadCache;
use crate::log;
use crate::options::Quality;
use crate::update_service::{
	unzip_downloaded_release, Platform, Release, TargetKind, UpdateService,
};
use crate::util::command::new_script_command;
use crate::util::errors::{AnyError, CodeError};
use crate::util::http::{self, BoxedHttp};
use crate::util::http::{empty_body, full_body, HyperBody};
use crate::util::io::SilentCopyProgress;
use crate::util::sync::{new_barrier, Barrier, BarrierOpener};

use super::agent_host_metadata::{
	remove_agent_host_metadata_for_pid, write_agent_host_metadata, AgentHostMetadata,
};
use super::paths::{get_server_folder_name, SERVER_FOLDER_NAME};
use super::shutdown_signal::ShutdownSignal;

/// How often to check for server updates.
pub const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// How often to re-check whether the server has exited when an update is pending.
pub const UPDATE_POLL_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// How long to wait for the server to signal readiness.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Configuration for the agent host server process.
#[derive(Clone, Debug)]
pub struct AgentHostConfig {
	pub server_data_dir: Option<String>,
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
		if self.config.without_connection_token {
			cmd.arg("--without-connection-token");
		}
		if let Some(ct) = &self.config.connection_token_file {
			cmd.arg("--connection-token-file");
			cmd.arg(ct);
		}
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
	pub async fn kill_running_server(&self) {
		let mut running = self.running.lock().await;
		if let Some(mut server) = running.take() {
			let _ = server.child.kill().await;
		}
	}
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
	lockfile_path: PathBuf,
	pid: u32,
}

impl AgentHostSidecar {
	/// Binds a TCP listener at `addr`, writes the canonical agent host
	/// lockfile pointing at the bound port, and returns a sidecar ready to
	/// [`serve`](Self::serve) connections. The agent host backend is *not*
	/// started here — the wrapped [`AgentHostManager`] starts it on demand
	/// when the first request arrives.
	///
	/// `loopback_auth` decides whether the local TCP accept loop enforces a
	/// connection token. The caller MUST make this choice deliberately:
	/// loopback is reachable from any local process, so binding without a
	/// token must be a conscious user opt-in (e.g. `--without-connection-token`).
	pub async fn bind_tcp(
		log: log::Logger,
		manager: Arc<AgentHostManager>,
		addr: SocketAddr,
		host_label: Option<String>,
		loopback_auth: LoopbackAuth,
		tunnel_name: Option<String>,
		lockfile_path: PathBuf,
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
		let metadata = build_metadata(
			pid,
			host,
			bound_addr.port(),
			public_token.clone(),
			tunnel_name.as_deref(),
		);
		if let Err(e) = write_agent_host_metadata(&lockfile_path, &metadata) {
			warning!(log, "Failed to write agent host lockfile: {}", e);
		}

		Ok(Arc::new(Self {
			log,
			manager,
			listener,
			bound_addr,
			public_token,
			lockfile_path,
			pid,
		}))
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

	/// Stops the agent host backend and removes the lockfile if it still
	/// belongs to this process. Safe to call multiple times.
	pub async fn shutdown(&self) {
		self.manager.kill_running_server().await;
		if let Err(e) = remove_agent_host_metadata_for_pid(&self.lockfile_path, self.pid) {
			warning!(self.log, "Failed to clean up agent host lockfile: {}", e);
		}
	}
}

impl Drop for AgentHostSidecar {
	fn drop(&mut self) {
		// Best-effort cleanup if the caller forgot to call `shutdown`. Only
		// removes the lockfile when the recorded PID still matches us.
		let _ = remove_agent_host_metadata_for_pid(&self.lockfile_path, self.pid);
	}
}

fn build_metadata(
	pid: u32,
	host: String,
	port: u16,
	connection_token: Option<String>,
	tunnel_name: Option<&str>,
) -> AgentHostMetadata {
	let mut metadata = AgentHostMetadata::new(pid, port);
	metadata.host = Some(host);
	metadata.connection_token = connection_token;
	metadata.quality = VSCODE_CLI_QUALITY.map(str::to_string);
	metadata.tunnel_name = tunnel_name.map(str::to_string);
	metadata
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

// ---- Lockfile-aware reuse ---------------------------------------------------

/// Decision derived from inspecting `agent-host-<quality>.lock`. Used by
/// CLI entry points (e.g. `code tunnel`, `code agent host`) to decide
/// whether they may safely own the agent host lockfile or should forward
/// to / share the existing one.
///
/// The agent host server is downloaded on demand and may speak a newer
/// protocol than the CLI itself is built with, so we deliberately do NOT
/// check the protocol version: any live registered supervisor is always
/// considered reusable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentHostLockfileDecision {
	/// No live agent host registered; the caller may start its own sidecar.
	SpawnFresh,
	/// A live agent host supervisor owns the lockfile. Tunnel callers
	/// should forward to `127.0.0.1:port` instead of binding a second
	/// listener / clobbering the lockfile. `host` and `tunnel_name`
	/// expose the supervisor's effective config so foreground callers
	/// can detect a configuration conflict and refuse to silently reuse.
	Reuse {
		pid: u32,
		host: Option<String>,
		port: u16,
		token: Option<String>,
		tunnel_name: Option<String>,
	},
}

/// Inspect the agent host lockfile at `path` and decide whether the caller
/// should spawn a fresh sidecar or reuse an existing live one. Missing /
/// unreadable / stale (dead-PID) lockfiles all map to
/// [`AgentHostLockfileDecision::SpawnFresh`].
pub fn classify_agent_host_lockfile(
	log: &log::Logger,
	path: &std::path::Path,
) -> AgentHostLockfileDecision {
	use super::agent_host_metadata::read_agent_host_metadata;
	use crate::util::machine::process_exists;

	let metadata = match read_agent_host_metadata(path) {
		Ok(Some(m)) => m,
		Ok(None) => return AgentHostLockfileDecision::SpawnFresh,
		Err(e) => {
			debug!(
				log,
				"Could not read agent host lockfile {}: {}",
				path.display(),
				e
			);
			return AgentHostLockfileDecision::SpawnFresh;
		}
	};

	if !process_exists(metadata.pid) {
		debug!(
			log,
			"Agent host lockfile {} references dead PID {}; treating as stale",
			path.display(),
			metadata.pid
		);
		return AgentHostLockfileDecision::SpawnFresh;
	}

	AgentHostLockfileDecision::Reuse {
		pid: metadata.pid,
		host: metadata.host,
		port: metadata.port,
		token: metadata.connection_token,
		tunnel_name: metadata.tunnel_name,
	}
}

/// Forwards a single tunnel-relayed connection to an existing agent host
/// listening on `<upstream_host>:<upstream_port>`. Mirrors the TS-side
/// `AgentHostProxy`: per request, it opens a TCP connection upstream and
/// injects `?tkn=<token>` into the request URI when the lockfile records a
/// connection token. `upstream_host` should already be a dialable
/// loopback address (the caller is responsible for mapping wildcard
/// binds like `0.0.0.0` to the corresponding loopback).
pub async fn forward_tunnel_connection_to_existing_ah<RW>(
	log: log::Logger,
	rw: RW,
	upstream_host: String,
	upstream_port: u16,
	token: Option<String>,
) where
	RW: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
	let token = Arc::new(token);
	let upstream_host = Arc::new(upstream_host);
	let svc_log = log.clone();
	let svc = service_fn(move |req| {
		let log = svc_log.clone();
		let token = token.clone();
		let host = upstream_host.clone();
		async move {
			handle_reuse_request(log, (*host).clone(), upstream_port, (*token).clone(), req).await
		}
	});
	let io = TokioIo::new(rw);
	if let Err(e) = ServerBuilder::new(TokioExecutor::new())
		.serve_connection_with_upgrades(io, svc)
		.await
	{
		debug!(log, "Tunnel reuse-forward connection ended: {:?}", e);
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

#[cfg(test)]
mod tests {
	use super::*;
	use crate::tunnels::agent_host_metadata::{
		read_agent_host_metadata, AGENT_HOST_PROTOCOL_VERSION,
	};
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
				without_connection_token: true,
				connection_token: None,
				connection_token_file: None,
			},
		)
	}

	#[test]
	fn metadata_includes_quality_and_no_tunnel() {
		let metadata = build_metadata(
			42,
			"127.0.0.1".to_string(),
			8080,
			Some("tok".to_string()),
			None,
		);

		assert_eq!(metadata.pid, 42);
		assert_eq!(metadata.host.as_deref(), Some("127.0.0.1"));
		assert_eq!(metadata.port, 8080);
		assert_eq!(metadata.connection_token.as_deref(), Some("tok"));
		assert_eq!(metadata.protocol_version, AGENT_HOST_PROTOCOL_VERSION);
		assert_eq!(metadata.tunnel_name, None);
	}

	#[test]
	fn metadata_records_tunnel_name() {
		let metadata = build_metadata(42, "0.0.0.0".to_string(), 8080, None, Some("my-tunnel"));

		assert_eq!(metadata.host.as_deref(), Some("0.0.0.0"));
		assert_eq!(metadata.tunnel_name.as_deref(), Some("my-tunnel"));
	}

	#[tokio::test]
	async fn bind_tcp_writes_lockfile_with_bound_port_and_pid() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		let manager = make_test_manager(dir.path());

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			Some("localhost".to_string()),
			LoopbackAuth::Token("tok".to_string()),
			Some("my-tunnel".to_string()),
			lockfile.clone(),
		)
		.await
		.unwrap();

		let metadata = read_agent_host_metadata(&lockfile).unwrap().unwrap();
		assert_eq!(metadata.pid, std::process::id());
		assert_eq!(metadata.host.as_deref(), Some("localhost"));
		assert_eq!(metadata.port, sidecar.bound_addr().port());
		assert_ne!(metadata.port, 0);
		assert_eq!(metadata.connection_token.as_deref(), Some("tok"));
		assert_eq!(metadata.tunnel_name.as_deref(), Some("my-tunnel"));
	}

	#[tokio::test]
	async fn drop_removes_lockfile_when_pid_matches() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		let manager = make_test_manager(dir.path());

		{
			let _sidecar = AgentHostSidecar::bind_tcp(
				log::Logger::test(),
				manager,
				SocketAddr::from(([127, 0, 0, 1], 0)),
				None,
				LoopbackAuth::Disabled,
				None,
				lockfile.clone(),
			)
			.await
			.unwrap();
			assert!(lockfile.exists());
		}

		assert!(!lockfile.exists());
	}

	#[tokio::test]
	async fn shutdown_leaves_lockfile_when_pid_was_overwritten() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		let manager = make_test_manager(dir.path());

		let sidecar = AgentHostSidecar::bind_tcp(
			log::Logger::test(),
			manager,
			SocketAddr::from(([127, 0, 0, 1], 0)),
			None,
			LoopbackAuth::Disabled,
			None,
			lockfile.clone(),
		)
		.await
		.unwrap();

		// Simulate another process taking over the same lockfile path.
		let foreign_pid = std::process::id().wrapping_add(1);
		write_agent_host_metadata(&lockfile, &AgentHostMetadata::new(foreign_pid, 9999)).unwrap();

		sidecar.shutdown().await;

		let preserved = read_agent_host_metadata(&lockfile).unwrap().unwrap();
		assert_eq!(preserved.pid, foreign_pid);
		assert_eq!(preserved.port, 9999);
	}

	#[test]
	fn classify_returns_spawn_fresh_when_lockfile_missing() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("missing.lock");

		let decision = classify_agent_host_lockfile(&log::Logger::test(), &lockfile);

		assert_eq!(decision, AgentHostLockfileDecision::SpawnFresh);
	}

	#[test]
	fn classify_returns_spawn_fresh_for_stale_pid() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		// Use a PID that is extremely unlikely to exist (max u32 - 1).
		// `process_exists` returns false for unknown PIDs.
		let mut metadata = AgentHostMetadata::new(u32::MAX - 1, 1234);
		metadata.connection_token = Some("ignored".to_string());
		write_agent_host_metadata(&lockfile, &metadata).unwrap();

		let decision = classify_agent_host_lockfile(&log::Logger::test(), &lockfile);

		assert_eq!(decision, AgentHostLockfileDecision::SpawnFresh);
	}

	#[test]
	fn classify_returns_reuse_for_live_compatible_lockfile() {
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		let pid = std::process::id();
		let mut metadata = AgentHostMetadata::new(pid, 4321);
		metadata.host = Some("127.0.0.1".to_string());
		metadata.connection_token = Some("tok".to_string());
		write_agent_host_metadata(&lockfile, &metadata).unwrap();

		let decision = classify_agent_host_lockfile(&log::Logger::test(), &lockfile);

		assert_eq!(
			decision,
			AgentHostLockfileDecision::Reuse {
				pid,
				host: Some("127.0.0.1".to_string()),
				port: 4321,
				token: Some("tok".to_string()),
				tunnel_name: None,
			}
		);
	}

	#[test]
	fn classify_returns_reuse_for_live_newer_protocol() {
		// The agent host server is downloaded on demand and may speak a
		// newer protocol than the CLI is built with; we must still treat
		// it as reusable rather than refusing to share it.
		let dir = tempfile::tempdir().unwrap();
		let lockfile = dir.path().join("agent-host.lock");
		let pid = std::process::id();
		let mut metadata = AgentHostMetadata::new(pid, 4321);
		metadata.protocol_version = "9.9.9".to_string();
		metadata.connection_token = Some("tok".to_string());
		write_agent_host_metadata(&lockfile, &metadata).unwrap();

		let decision = classify_agent_host_lockfile(&log::Logger::test(), &lockfile);

		assert_eq!(
			decision,
			AgentHostLockfileDecision::Reuse {
				pid,
				host: None,
				port: 4321,
				token: Some("tok".to_string()),
				tunnel_name: None,
			}
		);
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
}
