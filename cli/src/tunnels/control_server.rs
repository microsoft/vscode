/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::commands::tunnels::ShutdownSignal;
use crate::constants::{CONTROL_PORT, PROTOCOL_VERSION, VSCODE_CLI_VERSION};
use crate::log;
use crate::self_update::SelfUpdate;
use crate::state::LauncherPaths;
use crate::update_service::{Platform, UpdateService};
use crate::util::errors::{
	wrap, AnyError, MismatchedLaunchModeError, NoAttachedServerError, ServerWriteError,
};
use crate::util::io::SilentCopyProgress;
use crate::util::sync::{new_barrier, Barrier};
use opentelemetry::trace::SpanKind;
use opentelemetry::KeyValue;
use serde::Serialize;
use std::convert::Infallible;
use std::env;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::pin;
use tokio::sync::{mpsc, Mutex};

use super::code_server::{
	AnyCodeServer, CodeServerArgs, ServerBuilder, ServerParamsRaw, SocketCodeServer,
};
use super::dev_tunnels::ActiveTunnel;
use super::paths::prune_stopped_servers;
use super::port_forwarder::{PortForwarding, PortForwardingProcessor};
use super::protocol::{
	CallServerHttpParams, CallServerHttpResult, ClientRequestMethod, EmptyResult, ErrorResponse,
	ForwardParams, ForwardResult, GetHostnameResponse, RefServerMessageParams, ResponseError,
	ServeParams, ServerLog, ServerMessageParams, ServerRequestMethod, SuccessResponse,
	ToClientRequest, ToServerRequest, UnforwardParams, UpdateParams, UpdateResult, VersionParams,
};
use super::server_bridge::{get_socket_rw_stream, FromServerMessage, ServerBridge};

type ServerBridgeList = Option<Vec<(u16, ServerBridge)>>;
type ServerBridgeListLock = Arc<Mutex<ServerBridgeList>>;

struct HandlerContext {
	/// Exit barrier for the socket.
	closer: Barrier<()>,
	/// Log handle for the server
	log: log::Logger,
	/// A loopback channel to talk to the TCP server task.
	server_tx: mpsc::Sender<ServerSignal>,
	/// A loopback channel to talk to the socket server task.
	socket_tx: mpsc::Sender<SocketSignal>,
	/// Configured launcher paths.
	launcher_paths: LauncherPaths,
	/// Connected VS Code Server
	code_server: Option<SocketCodeServer>,
	/// Potentially many "websocket" connections to client
	server_bridges: ServerBridgeListLock,
	// the cli arguments used to start the code server
	code_server_args: CodeServerArgs,
	/// counter for the number of bytes received from the socket
	rx_counter: Arc<AtomicUsize>,
	/// port forwarding functionality
	port_forwarding: PortForwarding,
	/// install platform for the VS Code server
	platform: Platform,
}

impl HandlerContext {
	async fn dispose(self) {
		let bridges: ServerBridgeList = {
			let mut lock = self.server_bridges.lock().await;
			let bridges = lock.take();
			*lock = None;
			bridges
		};

		if let Some(b) = bridges {
			for (_, bridge) in b {
				if let Err(e) = bridge.close().await {
					warning!(
						self.log,
						"Could not properly dispose of connection context: {}",
						e
					)
				} else {
					debug!(self.log, "Closed server bridge.");
				}
			}
		}

		info!(self.log, "Disposed of connection to running server.");
	}
}

enum ServerSignal {
	/// Signalled when the server has been updated and we want to respawn.
	/// We'd generally need to stop and then restart the launcher, but the
	/// program might be managed by a supervisor like systemd. Instead, we
	/// will stop the TCP listener and spawn the launcher again as a subprocess
	/// with the same arguments we used.
	Respawn,
}

struct CloseReason(String);

enum SocketSignal {
	/// Signals bytes to send to the socket.
	Send(Vec<u8>),
	/// Closes the socket (e.g. as a result of an error)
	CloseWith(CloseReason),
	/// Disposes ServerBridge corresponding to an ID
	CloseServerBridge(u16),
}

impl SocketSignal {
	fn from_message<T>(msg: &T) -> Self
	where
		T: Serialize + ?Sized,
	{
		SocketSignal::Send(rmp_serde::to_vec_named(msg).unwrap())
	}
}

impl FromServerMessage for SocketSignal {
	fn from_server_message(i: u16, body: &[u8]) -> Self {
		SocketSignal::from_message(&ToClientRequest {
			id: None,
			params: ClientRequestMethod::servermsg(RefServerMessageParams { i, body }),
		})
	}

	fn from_closed_server_bridge(i: u16) -> Self {
		SocketSignal::CloseServerBridge(i)
	}
}

pub struct ServerTermination {
	/// Whether the server should be respawned in a new binary (see ServerSignal.Respawn).
	pub respawn: bool,
	pub tunnel: ActiveTunnel,
}

fn print_listening(log: &log::Logger, tunnel_name: &str) {
	debug!(log, "VS Code Server is listening for incoming connections");

	let extension_name = "+ms-vscode.remote-server";
	let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from(""));
	let current_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from(""));

	let dir = if home_dir == current_dir {
		PathBuf::from("")
	} else {
		current_dir
	};

	let mut addr = url::Url::parse("https://insiders.vscode.dev").unwrap();
	{
		let mut ps = addr.path_segments_mut().unwrap();
		ps.push(extension_name);
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

// Runs the launcher server. Exits on a ctrl+c or when requested by a user.
// Note that client connections may not be closed when this returns; use
// `close_all_clients()` on the ServerTermination to make this happen.
pub async fn serve(
	log: &log::Logger,
	mut tunnel: ActiveTunnel,
	launcher_paths: &LauncherPaths,
	code_server_args: &CodeServerArgs,
	platform: Platform,
	shutdown_rx: mpsc::Receiver<ShutdownSignal>,
) -> Result<ServerTermination, AnyError> {
	let mut port = tunnel.add_port_direct(CONTROL_PORT).await?;
	print_listening(log, &tunnel.name);

	let mut forwarding = PortForwardingProcessor::new();
	let (tx, mut rx) = mpsc::channel::<ServerSignal>(4);
	let (exit_barrier, signal_exit) = new_barrier();

	pin!(shutdown_rx);

	loop {
		tokio::select! {
			Some(r) = shutdown_rx.recv() => {
				info!(log, "Shutting down: {}", r );
				drop(signal_exit);
				return Ok(ServerTermination {
					respawn: false,
					tunnel,
				});
			},
			c = rx.recv() => {
				if let Some(ServerSignal::Respawn) = c {
					drop(signal_exit);
					return Ok(ServerTermination {
						respawn: true,
						tunnel,
					});
				}
			},
			Some(w) = forwarding.recv() => {
				forwarding.process(w, &mut tunnel).await;
			},
			l = port.recv() => {
				let socket = match l {
					Some(p) => p,
					None => {
						warning!(log, "ssh tunnel disposed, tearing down");
						return Ok(ServerTermination {
							respawn: false,
							tunnel,
						});
					}
				};

				let own_log = log.prefixed(&log::new_rpc_prefix());
				let own_tx = tx.clone();
				let own_paths = launcher_paths.clone();
				let own_exit = exit_barrier.clone();
				let own_code_server_args = code_server_args.clone();
				let own_forwarding = forwarding.handle();

				tokio::spawn(async move {
					use opentelemetry::trace::{FutureExt, TraceContextExt};

					let span = own_log.span("server.socket").with_kind(SpanKind::Consumer).start(own_log.tracer());
					let cx = opentelemetry::Context::current_with_span(span);
					let serve_at = Instant::now();

					debug!(own_log, "Serving new connection");

					let (writehalf, readhalf) = socket.into_split();
					let stats = process_socket(own_exit, readhalf, writehalf, own_log, own_tx, own_paths, own_code_server_args, own_forwarding, platform).with_context(cx.clone()).await;

					cx.span().add_event(
						"socket.bandwidth",
						vec![
							KeyValue::new("tx", stats.tx as f64),
							KeyValue::new("rx", stats.rx as f64),
							KeyValue::new("duration_ms", serve_at.elapsed().as_millis() as f64),
						],
					);
					cx.span().end();
				 });
			}
		}
	}
}

struct SocketStats {
	rx: usize,
	tx: usize,
}

#[allow(clippy::too_many_arguments)] // necessary here
async fn process_socket(
	mut exit_barrier: Barrier<()>,
	readhalf: impl AsyncRead + Send + Unpin + 'static,
	mut writehalf: impl AsyncWrite + Unpin,
	log: log::Logger,
	server_tx: mpsc::Sender<ServerSignal>,
	launcher_paths: LauncherPaths,
	code_server_args: CodeServerArgs,
	port_forwarding: PortForwarding,
	platform: Platform,
) -> SocketStats {
	let (socket_tx, mut socket_rx) = mpsc::channel(4);

	let rx_counter = Arc::new(AtomicUsize::new(0));

	let server_bridges: ServerBridgeListLock = Arc::new(Mutex::new(Some(vec![])));
	let server_bridges_lock = Arc::clone(&server_bridges);
	let barrier_ctx = exit_barrier.clone();
	let log_ctx = log.clone();
	let rx_counter_ctx = rx_counter.clone();

	tokio::spawn(async move {
		let mut ctx = HandlerContext {
			closer: barrier_ctx,
			server_tx,
			socket_tx,
			log: log_ctx,
			launcher_paths,
			code_server_args,
			rx_counter: rx_counter_ctx,
			code_server: None,
			server_bridges: server_bridges_lock,
			port_forwarding,
			platform,
		};

		send_version(&ctx.socket_tx).await;

		if let Err(e) = handle_socket_read(readhalf, &mut ctx).await {
			debug!(ctx.log, "closing socket reader: {}", e);
			ctx.socket_tx
				.send(SocketSignal::CloseWith(CloseReason(format!("{}", e))))
				.await
				.ok();
		}

		ctx.dispose().await;
	});

	let mut tx_counter = 0;

	loop {
		tokio::select! {
			_ = exit_barrier.wait() => {
				writehalf.shutdown().await.ok();
				break;
			},
			recv = socket_rx.recv() => match recv {
				None => break,
				Some(message) => match message {
					SocketSignal::Send(bytes) => {
						tx_counter += bytes.len();
						if let Err(e) = writehalf.write_all(&bytes).await {
							debug!(log, "Closing connection: {}", e);
							break;
						}
					}
					SocketSignal::CloseWith(reason) => {
						debug!(log, "Closing connection: {}", reason.0);
						break;
					}
					SocketSignal::CloseServerBridge(id) => {
						let mut lock = server_bridges.lock().await;
						match &mut *lock {
							Some(bridges) => {
								if let Some(index) = bridges.iter().position(|(i, _)| *i == id) {
									(*bridges).remove(index as usize);
								}
							},
							None => {}
						}
					}
				}
			}
		}
	}

	SocketStats {
		tx: tx_counter,
		rx: rx_counter.load(Ordering::Acquire),
	}
}

async fn send_version(tx: &mpsc::Sender<SocketSignal>) {
	tx.send(SocketSignal::from_message(&ToClientRequest {
		id: None,
		params: ClientRequestMethod::version(VersionParams {
			version: VSCODE_CLI_VERSION.unwrap_or("dev"),
			protocol_version: PROTOCOL_VERSION,
		}),
	}))
	.await
	.ok();
}
async fn handle_socket_read(
	readhalf: impl AsyncRead + Unpin,
	ctx: &mut HandlerContext,
) -> Result<(), std::io::Error> {
	let mut socket_reader = BufReader::new(readhalf);
	let mut decode_buf = vec![];
	let mut did_update = false;

	let result = loop {
		match read_next(&mut socket_reader, ctx, &mut decode_buf, &mut did_update).await {
			Ok(false) => break Ok(()),
			Ok(true) => { /* continue */ }
			Err(e) => break Err(e),
		}
	};

	// The connection is now closed, asked to respawn if needed
	if did_update {
		ctx.server_tx.send(ServerSignal::Respawn).await.ok();
	}

	result
}

/// Reads and handles the next data packet, returns true if the read loop should continue.
async fn read_next(
	socket_reader: &mut BufReader<impl AsyncRead + Unpin>,
	ctx: &mut HandlerContext,
	decode_buf: &mut Vec<u8>,
	did_update: &mut bool,
) -> Result<bool, std::io::Error> {
	let msg_length = tokio::select! {
		u = socket_reader.read_u32() => u? as usize,
		_ = ctx.closer.wait() => return Ok(false),
	};
	decode_buf.resize(msg_length, 0);
	ctx.rx_counter
		.fetch_add(msg_length + 4 /* u32 */, Ordering::Relaxed);

	tokio::select! {
		r = socket_reader.read_exact(decode_buf) => r?,
		_ = ctx.closer.wait() => return Ok(false),
	};

	let req = match rmp_serde::from_slice::<ToServerRequest>(decode_buf) {
		Ok(req) => req,
		Err(e) => {
			warning!(ctx.log, "Error decoding message: {}", e);
			return Ok(true); // not fatal
		}
	};

	let log = ctx.log.prefixed(
		req.id
			.map(|id| format!("[call.{}]", id))
			.as_deref()
			.unwrap_or("notify"),
	);

	macro_rules! success {
		($r:expr) => {
			req.id
				.map(|id| rmp_serde::to_vec_named(&SuccessResponse { id, result: &$r }))
		};
	}

	macro_rules! tj {
		($name:expr, $e:expr) => {
			match (spanf!(
				log,
				log.span(&format!("call.{}", $name))
					.with_kind(opentelemetry::trace::SpanKind::Server),
				$e
			)) {
				Ok(r) => success!(r),
				Err(e) => {
					warning!(log, "error handling call: {:?}", e);
					req.id.map(|id| {
						rmp_serde::to_vec_named(&ErrorResponse {
							id,
							error: ResponseError {
								code: -1,
								message: format!("{:?}", e),
							},
						})
					})
				}
			}
		};
	}

	let response = match req.params {
		ServerRequestMethod::ping(_) => success!(EmptyResult {}),
		ServerRequestMethod::serve(p) => tj!("serve", handle_serve(ctx, &log, p)),
		ServerRequestMethod::prune => tj!("prune", handle_prune(ctx)),
		ServerRequestMethod::gethostname(_) => tj!("gethostname", handle_get_hostname()),
		ServerRequestMethod::update(p) => tj!("update", async {
			let r = handle_update(ctx, &p).await;
			if matches!(&r, Ok(u) if u.did_update) {
				*did_update = true;
			}
			r
		}),
		ServerRequestMethod::servermsg(m) => {
			if let Err(e) = handle_server_message(ctx, m).await {
				warning!(log, "error handling call: {:?}", e);
			}
			None
		}
		ServerRequestMethod::callserverhttp(p) => {
			tj!("callserverhttp", handle_call_server_http(ctx, p))
		}
		ServerRequestMethod::forward(p) => tj!("forward", handle_forward(ctx, p)),
		ServerRequestMethod::unforward(p) => tj!("unforward", handle_unforward(ctx, p)),
	};

	if let Some(Ok(res)) = response {
		if ctx.socket_tx.send(SocketSignal::Send(res)).await.is_err() {
			return Ok(false);
		}
	}

	Ok(true)
}

#[derive(Clone)]
struct ServerOutputSink {
	tx: mpsc::Sender<SocketSignal>,
}

impl log::LogSink for ServerOutputSink {
	fn write_log(&self, level: log::Level, _prefix: &str, message: &str) {
		let s = SocketSignal::from_message(&ToClientRequest {
			id: None,
			params: ClientRequestMethod::serverlog(ServerLog {
				line: message,
				level: level.to_u8(),
			}),
		});

		self.tx.try_send(s).ok();
	}

	fn write_result(&self, _message: &str) {}
}

async fn handle_serve(
	ctx: &mut HandlerContext,
	log: &log::Logger,
	params: ServeParams,
) -> Result<EmptyResult, AnyError> {
	let mut code_server_args = ctx.code_server_args.clone();

	// fill params.extensions into code_server_args.install_extensions
	code_server_args
		.install_extensions
		.extend(params.extensions.into_iter());

	let resolved = ServerParamsRaw {
		commit_id: params.commit_id,
		quality: params.quality,
		code_server_args,
		headless: true,
		platform: ctx.platform,
	}
	.resolve(log)
	.await?;

	if ctx.code_server.is_none() {
		let install_log = log.tee(ServerOutputSink {
			tx: ctx.socket_tx.clone(),
		});
		let sb = ServerBuilder::new(&install_log, &resolved, &ctx.launcher_paths);

		let server = match sb.get_running().await? {
			Some(AnyCodeServer::Socket(s)) => s,
			Some(_) => return Err(AnyError::from(MismatchedLaunchModeError())),
			None => {
				sb.setup().await?;
				sb.listen_on_default_socket().await?
			}
		};

		ctx.code_server = Some(server);
	}

	attach_server_bridge(ctx, params.socket_id).await?;
	Ok(EmptyResult {})
}

async fn attach_server_bridge(ctx: &mut HandlerContext, socket_id: u16) -> Result<u16, AnyError> {
	let attached_fut = ServerBridge::new(
		&ctx.code_server.as_ref().unwrap().socket,
		socket_id,
		&ctx.socket_tx,
	)
	.await;

	match attached_fut {
		Ok(a) => {
			let mut lock = ctx.server_bridges.lock().await;
			match &mut *lock {
				Some(server_bridges) => (*server_bridges).push((socket_id, a)),
				None => *lock = Some(vec![(socket_id, a)]),
			}
			trace!(ctx.log, "Attached to server");
			Ok(socket_id)
		}
		Err(e) => Err(e),
	}
}

async fn handle_server_message(
	ctx: &mut HandlerContext,
	params: ServerMessageParams,
) -> Result<EmptyResult, AnyError> {
	let mut lock = ctx.server_bridges.lock().await;

	match &mut *lock {
		Some(server_bridges) => {
			let matched_bridge = server_bridges.iter_mut().find(|(id, _)| *id == params.i);

			match matched_bridge {
				Some((_, sb)) => sb
					.write(params.body)
					.await
					.map_err(|_| AnyError::from(ServerWriteError()))?,
				None => return Err(AnyError::from(NoAttachedServerError())),
			}
		}
		None => return Err(AnyError::from(NoAttachedServerError())),
	}

	Ok(EmptyResult {})
}

async fn handle_prune(ctx: &HandlerContext) -> Result<Vec<String>, AnyError> {
	prune_stopped_servers(&ctx.launcher_paths).map(|v| {
		v.iter()
			.map(|p| p.server_dir.display().to_string())
			.collect()
	})
}

async fn handle_update(
	ctx: &HandlerContext,
	params: &UpdateParams,
) -> Result<UpdateResult, AnyError> {
	let update_service = UpdateService::new(ctx.log.clone(), reqwest::Client::new());
	let updater = SelfUpdate::new(&update_service)?;
	let latest_release = updater.get_current_release().await?;
	let up_to_date = updater.is_up_to_date_with(&latest_release);

	if !params.do_update || up_to_date {
		return Ok(UpdateResult {
			up_to_date,
			did_update: false,
		});
	}

	info!(ctx.log, "Updating CLI to {}", latest_release);

	updater
		.do_update(&latest_release, SilentCopyProgress())
		.await?;

	Ok(UpdateResult {
		up_to_date: true,
		did_update: true,
	})
}

async fn handle_get_hostname() -> Result<GetHostnameResponse, Infallible> {
	Ok(GetHostnameResponse {
		value: gethostname::gethostname().to_string_lossy().into_owned(),
	})
}

async fn handle_forward(
	ctx: &HandlerContext,
	params: ForwardParams,
) -> Result<ForwardResult, AnyError> {
	info!(ctx.log, "Forwarding port {}", params.port);
	let uri = ctx.port_forwarding.forward(params.port).await?;
	Ok(ForwardResult { uri })
}

async fn handle_unforward(
	ctx: &HandlerContext,
	params: UnforwardParams,
) -> Result<EmptyResult, AnyError> {
	info!(ctx.log, "Unforwarding port {}", params.port);
	ctx.port_forwarding.unforward(params.port).await?;
	Ok(EmptyResult {})
}

async fn handle_call_server_http(
	ctx: &HandlerContext,
	params: CallServerHttpParams,
) -> Result<CallServerHttpResult, AnyError> {
	use hyper::{body, client::conn::Builder, Body, Request};

	// We use Hyper directly here since reqwest doesn't support sockets/pipes.
	// See https://github.com/seanmonstar/reqwest/issues/39

	let socket = match &ctx.code_server {
		Some(cs) => &cs.socket,
		None => return Err(AnyError::from(NoAttachedServerError())),
	};

	let rw = get_socket_rw_stream(socket).await?;

	let (mut request_sender, connection) = Builder::new()
		.handshake(rw)
		.await
		.map_err(|e| wrap(e, "error establishing connection"))?;

	// start the connection processing; it's shut down when the sender is dropped
	tokio::spawn(connection);

	let mut request_builder = Request::builder()
		.method::<&str>(params.method.as_ref())
		.uri(format!("http://127.0.0.1{}", params.path))
		.header("Host", "127.0.0.1");

	for (k, v) in params.headers {
		request_builder = request_builder.header(k, v);
	}
	let request = request_builder
		.body(Body::from(params.body.unwrap_or_default()))
		.map_err(|e| wrap(e, "invalid request"))?;

	let response = request_sender
		.send_request(request)
		.await
		.map_err(|e| wrap(e, "error sending request"))?;

	Ok(CallServerHttpResult {
		status: response.status().as_u16(),
		headers: response
			.headers()
			.into_iter()
			.map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
			.collect(),
		body: body::to_bytes(response)
			.await
			.map_err(|e| wrap(e, "error reading response body"))?
			.to_vec(),
	})
}
