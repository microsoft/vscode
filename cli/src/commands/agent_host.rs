/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::convert::Infallible;
use std::fs;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use crate::async_pipe::{get_socket_name, get_socket_rw_stream, AsyncPipe};
use crate::constants::VSCODE_CLI_QUALITY;
use crate::download_cache::DownloadCache;
use crate::log;
use crate::options::Quality;
use crate::tunnels::paths::{get_server_folder_name, SERVER_FOLDER_NAME};
use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::update_service::{
	unzip_downloaded_release, Platform, Release, TargetKind, UpdateService,
};
use crate::util::command::new_script_command;
use crate::util::errors::AnyError;
use crate::util::http::{self, ReqwestSimpleHttp};
use crate::util::io::SilentCopyProgress;
use crate::util::sync::{new_barrier, Barrier, BarrierOpener};
use crate::{
	tunnels::legal,
	util::{errors::CodeError, prereqs::PreReqChecker},
};

use super::{args::AgentHostArgs, CommandContext};

/// How often to check for server updates.
const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
/// How often to re-check whether the server has exited when an update is pending.
const UPDATE_POLL_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// How long to wait for the server to signal readiness.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Runs a local agent host server. Downloads the latest VS Code server on
/// demand, starts it with `--enable-remote-auto-shutdown`, and proxies
/// WebSocket connections from a local TCP port to the server's agent host
/// socket. The server auto-shuts down when idle; the CLI checks for updates
/// in the background and starts the latest version on the next connection.
pub async fn agent_host(ctx: CommandContext, mut args: AgentHostArgs) -> Result<i32, AnyError> {
	legal::require_consent(&ctx.paths, args.accept_server_license_terms)?;

	let platform: Platform = PreReqChecker::new().verify().await?;

	if !args.without_connection_token {
		if let Some(p) = args.connection_token_file.as_deref() {
			let token = fs::read_to_string(PathBuf::from(p))
				.map_err(CodeError::CouldNotReadConnectionTokenFile)?;
			args.connection_token = Some(token.trim().to_string());
		} else {
			let token_path = ctx.paths.root().join("agent-host-token");
			let token = mint_connection_token(&token_path, args.connection_token.clone())
				.map_err(CodeError::CouldNotCreateConnectionTokenFile)?;
			args.connection_token = Some(token);
			args.connection_token_file = Some(token_path.to_string_lossy().to_string());
		}
	}

	let manager = AgentHostManager::new(&ctx, platform, args.clone())?;

	// Eagerly resolve the latest version so the first connection is fast.
	// Skip when using a dev override since updates don't apply.
	if option_env!("VSCODE_CLI_OVERRIDE_SERVER_PATH").is_none() {
		match manager.get_latest_release().await {
			Ok(release) => {
				if let Err(e) = manager.ensure_downloaded(&release).await {
					warning!(ctx.log, "Error downloading latest server version: {}", e);
				}
			}
			Err(e) => warning!(ctx.log, "Error resolving initial server version: {}", e),
		}

		// Start background update checker
		let manager_for_updates = manager.clone();
		tokio::spawn(async move {
			manager_for_updates.run_update_loop().await;
		});
	}

	// Bind the HTTP/WebSocket proxy
	let mut shutdown = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);

	let addr: SocketAddr = match &args.host {
		Some(h) => SocketAddr::new(h.parse().map_err(CodeError::InvalidHostAddress)?, args.port),
		None => SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), args.port),
	};
	let builder = Server::try_bind(&addr).map_err(CodeError::CouldNotListenOnInterface)?;
	let bound_addr = builder.local_addr();

	let mut url = format!("ws://{bound_addr}");
	if let Some(ct) = &args.connection_token {
		url.push_str(&format!("?tkn={ct}"));
	}
	ctx.log
		.result(format!("Agent host proxy listening on {url}"));

	let manager_for_svc = manager.clone();
	let make_svc = move || {
		let mgr = manager_for_svc.clone();
		let service = service_fn(move |req| {
			let mgr = mgr.clone();
			async move { handle_request(mgr, req).await }
		});
		async move { Ok::<_, Infallible>(service) }
	};

	let server_future = builder
		.serve(make_service_fn(|_| make_svc()))
		.with_graceful_shutdown(async {
			let _ = shutdown.wait().await;
		});

	let r = server_future.await;
	manager.kill_running_server().await;
	r.map_err(CodeError::CouldNotListenOnInterface)?;

	Ok(0)
}

// ---- AgentHostManager -------------------------------------------------------

/// State of the running VS Code server process.
struct RunningServer {
	child: tokio::process::Child,
	commit: String,
}

/// Manages the VS Code server lifecycle: on-demand start, auto-restart
/// after idle shutdown, and background update checking.
struct AgentHostManager {
	log: log::Logger,
	args: AgentHostArgs,
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
	fn new(
		ctx: &CommandContext,
		platform: Platform,
		args: AgentHostArgs,
	) -> Result<Arc<Self>, CodeError> {
		// Seed latest_release from cache if available
		let cache = ctx.paths.server_cache.clone();
		Ok(Arc::new(Self {
			log: ctx.log.clone(),
			args,
			platform,
			cache,
			update_service: UpdateService::new(
				ctx.log.clone(),
				Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
			),
			latest_release: Mutex::new(None),
			running: Mutex::new(None),
			ready: Mutex::new(None),
		}))
	}

	/// Returns the socket path to a running server, starting one if needed.
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

		if let Some(a) = &self.args.server_data_dir {
			cmd.arg("--server-data-dir");
			cmd.arg(a);
		}
		if self.args.without_connection_token {
			cmd.arg("--without-connection-token");
		}
		if let Some(ct) = &self.args.connection_token_file {
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
					break;
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

		if !ready {
			return;
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
					// Only clear if it's still our server
				}
			}
			*running = None;
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
			.ok_or_else(|| CodeError::UpdatesNotConfigured("no configured quality"))
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
	async fn ensure_downloaded(&self, release: &Release) -> Result<PathBuf, CodeError> {
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
	async fn get_latest_release(&self) -> Result<Release, CodeError> {
		let mut latest = self.latest_release.lock().await;
		let now = Instant::now();

		let quality = VSCODE_CLI_QUALITY
			.ok_or_else(|| CodeError::UpdatesNotConfigured("no configured quality"))
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
	async fn run_update_loop(self: Arc<Self>) {
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
	async fn kill_running_server(&self) {
		let mut running = self.running.lock().await;
		if let Some(mut server) = running.take() {
			let _ = server.child.kill().await;
		}
	}
}

// ---- HTTP/WebSocket proxy ---------------------------------------------------

/// Proxies an incoming HTTP/WebSocket request to the agent host's Unix socket.
async fn handle_request(
	manager: Arc<AgentHostManager>,
	req: Request<Body>,
) -> Result<Response<Body>, Infallible> {
	let socket_path = match manager.ensure_server().await {
		Ok(p) => p,
		Err(e) => {
			error!(manager.log, "Error starting agent host: {:?}", e);
			return Ok(Response::builder()
				.status(503)
				.body(Body::from(format!("Error starting agent host: {e:?}")))
				.unwrap());
		}
	};

	let is_upgrade = req.headers().contains_key(hyper::header::UPGRADE);

	let rw = match get_socket_rw_stream(&socket_path).await {
		Ok(rw) => rw,
		Err(e) => {
			error!(
				manager.log,
				"Error connecting to agent host socket: {:?}", e
			);
			return Ok(Response::builder()
				.status(503)
				.body(Body::from(format!("Error connecting to agent host: {e:?}")))
				.unwrap());
		}
	};

	if is_upgrade {
		Ok(forward_ws_to_server(rw, req).await)
	} else {
		Ok(forward_http_to_server(rw, req).await)
	}
}

/// Proxies a standard HTTP request through the socket.
async fn forward_http_to_server(rw: AsyncPipe, req: Request<Body>) -> Response<Body> {
	let (mut request_sender, connection) =
		match hyper::client::conn::Builder::new().handshake(rw).await {
			Ok(r) => r,
			Err(e) => return connection_err(e),
		};

	tokio::spawn(connection);

	request_sender
		.send_request(req)
		.await
		.unwrap_or_else(connection_err)
}

/// Proxies a WebSocket upgrade request through the socket.
async fn forward_ws_to_server(rw: AsyncPipe, mut req: Request<Body>) -> Response<Body> {
	let (mut request_sender, connection) =
		match hyper::client::conn::Builder::new().handshake(rw).await {
			Ok(r) => r,
			Err(e) => return connection_err(e),
		};

	tokio::spawn(connection);

	let mut proxied_req = Request::builder().uri(req.uri());
	for (k, v) in req.headers() {
		proxied_req = proxied_req.header(k, v);
	}

	let mut res = request_sender
		.send_request(proxied_req.body(Body::empty()).unwrap())
		.await
		.unwrap_or_else(connection_err);

	let mut proxied_res = Response::new(Body::empty());
	*proxied_res.status_mut() = res.status();
	for (k, v) in res.headers() {
		proxied_res.headers_mut().insert(k, v.clone());
	}

	if res.status() == hyper::StatusCode::SWITCHING_PROTOCOLS {
		tokio::spawn(async move {
			let (s_req, s_res) =
				tokio::join!(hyper::upgrade::on(&mut req), hyper::upgrade::on(&mut res));

			if let (Ok(mut s_req), Ok(mut s_res)) = (s_req, s_res) {
				let _ = tokio::io::copy_bidirectional(&mut s_req, &mut s_res).await;
			}
		});
	}

	proxied_res
}

fn connection_err(err: hyper::Error) -> Response<Body> {
	Response::builder()
		.status(503)
		.body(Body::from(format!(
			"Error connecting to agent host: {err:?}"
		)))
		.unwrap()
}

fn mint_connection_token(path: &Path, prefer_token: Option<String>) -> std::io::Result<String> {
	#[cfg(not(windows))]
	use std::os::unix::fs::OpenOptionsExt;

	let mut f = fs::OpenOptions::new();
	f.create(true);
	f.write(true);
	f.read(true);
	#[cfg(not(windows))]
	f.mode(0o600);
	let mut f = f.open(path)?;

	if prefer_token.is_none() {
		let mut t = String::new();
		f.read_to_string(&mut t)?;
		let t = t.trim();
		if !t.is_empty() {
			return Ok(t.to_string());
		}
	}

	f.set_len(0)?;
	let prefer_token = prefer_token.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
	f.write_all(prefer_token.as_bytes())?;
	Ok(prefer_token)
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::fs;

	#[test]
	fn mint_connection_token_generates_and_persists() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		// First call with no preference generates a UUID and persists it
		let token1 = mint_connection_token(&path, None).unwrap();
		assert!(!token1.is_empty());
		assert_eq!(fs::read_to_string(&path).unwrap(), token1);

		// Second call with no preference reads the existing token
		let token2 = mint_connection_token(&path, None).unwrap();
		assert_eq!(token1, token2);
	}

	#[test]
	fn mint_connection_token_respects_preferred() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		// Providing a preferred token writes it to the file
		let token = mint_connection_token(&path, Some("my-token".to_string())).unwrap();
		assert_eq!(token, "my-token");
		assert_eq!(fs::read_to_string(&path).unwrap(), "my-token");
	}

	#[test]
	fn mint_connection_token_preferred_overwrites_existing() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		mint_connection_token(&path, None).unwrap();

		// Providing a preference overwrites any existing token
		let token = mint_connection_token(&path, Some("override".to_string())).unwrap();
		assert_eq!(token, "override");
		assert_eq!(fs::read_to_string(&path).unwrap(), "override");
	}
}
