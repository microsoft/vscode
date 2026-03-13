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

use std::time::Duration;

use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::async_pipe::{get_socket_name, get_socket_rw_stream, AsyncPipe};
use crate::constants::VSCODE_CLI_QUALITY;
use crate::log;
use crate::options::Quality;
use crate::tunnels::paths::{get_server_folder_name, SERVER_FOLDER_NAME};
use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::update_service::{unzip_downloaded_release, Platform, TargetKind, UpdateService};
use crate::util::command::new_script_command;
use crate::util::errors::AnyError;
use crate::util::http::{self, ReqwestSimpleHttp};
use crate::util::io::SilentCopyProgress;
use crate::{
	tunnels::legal,
	util::{errors::CodeError, prereqs::PreReqChecker},
};

use super::{args::AgentHostArgs, CommandContext};

/// Runs a local agent host server. Downloads the latest VS Code server,
/// starts it with `--agent-host-path`, and proxies connections from a
/// local TCP port to the server's agent host socket.
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

	let quality = VSCODE_CLI_QUALITY
		.ok_or_else(|| CodeError::UpdatesNotConfigured("no configured quality"))
		.and_then(|q| {
			Quality::try_from(q).map_err(|_| CodeError::UpdatesNotConfigured("unknown quality"))
		})?;

	let update_service = UpdateService::new(
		ctx.log.clone(),
		Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
	);

	// Download the latest headless server
	let release = update_service
		.get_latest_commit(platform, TargetKind::Server, quality)
		.await?;
	info!(ctx.log, "Resolved server version: {}", release);

	let name = get_server_folder_name(quality, &release.commit);
	let server_dir = if let Some(dir) = ctx.paths.server_cache.exists(&name) {
		info!(ctx.log, "Server already downloaded");
		dir
	} else {
		info!(ctx.log, "Downloading server {}", release.commit);
		let release_for_download = release.clone();
		let log_for_download = ctx.log.clone();
		ctx.paths
			.server_cache
			.create(name, |target_dir| async move {
				let tmpdir = tempfile::tempdir().unwrap();
				let response = update_service
					.get_download_stream(&release_for_download)
					.await?;
				let name = response.url_path_basename().unwrap();
				let archive_path = tmpdir.path().join(name);
				http::download_into_file(
					&archive_path,
					log_for_download.get_download_logger("Downloading server:"),
					response,
				)
				.await?;
				unzip_downloaded_release(&archive_path, &target_dir, SilentCopyProgress())?;
				Ok(())
			})
			.await?
	};

	// Start the server with --agent-host-path pointing to a local socket
	// allow using the OSS server in development via an override
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
	cmd.arg("--agent-host-path");
	cmd.arg(&agent_host_socket);
	cmd.args(["--accept-server-license-terms"]);

	if let Some(a) = &args.server_data_dir {
		cmd.arg("--server-data-dir");
		cmd.arg(a);
	}
	if args.without_connection_token {
		cmd.arg("--without-connection-token");
	}
	if let Some(ct) = &args.connection_token_file {
		cmd.arg("--connection-token-file");
		cmd.arg(ct);
	}

	cmd.env_remove("VSCODE_DEV");

	let mut child = cmd.spawn().map_err(|e| CodeError::CommandFailed {
		command: executable.to_string_lossy().to_string(),
		code: -1,
		output: e.to_string(),
	})?;

	let (mut stdout, mut stderr) = (
		BufReader::new(child.stdout.take().unwrap()).lines(),
		BufReader::new(child.stderr.take().unwrap()).lines(),
	);

	// Wait for the server to signal readiness. Buffer stderr at debug level;
	// if the server fails to start within 30s, dump everything as a warning.
	let startup_timeout = Duration::from_secs(30);
	let mut stderr_buffer: Vec<String> = Vec::new();
	let ready = tokio::time::timeout(startup_timeout, async {
		loop {
			tokio::select! {
				Ok(Some(l)) = stdout.next_line() => {
					debug!(ctx.log, "[server stdout]: {}", l);
					if l.contains("Extension host agent listening on") {
						return;
					}
				}
				Ok(Some(l)) = stderr.next_line() => {
					debug!(ctx.log, "[server stderr]: {}", l);
					stderr_buffer.push(l);
				}
				else => break,
			}
		}
	})
	.await;

	if ready.is_err() {
		warning!(
			ctx.log,
			"Server did not become ready within {}s. It may still be starting up.",
			startup_timeout.as_secs()
		);
		for line in &stderr_buffer {
			warning!(ctx.log, "[server stderr]: {}", line);
		}
	}

	// Continue reading server output in the background
	let log_clone = ctx.log.clone();
	tokio::spawn(async move {
		loop {
			tokio::select! {
				Ok(Some(l)) = stdout.next_line() => {
					debug!(log_clone, "[server stdout]: {}", l);
				}
				Ok(Some(l)) = stderr.next_line() => {
					debug!(log_clone, "[server stderr]: {}", l);
				}
				else => break,
			}
		}
	});

	// Start HTTP/WebSocket proxy
	let agent_socket = agent_host_socket.clone();
	let make_svc = move || {
		let socket_path = agent_socket.clone();
		let service = service_fn(move |req| {
			let socket_path = socket_path.clone();
			async move { handle_request(socket_path, req).await }
		});
		async move { Ok::<_, Infallible>(service) }
	};

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
	ctx.log.result(format!("Listening on {url}"));

	let server_future = builder
		.serve(make_service_fn(|_| make_svc()))
		.with_graceful_shutdown(async {
			let _ = shutdown.wait().await;
		});

	let r = server_future.await;
	let _ = child.kill().await;
	r.map_err(CodeError::CouldNotListenOnInterface)?;

	Ok(0)
}

/// Proxies an incoming HTTP/WebSocket request to the agent host's Unix socket.
async fn handle_request(
	socket_path: PathBuf,
	req: Request<Body>,
) -> Result<Response<Body>, Infallible> {
	let is_upgrade = req.headers().contains_key(hyper::header::UPGRADE);

	let rw = match get_socket_rw_stream(&socket_path).await {
		Ok(rw) => rw,
		Err(e) => {
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
