/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::commands::tunnels::ShutdownSignal;
use crate::constants::{CONTROL_PORT, PROTOCOL_VERSION, VSCODE_CLI_VERSION};
use crate::log;
use crate::self_update::SelfUpdate;
use crate::state::LauncherPaths;
use crate::tunnels::protocol::HttpRequestParams;
use crate::tunnels::socket_signal::CloseReason;
use crate::update_service::{Platform, UpdateService};
use crate::util::errors::{
	wrap, AnyError, MismatchedLaunchModeError, NoAttachedServerError, ServerWriteError,
};
use crate::util::http::{
	DelegatedHttpRequest, DelegatedSimpleHttp, FallbackSimpleHttp, ReqwestSimpleHttp,
};
use crate::util::io::SilentCopyProgress;
use crate::util::sync::{new_barrier, Barrier};
use opentelemetry::trace::SpanKind;
use opentelemetry::KeyValue;
use std::collections::HashMap;
use std::convert::Infallible;
use std::env;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
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
	ForwardParams, ForwardResult, GetHostnameResponse, ResponseError, ServeParams, ServerLog,
	ServerMessageParams, ServerRequestMethod, SuccessResponse, ToClientRequest, ToServerRequest,
	UnforwardParams, UpdateParams, UpdateResult, VersionParams,
};
use super::server_bridge::{get_socket_rw_stream, ServerBridge};
use super::socket_signal::{ClientMessageDecoder, ServerMessageSink, SocketSignal};

type ServerBridgeList = Option<Vec<(u16, ServerBridge)>>;
type ServerBridgeListLock = Arc<Mutex<ServerBridgeList>>;
type HttpRequestsMap = Arc<std::sync::Mutex<HashMap<u32, DelegatedHttpRequest>>>;
type CodeServerCell = Arc<Mutex<Option<SocketCodeServer>>>;

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
	code_server: CodeServerCell,
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
	/// http client to make download/update requests
	http: FallbackSimpleHttp,
	/// requests being served by the client
	http_requests: HttpRequestsMap,
}

static MESSAGE_ID_COUNTER: AtomicU32 = AtomicU32::new(0);

// Gets a next incrementing number that can be used in logs
pub fn next_message_id() -> u32 {
	MESSAGE_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
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

pub struct ServerTermination {
	/// Whether the server should be respawned in a new binary (see ServerSignal.Respawn).
	pub respawn: bool,
	pub tunnel: ActiveTunnel,
}

fn print_listening(log: &log::Logger, tunnel_name: &str) {
	debug!(log, "VS Code Server is listening for incoming connections");

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
	let http_requests = Arc::new(std::sync::Mutex::new(HashMap::new()));
	let rx_counter = Arc::new(AtomicUsize::new(0));

	let server_bridges: ServerBridgeListLock = Arc::new(Mutex::new(Some(vec![])));
	let server_bridges_lock = Arc::clone(&server_bridges);
	let barrier_ctx = exit_barrier.clone();
	let log_ctx = log.clone();
	let rx_counter_ctx = rx_counter.clone();
	let http_requests_ctx = http_requests.clone();
	let (http_delegated, mut http_rx) = DelegatedSimpleHttp::new(log_ctx.clone());

	tokio::spawn(async move {
		let mut ctx = HandlerContext {
			closer: barrier_ctx,
			server_tx,
			socket_tx,
			log: log_ctx,
			launcher_paths,
			code_server_args,
			rx_counter: rx_counter_ctx,
			code_server: Arc::new(Mutex::new(None)),
			server_bridges: server_bridges_lock,
			port_forwarding,
			platform,
			http: FallbackSimpleHttp::new(ReqwestSimpleHttp::new(), http_delegated),
			http_requests: http_requests_ctx,
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
			Some(r) = http_rx.recv() => {
				let id = next_message_id();
				let serialized = rmp_serde::to_vec_named(&ToClientRequest {
					id: None,
					params: ClientRequestMethod::makehttpreq(HttpRequestParams {
						url: &r.url,
						method: r.method,
						req_id: id,
					}),
				})
				.unwrap();
				http_requests.lock().unwrap().insert(id, r);

				tx_counter += serialized.len();
				if let Err(e) = writehalf.write_all(&serialized).await {
					debug!(log, "Closing connection: {}", e);
					break;
				}
			}
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
		match read_next(&mut socket_reader, ctx, &mut decode_buf).await {
			Ok(None) => continue,
			Ok(Some(m)) => {
				dispatch_next(m, ctx, &mut did_update).await;
			}
			Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break Ok(()),
			Err(e) => break Err(e),
		}
	};

	// The connection is now closed, asked to respawn if needed
	if did_update {
		ctx.server_tx.send(ServerSignal::Respawn).await.ok();
	}

	result
}

/// Reads and handles the next data packet. Returns the next packet to dispatch,
/// or an error (including EOF).
async fn read_next(
	socket_reader: &mut BufReader<impl AsyncRead + Unpin>,
	ctx: &mut HandlerContext,
	decode_buf: &mut Vec<u8>,
) -> Result<Option<ToServerRequest>, std::io::Error> {
	let msg_length = tokio::select! {
		u = socket_reader.read_u32() => u? as usize,
		_ = ctx.closer.wait() => return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "eof")),
	};
	decode_buf.resize(msg_length, 0);
	ctx.rx_counter
		.fetch_add(msg_length + 4 /* u32 */, Ordering::Relaxed);

	tokio::select! {
		r = socket_reader.read_exact(decode_buf) => r?,
		_ = ctx.closer.wait() => return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "eof")),
	};

	match rmp_serde::from_slice::<ToServerRequest>(decode_buf) {
		Ok(req) => Ok(Some(req)),
		Err(e) => {
			warning!(ctx.log, "Error decoding message: {}", e);
			Ok(None) // not fatal
		}
	}
}

// Dispatches a server request. Returns `true` if the socket reading should
// continue,
async fn dispatch_next(req: ToServerRequest, ctx: &mut HandlerContext, did_update: &mut bool) {
	let log = ctx.log.prefixed(
		req.id
			.map(|id| format!("[call.{}]", id))
			.as_deref()
			.unwrap_or("notify"),
	);

	macro_rules! send {
		($tx:expr, $res:expr) => {
			if let Some(Ok(res)) = $res {
				$tx.send(SocketSignal::Send(res)).await.is_err()
			} else {
				false
			}
		};
	}

	macro_rules! success {
		($tx:expr, $r:expr) => {
			send!(
				$tx,
				req.id
					.map(|id| rmp_serde::to_vec_named(&SuccessResponse { id, result: &$r }))
			)
		};
	}

	macro_rules! dispatch_raw {
		($log:expr, $socket_tx:expr, $name:expr, $e:expr) => {
			match (spanf!(
				$log,
				$log.span(&format!("call.{}", $name))
					.with_kind(opentelemetry::trace::SpanKind::Server),
				$e
			)) {
				Ok(r) => success!($socket_tx, r),
				Err(e) => {
					warning!($log, "error handling call: {:?}", e);
					send!(
						$socket_tx,
						req.id.map(|id| {
							rmp_serde::to_vec_named(&ErrorResponse {
								id,
								error: ResponseError {
									code: -1,
									message: format!("{:?}", e),
								},
							})
						})
					)
				}
			}
		};
	}

	// Runs the $e expression synchronously, returning its Result to the socket.
	// This should only be used for fast-returning functions, otherwise prefer
	// dispatch_async.
	macro_rules! dispatch_blocking {
		($name:expr, $e:expr) => {
			dispatch_raw!(ctx.log, ctx.socket_tx, $name, $e);
		};
	}

	// Runs the $e expression asynchronously, returning its Result to the socket.
	macro_rules! dispatch_async {
		($name:expr, $e:expr) => {
			let socket_tx = ctx.socket_tx.clone();
			let span_logger = ctx.log.clone();
			tokio::spawn(async move { dispatch_raw!(span_logger, socket_tx, $name, $e) })
		};
	}

	match req.params {
		ServerRequestMethod::ping(_) => {
			success!(ctx.socket_tx, EmptyResult {});
		}
		ServerRequestMethod::serve(params) => {
			let log = ctx.log.clone();
			let http = ctx.http.clone();
			let server_bridges = ctx.server_bridges.clone();
			let code_server_args = ctx.code_server_args.clone();
			let code_server = ctx.code_server.clone();
			let platform = ctx.platform;
			let socket_tx = ctx.socket_tx.clone();
			let paths = ctx.launcher_paths.clone();
			dispatch_async!(
				"serve",
				handle_serve(
					log,
					http,
					server_bridges,
					code_server_args,
					platform,
					code_server,
					socket_tx,
					paths,
					params
				)
			);
		}
		ServerRequestMethod::prune => {
			let paths = ctx.launcher_paths.clone();
			dispatch_blocking!("prune", handle_prune(&paths));
		}
		ServerRequestMethod::gethostname(_) => {
			dispatch_blocking!("gethostname", handle_get_hostname());
		}
		ServerRequestMethod::update(p) => {
			dispatch_blocking!("update", async {
				let r = handle_update(&ctx.http, &ctx.log, &p).await;
				if matches!(&r, Ok(u) if u.did_update) {
					*did_update = true;
				}
				r
			});
		}
		ServerRequestMethod::servermsg(m) => {
			// It's important this this is not dispatch_async'd, since otherwise
			// the order of servermsg's could be switched, which could lead to errors.
			let bridges_lock = ctx.server_bridges.clone();
			if let Err(e) = handle_server_message(bridges_lock, m).await {
				warning!(log, "error handling call: {:?}", e);
			}
		}
		ServerRequestMethod::callserverhttp(p) => {
			let code_server = ctx.code_server.lock().await.clone();
			dispatch_async!("callserverhttp", handle_call_server_http(code_server, p));
		}
		ServerRequestMethod::forward(p) => {
			let log = ctx.log.clone();
			let port_forwarding = ctx.port_forwarding.clone();
			dispatch_async!("forward", handle_forward(log, port_forwarding, p));
		}
		ServerRequestMethod::unforward(p) => {
			let log = ctx.log.clone();
			let port_forwarding = ctx.port_forwarding.clone();
			dispatch_async!("unforward", handle_unforward(log, port_forwarding, p));
		}
		ServerRequestMethod::httpheaders(p) => {
			if let Some(req) = ctx.http_requests.lock().unwrap().get(&p.req_id) {
				req.initial_response(p.status_code, p.headers);
			}
			success!(ctx.socket_tx, EmptyResult {});
		}
		ServerRequestMethod::httpbody(p) => {
			{
				let mut reqs = ctx.http_requests.lock().unwrap();
				if let Some(req) = reqs.get(&p.req_id) {
					if !p.segment.is_empty() {
						req.body(p.segment);
					}
					if p.complete {
						reqs.remove(&p.req_id);
					}
				}
			}
			success!(ctx.socket_tx, EmptyResult {});
		}
	};
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

#[allow(clippy::too_many_arguments)]
async fn handle_serve(
	log: log::Logger,
	http: FallbackSimpleHttp,
	server_bridges: ServerBridgeListLock,
	mut code_server_args: CodeServerArgs,
	platform: Platform,
	code_server: CodeServerCell,
	socket_tx: mpsc::Sender<SocketSignal>,
	launcher_paths: LauncherPaths,
	params: ServeParams,
) -> Result<EmptyResult, AnyError> {
	// fill params.extensions into code_server_args.install_extensions
	code_server_args
		.install_extensions
		.extend(params.extensions.into_iter());

	let params_raw = ServerParamsRaw {
		commit_id: params.commit_id,
		quality: params.quality,
		code_server_args,
		headless: true,
		platform,
	};

	let resolved = if params.use_local_download {
		params_raw.resolve(&log, http.delegated()).await
	} else {
		params_raw.resolve(&log, http.clone()).await
	}?;

	let mut server_ref = code_server.lock().await;
	let server = match &*server_ref {
		Some(o) => o.clone(),
		None => {
			let install_log = log.tee(ServerOutputSink {
				tx: socket_tx.clone(),
			});

			macro_rules! do_setup {
				($sb:expr) => {
					match $sb.get_running().await? {
						Some(AnyCodeServer::Socket(s)) => s,
						Some(_) => return Err(AnyError::from(MismatchedLaunchModeError())),
						None => {
							$sb.setup().await?;
							$sb.listen_on_default_socket().await?
						}
					}
				};
			}

			let server = if params.use_local_download {
				let sb =
					ServerBuilder::new(&install_log, &resolved, &launcher_paths, http.delegated());
				do_setup!(sb)
			} else {
				let sb = ServerBuilder::new(&install_log, &resolved, &launcher_paths, http);
				do_setup!(sb)
			};

			server_ref.replace(server.clone());
			server
		}
	};

	attach_server_bridge(
		&log,
		server,
		socket_tx,
		server_bridges,
		params.socket_id,
		params.compress,
	)
	.await?;
	Ok(EmptyResult {})
}

async fn attach_server_bridge(
	log: &log::Logger,
	code_server: SocketCodeServer,
	socket_tx: mpsc::Sender<SocketSignal>,
	server_bridges: ServerBridgeListLock,
	socket_id: u16,
	compress: bool,
) -> Result<u16, AnyError> {
	let (server_messages, decoder) = if compress {
		(
			ServerMessageSink::new_compressed(socket_tx),
			ClientMessageDecoder::new_compressed(),
		)
	} else {
		(
			ServerMessageSink::new_plain(socket_tx),
			ClientMessageDecoder::new_plain(),
		)
	};

	let attached_fut =
		ServerBridge::new(&code_server.socket, socket_id, server_messages, decoder).await;

	match attached_fut {
		Ok(a) => {
			let mut lock = server_bridges.lock().await;
			match &mut *lock {
				Some(server_bridges) => (*server_bridges).push((socket_id, a)),
				None => *lock = Some(vec![(socket_id, a)]),
			}
			trace!(log, "Attached to server");
			Ok(socket_id)
		}
		Err(e) => Err(e),
	}
}

async fn handle_server_message(
	bridges_lock: ServerBridgeListLock,
	params: ServerMessageParams,
) -> Result<EmptyResult, AnyError> {
	let mut lock = bridges_lock.lock().await;

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

async fn handle_prune(paths: &LauncherPaths) -> Result<Vec<String>, AnyError> {
	prune_stopped_servers(paths).map(|v| {
		v.iter()
			.map(|p| p.server_dir.display().to_string())
			.collect()
	})
}

async fn handle_update(
	http: &FallbackSimpleHttp,
	log: &log::Logger,
	params: &UpdateParams,
) -> Result<UpdateResult, AnyError> {
	let update_service = UpdateService::new(log.clone(), http.clone());
	let updater = SelfUpdate::new(&update_service)?;
	let latest_release = updater.get_current_release().await?;
	let up_to_date = updater.is_up_to_date_with(&latest_release);

	if !params.do_update || up_to_date {
		return Ok(UpdateResult {
			up_to_date,
			did_update: false,
		});
	}

	info!(log, "Updating CLI to {}", latest_release);

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
	log: log::Logger,
	port_forwarding: PortForwarding,
	params: ForwardParams,
) -> Result<ForwardResult, AnyError> {
	info!(log, "Forwarding port {}", params.port);
	let uri = port_forwarding.forward(params.port).await?;
	Ok(ForwardResult { uri })
}

async fn handle_unforward(
	log: log::Logger,
	port_forwarding: PortForwarding,
	params: UnforwardParams,
) -> Result<EmptyResult, AnyError> {
	info!(log, "Unforwarding port {}", params.port);
	port_forwarding.unforward(params.port).await?;
	Ok(EmptyResult {})
}

async fn handle_call_server_http(
	code_server: Option<SocketCodeServer>,
	params: CallServerHttpParams,
) -> Result<CallServerHttpResult, AnyError> {
	use hyper::{body, client::conn::Builder, Body, Request};

	// We use Hyper directly here since reqwest doesn't support sockets/pipes.
	// See https://github.com/seanmonstar/reqwest/issues/39

	let socket = match &code_server {
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
