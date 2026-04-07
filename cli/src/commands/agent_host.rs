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

use hyper::service::{make_service_fn, service_fn};
use hyper::Server;

use crate::log;
use crate::tunnels::agent_host::{handle_request, AgentHostConfig, AgentHostManager};
use crate::tunnels::legal;
use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::update_service::Platform;
use crate::util::errors::AnyError;
use crate::util::errors::CodeError;
use crate::util::http::ReqwestSimpleHttp;
use crate::util::prereqs::PreReqChecker;

use super::{args::AgentHostArgs, CommandContext};

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

	let manager = AgentHostManager::new(
		ctx.log.clone(),
		platform,
		ctx.paths.server_cache.clone(),
		Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
		AgentHostConfig {
			server_data_dir: args.server_data_dir.clone(),
			without_connection_token: args.without_connection_token,
			connection_token: args.connection_token.clone(),
			connection_token_file: args.connection_token_file.clone(),
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
