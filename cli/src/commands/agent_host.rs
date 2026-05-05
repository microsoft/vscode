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
use std::time::Instant;

use ::http::{Request, Response};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto::Builder as ServerBuilder;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use crate::auth::Auth;
use crate::constants::{self, AGENT_HOST_PORT};
use crate::log;
use crate::tunnels::agent_host::{handle_request, AgentHostConfig, AgentHostManager};
use crate::tunnels::dev_tunnels::DevTunnels;
use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::update_service::Platform;
use crate::util::errors::{AnyError, CodeError};
use crate::util::http::{full_body, HyperBody, ReqwestSimpleHttp};
use crate::util::prereqs::PreReqChecker;

use super::args::AgentHostArgs;
use super::output;
use super::tunnels::fulfill_existing_tunnel_args;
use super::CommandContext;

/// Bookkeeping data written to the agent host lockfile so that other CLI
/// commands (e.g. `code agent ps`) can discover a running agent host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHostLockData {
	/// WebSocket address the agent host is listening on (e.g. `ws://127.0.0.1:4567/`).
	pub address: String,
	/// PID of the CLI process running the agent host.
	pub pid: u32,
	/// Connection token, if any.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub connection_token: Option<String>,
	/// Tunnel name, if `--tunnel` was used.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub tunnel_name: Option<String>,
}

/// Runs a local agent host server. Downloads the latest VS Code server on
/// demand, starts it with `--enable-remote-auto-shutdown`, and proxies
/// WebSocket connections from a local TCP port to the server's agent host
/// socket. The server auto-shuts down when idle; the CLI checks for updates
/// in the background and starts the latest version on the next connection.
pub async fn agent_host(ctx: CommandContext, mut args: AgentHostArgs) -> Result<i32, AnyError> {
	let started = Instant::now();

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

	let manager = AgentHostManager::new(
		ctx.log.clone(),
		platform,
		ctx.paths.server_cache.clone(),
		Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
		AgentHostConfig {
			server_data_dir: args.server_data_dir.clone(),
			// The CLI proxy enforces the connection token itself, so the
			// underlying server always runs without one. This lets tunnel
			// connections (which bypass the proxy token check) reach the
			// server without needing a token at all.
			without_connection_token: true,
			connection_token: None,
			connection_token_file: None,
		},
	);

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
	let listener = TcpListener::bind(addr)
		.await
		.map_err(CodeError::CouldNotListenOnInterface)?;
	let bound_addr = listener
		.local_addr()
		.map_err(CodeError::CouldNotListenOnInterface)?;

	let local_agent_host_url = format!("ws://{bound_addr}/");

	let product = constants::QUALITYLESS_PRODUCT_NAME;
	let token_suffix = args
		.connection_token
		.as_deref()
		.map(|t| format!("?tkn={t}"))
		.unwrap_or_default();

	// If --tunnel is set, create a dev tunnel and serve connections directly.
	let mut _tunnel_handle: Option<crate::tunnels::dev_tunnels::ActiveTunnel> = None;
	let mut tunnel_name: Option<String> = None;
	if args.tunnel {
		let mut auth = Auth::new(&ctx.paths, ctx.log.clone());
		auth.set_provider(crate::auth::AuthProvider::Github);
		let mut dt = DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);

		let mut tunnel = if let Some(existing) =
			fulfill_existing_tunnel_args(args.existing_tunnel.clone(), &args.name)
		{
			dt.start_existing_tunnel(existing).await
		} else {
			dt.start_new_launcher_tunnel(args.name.as_deref(), args.random_name, &[])
				.await
		}?;

		// Receive tunnel connections directly (no TCP forwarding) and serve
		// them without connection-token enforcement — the tunnel relay
		// provides its own authentication.
		let mut tunnel_port = tunnel.add_port_direct(AGENT_HOST_PORT).await?;
		let mgr_for_tunnel = manager.clone();
		let tunnel_log = ctx.log.clone();
		tokio::spawn(async move {
			while let Some(socket) = tunnel_port.recv().await {
				let mgr = mgr_for_tunnel.clone();
				let log = tunnel_log.clone();
				tokio::spawn(async move {
					debug!(log, "Serving tunnel agent host connection");
					let rw = socket.into_rw();
					let svc = service_fn(move |req| {
						let mgr = mgr.clone();
						async move { handle_request(mgr, req).await }
					});
					let io = TokioIo::new(rw);
					if let Err(e) = ServerBuilder::new(TokioExecutor::new())
						.serve_connection_with_upgrades(io, svc)
						.await
					{
						debug!(log, "Tunnel agent host connection ended: {:?}", e);
					}
				});
			}
		});

		tunnel_name = Some(tunnel.name.clone());
		_tunnel_handle = Some(tunnel);
	}

	output::print_banner_header(&format!("{product} Agent Host"), started.elapsed());
	if let (Some(base), Some(name)) = (constants::EDITOR_WEB_URL, &tunnel_name) {
		output::print_banner_line("Tunnel", &format!("{base}/agents/tunnel/{name}"));
	}
	output::print_network_lines(bound_addr.port(), addr.ip(), &token_suffix);
	output::print_banner_footer();

	// Write lockfile so `code agent ps` can discover this instance.
	let lockfile_path = ctx.paths.agent_host_lockfile();
	let lock_data = AgentHostLockData {
		address: local_agent_host_url,
		pid: std::process::id(),
		connection_token: args.connection_token.clone(),
		tunnel_name: tunnel_name.clone(),
	};
	if let Err(e) = write_agent_host_lockfile(&lockfile_path, &lock_data) {
		warning!(ctx.log, "Failed to write agent host lockfile: {}", e);
	}

	let manager_for_svc = manager.clone();
	let expected_token = args.connection_token.clone();

	// Accept loop: for each incoming TCP connection, serve it with hyper.
	let accept_result: Result<(), AnyError> = loop {
		tokio::select! {
			_ = shutdown.wait() => break Ok(()),
			accepted = listener.accept() => {
				let (stream, _) = match accepted {
					Ok(v) => v,
					Err(e) => {
						warning!(ctx.log, "Failed to accept connection: {}", e);
						continue;
					}
				};
				let mgr = manager_for_svc.clone();
				let token = expected_token.clone();
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
	};

	manager.kill_running_server().await;

	// Close the tunnel if one was created.
	if let Some(mut tunnel) = _tunnel_handle.take() {
		tunnel.close().await.ok();
	}

	// Clean up the lockfile.
	let _ = fs::remove_file(&lockfile_path);

	accept_result?;

	Ok(0)
}

/// Wraps [`handle_request`] with connection-token enforcement.
///
/// When `expected_token` is `Some`, the proxy requires `?tkn=<token>` on
/// the request URI. This only applies to the local TCP listener; tunnel
/// connections are served directly via `add_port_direct` and bypass this
/// function entirely.
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

fn mint_connection_token(path: &Path, prefer_token: Option<String>) -> std::io::Result<String> {
	#[cfg(not(windows))]
	use std::os::unix::fs::OpenOptionsExt;

	let mut file_options = fs::OpenOptions::new();
	file_options.create(true);
	file_options.write(true);
	file_options.read(true);
	#[cfg(not(windows))]
	file_options.mode(0o600);
	let mut file = file_options.open(path)?;

	if prefer_token.is_none() {
		let mut token = String::new();
		file.read_to_string(&mut token)?;
		let token = token.trim();
		if !token.is_empty() {
			return Ok(token.to_string());
		}
	}

	file.set_len(0)?;
	let prefer_token = prefer_token.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
	file.write_all(prefer_token.as_bytes())?;
	Ok(prefer_token)
}

fn write_agent_host_lockfile(path: &Path, lock_data: &AgentHostLockData) -> std::io::Result<()> {
	#[cfg(not(windows))]
	use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

	let mut file_options = fs::OpenOptions::new();
	file_options.create(true);
	file_options.write(true);
	file_options.truncate(true);
	#[cfg(not(windows))]
	file_options.mode(0o600);
	let mut file = file_options.open(path)?;
	#[cfg(not(windows))]
	file.set_permissions(fs::Permissions::from_mode(0o600))?;
	file.write_all(serde_json::to_string(lock_data).unwrap().as_bytes())
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
