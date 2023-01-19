/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::commands::tunnels::ShutdownSignal;
use crate::constants::{
	CONTROL_PORT, EDITOR_WEB_URL, PROTOCOL_VERSION, QUALITYLESS_SERVER_NAME, VSCODE_CLI_VERSION,
};
use crate::log;
use crate::rpc::{MaybeSync, RpcBuilder, RpcDispatcher, Serialization};
use crate::self_update::SelfUpdate;
use crate::state::LauncherPaths;
use crate::tunnels::protocol::HttpRequestParams;
use crate::tunnels::socket_signal::CloseReason;
use crate::update_service::{Platform, UpdateService};
use crate::util::errors::{
	wrap, AnyError, InvalidRpcDataError, MismatchedLaunchModeError, NoAttachedServerError,
};
use crate::util::http::{
	DelegatedHttpRequest, DelegatedSimpleHttp, FallbackSimpleHttp, ReqwestSimpleHttp,
};
use crate::util::io::SilentCopyProgress;
use crate::util::is_integrated_cli;
use crate::util::sync::{new_barrier, Barrier};

use opentelemetry::trace::SpanKind;
use opentelemetry::KeyValue;
use std::collections::HashMap;

use std::env;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
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
	CallServerHttpParams, CallServerHttpResult, ClientRequestMethod, EmptyObject, ForwardParams,
	ForwardResult, GetHostnameResponse, HttpBodyParams, HttpHeadersParams, ServeParams, ServerLog,
	ServerMessageParams, ToClientRequest, UnforwardParams, UpdateParams, UpdateResult,
	VersionParams,
};
use super::server_bridge::{get_socket_rw_stream, ServerBridge};
use super::socket_signal::{ClientMessageDecoder, ServerMessageSink, SocketSignal};

type ServerBridgeListLock = Arc<std::sync::Mutex<Option<Vec<ServerBridgeRec>>>>;
type HttpRequestsMap = Arc<std::sync::Mutex<HashMap<u32, DelegatedHttpRequest>>>;
type CodeServerCell = Arc<Mutex<Option<SocketCodeServer>>>;

struct ServerBridgeRec {
	id: u16,
	// bridge is removed when there's a write loop currently active
	bridge: Option<ServerBridge>,
	write_queue: Vec<Vec<u8>>,
}

struct HandlerContext {
	/// Log handle for the server
	log: log::Logger,
	/// Whether the server update during the handler session.
	did_update: Arc<AtomicBool>,
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
	async fn dispose(&self) {
		let bridges = {
			let mut lock = self.server_bridges.lock().unwrap();
			lock.take()
		};

		let bridges = match bridges {
			Some(b) => b,
			None => return,
		};

		for rec in bridges {
			if let Some(b) = rec.bridge {
				if let Err(e) = b.close().await {
					warning!(
						self.log,
						"Could not properly dispose of connection context: {}",
						e
					)
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
	debug!(
		log,
		"{} is listening for incoming connections", QUALITYLESS_SERVER_NAME
	);

	let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from(""));
	let current_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from(""));

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

// Runs the launcher server. Exits on a ctrl+c or when requested by a user.
// Note that client connections may not be closed when this returns; use
// `close_all_clients()` on the ServerTermination to make this happen.
pub async fn serve(
	log: &log::Logger,
	mut tunnel: ActiveTunnel,
	launcher_paths: &LauncherPaths,
	code_server_args: &CodeServerArgs,
	platform: Platform,
	shutdown_rx: mpsc::UnboundedReceiver<ShutdownSignal>,
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

#[derive(Copy, Clone)]
struct MsgPackSerializer {}

impl Serialization for MsgPackSerializer {
	fn serialize(&self, value: impl serde::Serialize) -> Vec<u8> {
		rmp_serde::to_vec_named(&value).expect("expected to serialize")
	}

	fn deserialize<P: serde::de::DeserializeOwned>(&self, b: &[u8]) -> Result<P, AnyError> {
		rmp_serde::from_slice(b).map_err(|e| InvalidRpcDataError(e.to_string()).into())
	}
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
	let http_requests = Arc::new(std::sync::Mutex::new(HashMap::new()));
	let server_bridges = Arc::new(std::sync::Mutex::new(Some(vec![])));
	let (http_delegated, mut http_rx) = DelegatedSimpleHttp::new(log.clone());
	let mut rpc = RpcBuilder::new(
		MsgPackSerializer {},
		HandlerContext {
			did_update: Arc::new(AtomicBool::new(false)),
			socket_tx: socket_tx.clone(),
			log: log.clone(),
			launcher_paths,
			code_server_args,
			code_server: Arc::new(Mutex::new(None)),
			server_bridges: server_bridges.clone(),
			port_forwarding,
			platform,
			http: FallbackSimpleHttp::new(ReqwestSimpleHttp::new(), http_delegated),
			http_requests: http_requests.clone(),
		},
	);

	rpc.register_sync("ping", |_: EmptyObject, _| Ok(EmptyObject {}));
	rpc.register_sync("gethostname", |_: EmptyObject, _| handle_get_hostname());
	rpc.register_async("serve", move |params: ServeParams, c| async move {
		handle_serve(c, params).await
	});
	rpc.register_async("update", |p: UpdateParams, c| async move {
		handle_update(&c.http, &c.log, &c.did_update, &p).await
	});
	rpc.register_sync("servermsg", |m: ServerMessageParams, c| {
		if let Err(e) = handle_server_message(&c.log, &c.server_bridges, m) {
			warning!(c.log, "error handling call: {:?}", e);
		}
		Ok(EmptyObject {})
	});
	rpc.register_sync("prune", |_: EmptyObject, c| handle_prune(&c.launcher_paths));
	rpc.register_async("callserverhttp", |p: CallServerHttpParams, c| async move {
		let code_server = c.code_server.lock().await.clone();
		handle_call_server_http(code_server, p).await
	});
	rpc.register_async("forward", |p: ForwardParams, c| async move {
		handle_forward(&c.log, &c.port_forwarding, p).await
	});
	rpc.register_async("unforward", |p: UnforwardParams, c| async move {
		handle_unforward(&c.log, &c.port_forwarding, p).await
	});
	rpc.register_sync("httpheaders", |p: HttpHeadersParams, c| {
		if let Some(req) = c.http_requests.lock().unwrap().get(&p.req_id) {
			req.initial_response(p.status_code, p.headers);
		}
		Ok(EmptyObject {})
	});
	rpc.register_sync("unforward", move |p: HttpBodyParams, c| {
		let mut reqs = c.http_requests.lock().unwrap();
		if let Some(req) = reqs.get(&p.req_id) {
			if !p.segment.is_empty() {
				req.body(p.segment);
			}
			if p.complete {
				reqs.remove(&p.req_id);
			}
		}
		Ok(EmptyObject {})
	});

	{
		let log = log.clone();
		let rx_counter = rx_counter.clone();
		let socket_tx = socket_tx.clone();
		let exit_barrier = exit_barrier.clone();
		let rpc = rpc.build();
		tokio::spawn(async move {
			send_version(&socket_tx).await;

			if let Err(e) =
				handle_socket_read(&log, readhalf, exit_barrier, &socket_tx, rx_counter, &rpc).await
			{
				debug!(log, "closing socket reader: {}", e);
				socket_tx
					.send(SocketSignal::CloseWith(CloseReason(format!("{}", e))))
					.await
					.ok();
			}

			let ctx = rpc.context();

			// The connection is now closed, asked to respawn if needed
			if ctx.did_update.load(Ordering::SeqCst) {
				server_tx.send(ServerSignal::Respawn).await.ok();
			}

			ctx.dispose().await;
		});
	}

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
						let mut lock = server_bridges.lock().unwrap();
						match &mut *lock {
							Some(bridges) => bridges.retain(|sb| sb.id != id),
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
	_log: &log::Logger,
	readhalf: impl AsyncRead + Unpin,
	mut closer: Barrier<()>,
	socket_tx: &mpsc::Sender<SocketSignal>,
	rx_counter: Arc<AtomicUsize>,
	rpc: &RpcDispatcher<MsgPackSerializer, HandlerContext>,
) -> Result<(), std::io::Error> {
	let mut socket_reader = BufReader::new(readhalf);
	let mut decode_buf = vec![];

	loop {
		let read = read_next(
			&mut socket_reader,
			&rx_counter,
			&mut closer,
			&mut decode_buf,
		)
		.await;

		match read {
			Ok(len) => match rpc.dispatch(&decode_buf[..len]) {
				MaybeSync::Sync(Some(v)) => {
					if socket_tx.send(SocketSignal::Send(v)).await.is_err() {
						return Ok(());
					}
				}
				MaybeSync::Sync(None) => continue,
				MaybeSync::Future(fut) => {
					let socket_tx = socket_tx.clone();
					tokio::spawn(async move {
						if let Some(v) = fut.await {
							socket_tx.send(SocketSignal::Send(v)).await.ok();
						}
					});
				}
			},
			Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
			Err(e) => return Err(e),
		}
	}
}

/// Reads and handles the next data packet. Returns the next packet to dispatch,
/// or an error (including EOF).
async fn read_next(
	socket_reader: &mut BufReader<impl AsyncRead + Unpin>,
	rx_counter: &Arc<AtomicUsize>,
	closer: &mut Barrier<()>,
	decode_buf: &mut Vec<u8>,
) -> Result<usize, std::io::Error> {
	let msg_length = tokio::select! {
		u = socket_reader.read_u32() => u? as usize,
		_ = closer.wait() => return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "eof")),
	};
	decode_buf.resize(msg_length, 0);
	rx_counter.fetch_add(msg_length + 4 /* u32 */, Ordering::Relaxed);

	tokio::select! {
		r = socket_reader.read_exact(decode_buf) => r,
		_ = closer.wait() => Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "eof")),
	}
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
	c: Arc<HandlerContext>,
	params: ServeParams,
) -> Result<EmptyObject, AnyError> {
	// fill params.extensions into code_server_args.install_extensions
	let mut csa = c.code_server_args.clone();
	csa.install_extensions.extend(params.extensions.into_iter());

	let params_raw = ServerParamsRaw {
		commit_id: params.commit_id,
		quality: params.quality,
		code_server_args: csa,
		headless: true,
		platform: c.platform,
	};

	let resolved = if params.use_local_download {
		params_raw.resolve(&c.log, c.http.delegated()).await
	} else {
		params_raw.resolve(&c.log, c.http.clone()).await
	}?;

	let mut server_ref = c.code_server.lock().await;
	let server = match &*server_ref {
		Some(o) => o.clone(),
		None => {
			let install_log = c.log.tee(ServerOutputSink {
				tx: c.socket_tx.clone(),
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
				let sb = ServerBuilder::new(
					&install_log,
					&resolved,
					&c.launcher_paths,
					c.http.delegated(),
				);
				do_setup!(sb)
			} else {
				let sb =
					ServerBuilder::new(&install_log, &resolved, &c.launcher_paths, c.http.clone());
				do_setup!(sb)
			};

			server_ref.replace(server.clone());
			server
		}
	};

	attach_server_bridge(
		&c.log,
		server,
		c.socket_tx.clone(),
		c.server_bridges.clone(),
		params.socket_id,
		params.compress,
	)
	.await?;
	Ok(EmptyObject {})
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
			let mut lock = server_bridges.lock().unwrap();
			let bridge_rec = ServerBridgeRec {
				id: socket_id,
				bridge: Some(a),
				write_queue: vec![],
			};
			match &mut *lock {
				Some(server_bridges) => (*server_bridges).push(bridge_rec),
				None => *lock = Some(vec![bridge_rec]),
			}
			trace!(log, "Attached to server");
			Ok(socket_id)
		}
		Err(e) => Err(e),
	}
}

/// Handle an incoming server message. This is synchronous and uses a 'write loop'
/// to ensure message order is preserved exactly, which is necessary for compression.
fn handle_server_message(
	log: &log::Logger,
	bridges_lock: &ServerBridgeListLock,
	params: ServerMessageParams,
) -> Result<EmptyObject, AnyError> {
	let mut lock = bridges_lock.lock().unwrap();

	match &mut *lock {
		Some(server_bridges) => match server_bridges.iter_mut().find(|b| b.id == params.i) {
			Some(sb) => {
				sb.write_queue.push(params.body);
				if let Some(bridge) = sb.bridge.take() {
					let bridges_lock = bridges_lock.clone();
					let log = log.clone();
					tokio::spawn(start_bridge_write_loop(log, sb.id, bridge, bridges_lock));
				}
			}
			None => return Err(AnyError::from(NoAttachedServerError())),
		},
		None => return Err(AnyError::from(NoAttachedServerError())),
	}

	Ok(EmptyObject {})
}

/// Write loop started by `handle_server_message`. It take sthe ServerBridge, and
/// runs until there's no more items in the 'write queue'. At that point, if the
/// record still exists in the bridges_lock (i.e. we haven't shut down), it'll
/// return the ServerBridge so that the next handle_server_message call starts
/// the loop again. Otherwise, it'll close the bridge.
async fn start_bridge_write_loop(
	log: log::Logger,
	id: u16,
	mut bridge: ServerBridge,
	bridges_lock: ServerBridgeListLock,
) {
	let mut items_vec = vec![];
	loop {
		{
			let mut lock = bridges_lock.lock().unwrap();
			let server_bridges = match &mut *lock {
				Some(sb) => sb,
				None => break,
			};

			let bridge_rec = match server_bridges.iter_mut().find(|b| id == b.id) {
				Some(b) => b,
				None => break,
			};

			if bridge_rec.write_queue.is_empty() {
				bridge_rec.bridge = Some(bridge);
				return;
			}

			std::mem::swap(&mut bridge_rec.write_queue, &mut items_vec);
		}

		for item in items_vec.drain(..) {
			if let Err(e) = bridge.write(item).await {
				warning!(log, "Error writing to server: {:?}", e);
				break;
			}
		}
	}

	bridge.close().await.ok(); // got here from `break` above, meaning our record got cleared. Close the bridge if so
}

fn handle_prune(paths: &LauncherPaths) -> Result<Vec<String>, AnyError> {
	prune_stopped_servers(paths).map(|v| {
		v.iter()
			.map(|p| p.server_dir.display().to_string())
			.collect()
	})
}

async fn handle_update(
	http: &FallbackSimpleHttp,
	log: &log::Logger,
	did_update: &AtomicBool,
	params: &UpdateParams,
) -> Result<UpdateResult, AnyError> {
	if matches!(is_integrated_cli(), Ok(true)) || did_update.load(Ordering::SeqCst) {
		return Ok(UpdateResult {
			up_to_date: true,
			did_update: false,
		});
	}

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

	if did_update
		.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
		.is_err()
	{
		return Ok(UpdateResult {
			up_to_date: true,
			did_update: true, // well, another thread did, but same difference...
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

fn handle_get_hostname() -> Result<GetHostnameResponse, AnyError> {
	Ok(GetHostnameResponse {
		value: gethostname::gethostname().to_string_lossy().into_owned(),
	})
}

async fn handle_forward(
	log: &log::Logger,
	port_forwarding: &PortForwarding,
	params: ForwardParams,
) -> Result<ForwardResult, AnyError> {
	info!(log, "Forwarding port {}", params.port);
	let uri = port_forwarding.forward(params.port).await?;
	Ok(ForwardResult { uri })
}

async fn handle_unforward(
	log: &log::Logger,
	port_forwarding: &PortForwarding,
	params: UnforwardParams,
) -> Result<EmptyObject, AnyError> {
	info!(log, "Unforwarding port {}", params.port);
	port_forwarding.unforward(params.port).await?;
	Ok(EmptyObject {})
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
