/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::async_pipe::get_socket_rw_stream;
use crate::constants::{CONTROL_PORT, PRODUCT_NAME_LONG};
use crate::log;
use crate::msgpack_rpc::{new_msgpack_rpc, start_msgpack_rpc, MsgPackCodec, MsgPackSerializer};
use crate::options::Quality;
use crate::rpc::{MaybeSync, RpcBuilder, RpcCaller, RpcDispatcher};
use crate::self_update::SelfUpdate;
use crate::state::LauncherPaths;
use crate::tunnels::protocol::{HttpRequestParams, PortPrivacy, METHOD_CHALLENGE_ISSUE};
use crate::tunnels::socket_signal::CloseReason;
use crate::update_service::{Platform, Release, TargetKind, UpdateService};
use crate::util::command::new_tokio_command;
use crate::util::errors::{
	wrap, AnyError, CodeError, MismatchedLaunchModeError, NoAttachedServerError,
};
use crate::util::http::{
	DelegatedHttpRequest, DelegatedSimpleHttp, FallbackSimpleHttp, ReqwestSimpleHttp,
};
use crate::util::io::SilentCopyProgress;
use crate::util::is_integrated_cli;
use crate::util::machine::kill_pid;
use crate::util::os::os_release;
use crate::util::sync::{new_barrier, Barrier, BarrierOpener};

use futures::stream::FuturesUnordered;
use futures::FutureExt;
use opentelemetry::trace::SpanKind;
use opentelemetry::KeyValue;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::net::TcpStream;
use tokio::pin;
use tokio::process::{ChildStderr, ChildStdin};
use tokio_util::codec::Decoder;

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, DuplexStream};
use tokio::sync::{mpsc, Mutex};

use super::challenge::{create_challenge, sign_challenge, verify_challenge};
use super::code_server::{
	download_cli_into_cache, AnyCodeServer, CodeServerArgs, ServerBuilder, ServerParamsRaw,
	SocketCodeServer,
};
use super::dev_tunnels::ActiveTunnel;
use super::paths::prune_stopped_servers;
use super::port_forwarder::{PortForwarding, PortForwardingProcessor};
use super::protocol::{
	AcquireCliParams, CallServerHttpParams, CallServerHttpResult, ChallengeIssueParams,
	ChallengeIssueResponse, ChallengeVerifyParams, ClientRequestMethod, EmptyObject, ForwardParams,
	ForwardResult, FsReadDirEntry, FsReadDirResponse, FsRenameRequest, FsSinglePathRequest,
	FsStatResponse, GetEnvResponse, GetHostnameResponse, HttpBodyParams, HttpHeadersParams,
	NetConnectRequest, ServeParams, ServerLog, ServerMessageParams, SpawnParams, SpawnResult,
	SysKillRequest, SysKillResponse, ToClientRequest, UnforwardParams, UpdateParams, UpdateResult,
	VersionResponse, METHOD_CHALLENGE_VERIFY,
};
use super::server_bridge::ServerBridge;
use super::server_multiplexer::ServerMultiplexer;
use super::shutdown_signal::ShutdownSignal;
use super::socket_signal::{
	ClientMessageDecoder, ServerMessageDestination, ServerMessageSink, SocketSignal,
};

type HttpRequestsMap = Arc<std::sync::Mutex<HashMap<u32, DelegatedHttpRequest>>>;
type CodeServerCell = Arc<Mutex<Option<SocketCodeServer>>>;

struct HandlerContext {
	/// Log handle for the server
	log: log::Logger,
	/// Whether the server update during the handler session.
	did_update: Arc<AtomicBool>,
	/// Whether authentication is still required on the socket.
	auth_state: Arc<std::sync::Mutex<AuthState>>,
	/// A loopback channel to talk to the socket server task.
	socket_tx: mpsc::Sender<SocketSignal>,
	/// Configured launcher paths.
	launcher_paths: LauncherPaths,
	/// Connected VS Code Server
	code_server: CodeServerCell,
	/// Potentially many "websocket" connections to client
	server_bridges: ServerMultiplexer,
	// the cli arguments used to start the code server
	code_server_args: CodeServerArgs,
	/// port forwarding functionality
	port_forwarding: Option<PortForwarding>,
	/// install platform for the VS Code server
	platform: Platform,
	/// http client to make download/update requests
	http: Arc<FallbackSimpleHttp>,
	/// requests being served by the client
	http_requests: HttpRequestsMap,
}

/// Handler auth state.
enum AuthState {
	/// Auth is required, we're waiting for the client to send its challenge optionally bearing a token.
	WaitingForChallenge(Option<String>),
	/// A challenge has been issued. Waiting for a verification.
	ChallengeIssued(String),
	/// Auth is no longer required.
	Authenticated,
}

static MESSAGE_ID_COUNTER: AtomicU32 = AtomicU32::new(0);

// Gets a next incrementing number that can be used in logs
pub fn next_message_id() -> u32 {
	MESSAGE_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
}

impl HandlerContext {
	async fn dispose(&self) {
		self.server_bridges.dispose().await;
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

pub enum Next {
	/// Whether the server should be respawned in a new binary (see ServerSignal.Respawn).
	Respawn,
	/// Whether the tunnel should be restarted
	Restart,
	/// Whether the process should exit
	Exit,
}

pub struct ServerTermination {
	pub next: Next,
	pub tunnel: ActiveTunnel,
}

async fn preload_extensions(
	log: &log::Logger,
	platform: Platform,
	mut args: CodeServerArgs,
	launcher_paths: LauncherPaths,
) -> Result<(), AnyError> {
	args.start_server = false;

	let params_raw = ServerParamsRaw {
		commit_id: None,
		quality: Quality::Stable,
		code_server_args: args.clone(),
		headless: true,
		platform,
	};

	// cannot use delegated HTTP here since there's no remote connection yet
	let http = Arc::new(ReqwestSimpleHttp::new());
	let resolved = params_raw.resolve(log, http.clone()).await?;
	let sb = ServerBuilder::new(log, &resolved, &launcher_paths, http.clone());

	sb.setup().await?;
	sb.install_extensions().await
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
	mut shutdown_rx: Barrier<ShutdownSignal>,
) -> Result<ServerTermination, AnyError> {
	let mut port = tunnel.add_port_direct(CONTROL_PORT).await?;
	let mut forwarding = PortForwardingProcessor::new();
	let (tx, mut rx) = mpsc::channel::<ServerSignal>(4);
	let (exit_barrier, signal_exit) = new_barrier();

	if !code_server_args.install_extensions.is_empty() {
		info!(
			log,
			"Preloading extensions using stable server: {:?}", code_server_args.install_extensions
		);
		let log = log.clone();
		let code_server_args = code_server_args.clone();
		let launcher_paths = launcher_paths.clone();
		// This is run async to the primary tunnel setup to be speedy.
		tokio::spawn(async move {
			if let Err(e) =
				preload_extensions(&log, platform, code_server_args, launcher_paths).await
			{
				warning!(log, "Failed to preload extensions: {:?}", e);
			} else {
				info!(log, "Extension install complete");
			}
		});
	}

	loop {
		tokio::select! {
			Ok(reason) = shutdown_rx.wait() => {
				info!(log, "Shutting down: {}", reason);
				drop(signal_exit);
				return Ok(ServerTermination {
					next: match reason {
						ShutdownSignal::RpcRestartRequested => Next::Restart,
						_ => Next::Exit,
					},
					tunnel,
				});
			},
			c = rx.recv() => {
				if let Some(ServerSignal::Respawn) = c {
					drop(signal_exit);
					return Ok(ServerTermination {
						next: Next::Respawn,
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
							next: Next::Restart,
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
					let stats = process_socket(readhalf, writehalf, own_tx, Some(own_forwarding), ServeStreamParams {
						log: own_log,
						launcher_paths: own_paths,
						code_server_args: own_code_server_args,
						platform,
						exit_barrier: own_exit,
						requires_auth: AuthRequired::None,
					}).with_context(cx.clone()).await;

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

#[derive(Clone)]
pub enum AuthRequired {
	None,
	VSDA,
	VSDAWithToken(String),
}

#[derive(Clone)]
pub struct ServeStreamParams {
	pub log: log::Logger,
	pub launcher_paths: LauncherPaths,
	pub code_server_args: CodeServerArgs,
	pub platform: Platform,
	pub requires_auth: AuthRequired,
	pub exit_barrier: Barrier<ShutdownSignal>,
}

pub async fn serve_stream(
	readhalf: impl AsyncRead + Send + Unpin + 'static,
	writehalf: impl AsyncWrite + Unpin,
	params: ServeStreamParams,
) -> SocketStats {
	// Currently the only server signal is respawn, that doesn't have much meaning
	// when serving a stream, so make an ignored channel.
	let (server_rx, server_tx) = mpsc::channel(1);
	drop(server_tx);

	process_socket(readhalf, writehalf, server_rx, None, params).await
}

pub struct SocketStats {
	rx: usize,
	tx: usize,
}

#[allow(clippy::too_many_arguments)]
fn make_socket_rpc(
	log: log::Logger,
	socket_tx: mpsc::Sender<SocketSignal>,
	http_delegated: DelegatedSimpleHttp,
	launcher_paths: LauncherPaths,
	code_server_args: CodeServerArgs,
	port_forwarding: Option<PortForwarding>,
	requires_auth: AuthRequired,
	platform: Platform,
	http_requests: HttpRequestsMap,
) -> RpcDispatcher<MsgPackSerializer, HandlerContext> {
	let server_bridges = ServerMultiplexer::new();
	let mut rpc = RpcBuilder::new(MsgPackSerializer {}).methods(HandlerContext {
		did_update: Arc::new(AtomicBool::new(false)),
		auth_state: Arc::new(std::sync::Mutex::new(match requires_auth {
			AuthRequired::VSDAWithToken(t) => AuthState::WaitingForChallenge(Some(t)),
			AuthRequired::VSDA => AuthState::WaitingForChallenge(None),
			AuthRequired::None => AuthState::Authenticated,
		})),
		socket_tx,
		log: log.clone(),
		launcher_paths,
		code_server_args,
		code_server: Arc::new(Mutex::new(None)),
		server_bridges,
		port_forwarding,
		platform,
		http: Arc::new(FallbackSimpleHttp::new(
			ReqwestSimpleHttp::new(),
			http_delegated,
		)),
		http_requests,
	});

	rpc.register_sync("ping", |_: EmptyObject, _| Ok(EmptyObject {}));
	rpc.register_sync("gethostname", |_: EmptyObject, _| handle_get_hostname());
	rpc.register_sync("sys_kill", |p: SysKillRequest, c| {
		ensure_auth(&c.auth_state)?;
		handle_sys_kill(p.pid)
	});
	rpc.register_sync("fs_stat", |p: FsSinglePathRequest, c| {
		ensure_auth(&c.auth_state)?;
		handle_stat(p.path)
	});
	rpc.register_duplex(
		"fs_read",
		1,
		move |mut streams, p: FsSinglePathRequest, c| async move {
			ensure_auth(&c.auth_state)?;
			handle_fs_read(streams.remove(0), p.path).await
		},
	);
	rpc.register_duplex(
		"fs_write",
		1,
		move |mut streams, p: FsSinglePathRequest, c| async move {
			ensure_auth(&c.auth_state)?;
			handle_fs_write(streams.remove(0), p.path).await
		},
	);
	rpc.register_duplex(
		"fs_connect",
		1,
		move |mut streams, p: FsSinglePathRequest, c| async move {
			ensure_auth(&c.auth_state)?;
			handle_fs_connect(streams.remove(0), p.path).await
		},
	);
	rpc.register_duplex(
		"net_connect",
		1,
		move |mut streams, n: NetConnectRequest, c| async move {
			ensure_auth(&c.auth_state)?;
			handle_net_connect(streams.remove(0), n).await
		},
	);
	rpc.register_async("fs_rm", move |p: FsSinglePathRequest, c| async move {
		ensure_auth(&c.auth_state)?;
		handle_fs_remove(p.path).await
	});
	rpc.register_sync("fs_mkdirp", |p: FsSinglePathRequest, c| {
		ensure_auth(&c.auth_state)?;
		handle_fs_mkdirp(p.path)
	});
	rpc.register_sync("fs_rename", |p: FsRenameRequest, c| {
		ensure_auth(&c.auth_state)?;
		handle_fs_rename(p.from_path, p.to_path)
	});
	rpc.register_sync("fs_readdir", |p: FsSinglePathRequest, c| {
		ensure_auth(&c.auth_state)?;
		handle_fs_readdir(p.path)
	});
	rpc.register_sync("get_env", |_: EmptyObject, c| {
		ensure_auth(&c.auth_state)?;
		handle_get_env()
	});
	rpc.register_sync(METHOD_CHALLENGE_ISSUE, |p: ChallengeIssueParams, c| {
		handle_challenge_issue(p, &c.auth_state)
	});
	rpc.register_sync(METHOD_CHALLENGE_VERIFY, |p: ChallengeVerifyParams, c| {
		handle_challenge_verify(p.response, &c.auth_state)
	});
	rpc.register_async("serve", move |params: ServeParams, c| async move {
		ensure_auth(&c.auth_state)?;
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
		ensure_auth(&c.auth_state)?;
		handle_forward(&c.log, &c.port_forwarding, p).await
	});
	rpc.register_async("unforward", |p: UnforwardParams, c| async move {
		ensure_auth(&c.auth_state)?;
		handle_unforward(&c.log, &c.port_forwarding, p).await
	});
	rpc.register_async("acquire_cli", |p: AcquireCliParams, c| async move {
		ensure_auth(&c.auth_state)?;
		handle_acquire_cli(&c.launcher_paths, &c.http, &c.log, p).await
	});
	rpc.register_duplex("spawn", 3, |mut streams, p: SpawnParams, c| async move {
		ensure_auth(&c.auth_state)?;
		handle_spawn(
			&c.log,
			p,
			Some(streams.remove(0)),
			Some(streams.remove(0)),
			Some(streams.remove(0)),
		)
		.await
	});
	rpc.register_duplex(
		"spawn_cli",
		3,
		|mut streams, p: SpawnParams, c| async move {
			ensure_auth(&c.auth_state)?;
			handle_spawn_cli(
				&c.log,
				p,
				streams.remove(0),
				streams.remove(0),
				streams.remove(0),
			)
			.await
		},
	);
	rpc.register_sync("httpheaders", |p: HttpHeadersParams, c| {
		if let Some(req) = c.http_requests.lock().unwrap().get(&p.req_id) {
			trace!(c.log, "got {} response for req {}", p.status_code, p.req_id);
			req.initial_response(p.status_code, p.headers);
		} else {
			warning!(c.log, "got response for unknown req {}", p.req_id);
		}
		Ok(EmptyObject {})
	});
	rpc.register_sync("httpbody", move |p: HttpBodyParams, c| {
		let mut reqs = c.http_requests.lock().unwrap();
		if let Some(req) = reqs.get(&p.req_id) {
			if !p.segment.is_empty() {
				req.body(p.segment);
			}
			if p.complete {
				trace!(c.log, "delegated request {} completed", p.req_id);
				reqs.remove(&p.req_id);
			}
		}
		Ok(EmptyObject {})
	});
	rpc.register_sync(
		"version",
		|_: EmptyObject, _| Ok(VersionResponse::default()),
	);

	rpc.build(log)
}

fn ensure_auth(is_authed: &Arc<std::sync::Mutex<AuthState>>) -> Result<(), AnyError> {
	if let AuthState::Authenticated = &*is_authed.lock().unwrap() {
		Ok(())
	} else {
		Err(CodeError::ServerAuthRequired.into())
	}
}

#[allow(clippy::too_many_arguments)] // necessary here
async fn process_socket(
	readhalf: impl AsyncRead + Send + Unpin + 'static,
	mut writehalf: impl AsyncWrite + Unpin,
	server_tx: mpsc::Sender<ServerSignal>,
	port_forwarding: Option<PortForwarding>,
	params: ServeStreamParams,
) -> SocketStats {
	let ServeStreamParams {
		mut exit_barrier,
		log,
		launcher_paths,
		code_server_args,
		platform,
		requires_auth,
	} = params;

	let (http_delegated, mut http_rx) = DelegatedSimpleHttp::new(log.clone());
	let (socket_tx, mut socket_rx) = mpsc::channel(4);
	let rx_counter = Arc::new(AtomicUsize::new(0));
	let http_requests = Arc::new(std::sync::Mutex::new(HashMap::new()));

	let already_authed = matches!(requires_auth, AuthRequired::None);
	let rpc = make_socket_rpc(
		log.clone(),
		socket_tx.clone(),
		http_delegated,
		launcher_paths,
		code_server_args,
		port_forwarding,
		requires_auth,
		platform,
		http_requests.clone(),
	);

	{
		let log = log.clone();
		let rx_counter = rx_counter.clone();
		let socket_tx = socket_tx.clone();
		let exit_barrier = exit_barrier.clone();
		tokio::spawn(async move {
			if already_authed {
				send_version(&socket_tx).await;
			}

			if let Err(e) =
				handle_socket_read(&log, readhalf, exit_barrier, &socket_tx, rx_counter, &rpc).await
			{
				debug!(log, "closing socket reader: {}", e);
				socket_tx
					.send(SocketSignal::CloseWith(CloseReason(format!("{e}"))))
					.await
					.ok();
			}

			let ctx = rpc.context();

			// The connection is now closed, asked to respawn if needed
			if ctx.did_update.load(Ordering::SeqCst) {
				server_tx.send(ServerSignal::Respawn).await.ok();
			}

			ctx.dispose().await;

			let _ = socket_tx
				.send(SocketSignal::CloseWith(CloseReason("eof".to_string())))
				.await;
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
		params: ClientRequestMethod::version(VersionResponse::default()),
	}))
	.await
	.ok();
}
async fn handle_socket_read(
	_log: &log::Logger,
	readhalf: impl AsyncRead + Unpin,
	mut closer: Barrier<ShutdownSignal>,
	socket_tx: &mpsc::Sender<SocketSignal>,
	rx_counter: Arc<AtomicUsize>,
	rpc: &RpcDispatcher<MsgPackSerializer, HandlerContext>,
) -> Result<(), std::io::Error> {
	let mut readhalf = BufReader::new(readhalf);
	let mut decoder = MsgPackCodec::new();
	let mut decoder_buf = bytes::BytesMut::new();

	loop {
		let read_len = tokio::select! {
			r = readhalf.read_buf(&mut decoder_buf) => r,
			_ = closer.wait() => Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "eof")),
		}?;

		if read_len == 0 {
			return Ok(());
		}

		rx_counter.fetch_add(read_len, Ordering::Relaxed);

		while let Some(frame) = decoder.decode(&mut decoder_buf)? {
			match rpc.dispatch_with_partial(&frame.vec, frame.obj) {
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
				MaybeSync::Stream((stream, fut)) => {
					if let Some(stream) = stream {
						rpc.register_stream(socket_tx.clone(), stream).await;
					}
					let socket_tx = socket_tx.clone();
					tokio::spawn(async move {
						if let Some(v) = fut.await {
							socket_tx.send(SocketSignal::Send(v)).await.ok();
						}
					});
				}
			}
		}
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
	csa.connection_token = params.connection_token.or(csa.connection_token);
	csa.install_extensions.extend(params.extensions.into_iter());

	let params_raw = ServerParamsRaw {
		commit_id: params.commit_id,
		quality: params.quality,
		code_server_args: csa,
		headless: true,
		platform: c.platform,
	};

	let resolved = if params.use_local_download {
		params_raw
			.resolve(&c.log, Arc::new(c.http.delegated()))
			.await
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
						Some(AnyCodeServer::Socket(s)) => ($sb, Ok(s)),
						Some(_) => return Err(AnyError::from(MismatchedLaunchModeError())),
						None => {
							$sb.setup().await?;
							let r = $sb.listen_on_default_socket().await;
							($sb, r)
						}
					}
				};
			}

			let (sb, server) = if params.use_local_download {
				let sb = ServerBuilder::new(
					&install_log,
					&resolved,
					&c.launcher_paths,
					Arc::new(c.http.delegated()),
				);
				do_setup!(sb)
			} else {
				let sb =
					ServerBuilder::new(&install_log, &resolved, &c.launcher_paths, c.http.clone());
				do_setup!(sb)
			};

			let server = match server {
				Ok(s) => s,
				Err(e) => {
					// we don't loop to avoid doing so infinitely: allow the client to reconnect in this case.
					if let AnyError::CodeError(CodeError::ServerUnexpectedExit(ref e)) = e {
						warning!(
							c.log,
							"({}), removing server due to possible corruptions",
							e
						);
						if let Err(e) = sb.evict().await {
							warning!(c.log, "Failed to evict server: {}", e);
						}
					}
					return Err(e);
				}
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
	multiplexer: ServerMultiplexer,
	socket_id: u16,
	compress: bool,
) -> Result<u16, AnyError> {
	let (server_messages, decoder) = if compress {
		(
			ServerMessageSink::new_compressed(
				multiplexer.clone(),
				socket_id,
				ServerMessageDestination::Channel(socket_tx),
			),
			ClientMessageDecoder::new_compressed(),
		)
	} else {
		(
			ServerMessageSink::new_plain(
				multiplexer.clone(),
				socket_id,
				ServerMessageDestination::Channel(socket_tx),
			),
			ClientMessageDecoder::new_plain(),
		)
	};

	let attached_fut = ServerBridge::new(&code_server.socket, server_messages, decoder).await;
	match attached_fut {
		Ok(a) => {
			multiplexer.register(socket_id, a);
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
	multiplexer: &ServerMultiplexer,
	params: ServerMessageParams,
) -> Result<EmptyObject, AnyError> {
	if multiplexer.write_message(log, params.i, params.body) {
		Ok(EmptyObject {})
	} else {
		Err(AnyError::from(NoAttachedServerError()))
	}
}

fn handle_prune(paths: &LauncherPaths) -> Result<Vec<String>, AnyError> {
	prune_stopped_servers(paths).map(|v| {
		v.iter()
			.map(|p| p.server_dir.display().to_string())
			.collect()
	})
}

async fn handle_update(
	http: &Arc<FallbackSimpleHttp>,
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

	let _ = updater.cleanup_old_update();

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

	let r = updater
		.do_update(&latest_release, SilentCopyProgress())
		.await;

	if let Err(e) = r {
		did_update.store(false, Ordering::SeqCst);
		return Err(e);
	}

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

fn handle_stat(path: String) -> Result<FsStatResponse, AnyError> {
	Ok(std::fs::metadata(path)
		.map(|m| FsStatResponse {
			exists: true,
			size: Some(m.len()),
			kind: Some(m.file_type().into()),
		})
		.unwrap_or_default())
}

async fn handle_fs_read(mut out: DuplexStream, path: String) -> Result<EmptyObject, AnyError> {
	let mut f = tokio::fs::File::open(path)
		.await
		.map_err(|e| wrap(e, "file not found"))?;

	tokio::io::copy(&mut f, &mut out)
		.await
		.map_err(|e| wrap(e, "error reading file"))?;

	Ok(EmptyObject {})
}

async fn handle_fs_write(mut input: DuplexStream, path: String) -> Result<EmptyObject, AnyError> {
	let mut f = tokio::fs::File::create(path)
		.await
		.map_err(|e| wrap(e, "file not found"))?;

	tokio::io::copy(&mut input, &mut f)
		.await
		.map_err(|e| wrap(e, "error writing file"))?;

	Ok(EmptyObject {})
}

async fn handle_net_connect(
	mut stream: DuplexStream,
	req: NetConnectRequest,
) -> Result<EmptyObject, AnyError> {
	let mut s = TcpStream::connect((req.host, req.port))
		.await
		.map_err(|e| wrap(e, "could not connect to address"))?;

	tokio::io::copy_bidirectional(&mut stream, &mut s)
		.await
		.map_err(|e| wrap(e, "error copying stream data"))?;

	Ok(EmptyObject {})
}
async fn handle_fs_connect(
	mut stream: DuplexStream,
	path: String,
) -> Result<EmptyObject, AnyError> {
	let mut s = get_socket_rw_stream(&PathBuf::from(path))
		.await
		.map_err(|e| wrap(e, "could not connect to socket"))?;

	tokio::io::copy_bidirectional(&mut stream, &mut s)
		.await
		.map_err(|e| wrap(e, "error copying stream data"))?;

	Ok(EmptyObject {})
}

async fn handle_fs_remove(path: String) -> Result<EmptyObject, AnyError> {
	tokio::fs::remove_dir_all(path)
		.await
		.map_err(|e| wrap(e, "error removing directory"))?;
	Ok(EmptyObject {})
}

fn handle_fs_rename(from_path: String, to_path: String) -> Result<EmptyObject, AnyError> {
	std::fs::rename(from_path, to_path).map_err(|e| wrap(e, "error renaming"))?;
	Ok(EmptyObject {})
}

fn handle_fs_mkdirp(path: String) -> Result<EmptyObject, AnyError> {
	std::fs::create_dir_all(path).map_err(|e| wrap(e, "error creating directory"))?;
	Ok(EmptyObject {})
}

fn handle_fs_readdir(path: String) -> Result<FsReadDirResponse, AnyError> {
	let mut entries = std::fs::read_dir(path).map_err(|e| wrap(e, "error listing directory"))?;

	let mut contents = Vec::new();
	while let Some(Ok(child)) = entries.next() {
		contents.push(FsReadDirEntry {
			name: child.file_name().to_string_lossy().into_owned(),
			kind: child.file_type().ok().map(|v| v.into()),
		});
	}

	Ok(FsReadDirResponse { contents })
}

fn handle_sys_kill(pid: u32) -> Result<SysKillResponse, AnyError> {
	Ok(SysKillResponse {
		success: kill_pid(pid),
	})
}

fn handle_get_env() -> Result<GetEnvResponse, AnyError> {
	Ok(GetEnvResponse {
		env: std::env::vars().collect(),
		os_release: os_release().unwrap_or_else(|_| "unknown".to_string()),
		#[cfg(windows)]
		os_platform: "win32",
		#[cfg(target_os = "linux")]
		os_platform: "linux",
		#[cfg(target_os = "macos")]
		os_platform: "darwin",
	})
}

fn handle_challenge_issue(
	params: ChallengeIssueParams,
	auth_state: &Arc<std::sync::Mutex<AuthState>>,
) -> Result<ChallengeIssueResponse, AnyError> {
	let challenge = create_challenge();

	let mut auth_state = auth_state.lock().unwrap();
	if let AuthState::WaitingForChallenge(Some(s)) = &*auth_state {
		match &params.token {
			Some(t) if s != t => return Err(CodeError::AuthChallengeBadToken.into()),
			None => return Err(CodeError::AuthChallengeBadToken.into()),
			_ => {}
		}
	}

	*auth_state = AuthState::ChallengeIssued(challenge.clone());
	Ok(ChallengeIssueResponse { challenge })
}

fn handle_challenge_verify(
	response: String,
	auth_state: &Arc<std::sync::Mutex<AuthState>>,
) -> Result<EmptyObject, AnyError> {
	let mut auth_state = auth_state.lock().unwrap();

	match &*auth_state {
		AuthState::Authenticated => Ok(EmptyObject {}),
		AuthState::WaitingForChallenge(_) => Err(CodeError::AuthChallengeNotIssued.into()),
		AuthState::ChallengeIssued(c) => match verify_challenge(c, &response) {
			false => Err(CodeError::AuthChallengeNotIssued.into()),
			true => {
				*auth_state = AuthState::Authenticated;
				Ok(EmptyObject {})
			}
		},
	}
}

async fn handle_forward(
	log: &log::Logger,
	port_forwarding: &Option<PortForwarding>,
	params: ForwardParams,
) -> Result<ForwardResult, AnyError> {
	let port_forwarding = port_forwarding
		.as_ref()
		.ok_or(CodeError::PortForwardingNotAvailable)?;
	info!(
		log,
		"Forwarding port {} (public={})", params.port, params.public
	);
	let privacy = match params.public {
		true => PortPrivacy::Public,
		false => PortPrivacy::Private,
	};

	let uri = port_forwarding.forward(params.port, privacy).await?;
	Ok(ForwardResult { uri })
}

async fn handle_unforward(
	log: &log::Logger,
	port_forwarding: &Option<PortForwarding>,
	params: UnforwardParams,
) -> Result<EmptyObject, AnyError> {
	let port_forwarding = port_forwarding
		.as_ref()
		.ok_or(CodeError::PortForwardingNotAvailable)?;
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

async fn handle_acquire_cli(
	paths: &LauncherPaths,
	http: &Arc<FallbackSimpleHttp>,
	log: &log::Logger,
	params: AcquireCliParams,
) -> Result<SpawnResult, AnyError> {
	let update_service = UpdateService::new(log.clone(), http.clone());

	let release = match params.commit_id {
		Some(commit) => Release {
			name: format!("{PRODUCT_NAME_LONG} CLI"),
			commit,
			platform: params.platform,
			quality: params.quality,
			target: TargetKind::Cli,
		},
		None => {
			update_service
				.get_latest_commit(params.platform, TargetKind::Cli, params.quality)
				.await?
		}
	};

	let cli = download_cli_into_cache(&paths.cli_cache, &release, &update_service).await?;
	let file = tokio::fs::File::open(cli)
		.await
		.map_err(|e| wrap(e, "error opening cli file"))?;

	handle_spawn::<_, DuplexStream>(log, params.spawn, Some(file), None, None).await
}

async fn handle_spawn<Stdin, StdoutAndErr>(
	log: &log::Logger,
	params: SpawnParams,
	stdin: Option<Stdin>,
	stdout: Option<StdoutAndErr>,
	stderr: Option<StdoutAndErr>,
) -> Result<SpawnResult, AnyError>
where
	Stdin: AsyncRead + Unpin + Send + 'static,
	StdoutAndErr: AsyncWrite + Unpin + Send + 'static,
{
	debug!(
		log,
		"requested to spawn {} with args {:?}", params.command, params.args
	);

	macro_rules! pipe_if {
		($e: expr) => {
			if $e {
				Stdio::piped()
			} else {
				Stdio::null()
			}
		};
	}

	let mut p = new_tokio_command(&params.command);
	p.args(&params.args);
	p.envs(&params.env);
	p.stdin(pipe_if!(stdin.is_some()));
	p.stdout(pipe_if!(stdin.is_some()));
	p.stderr(pipe_if!(stderr.is_some()));
	if let Some(cwd) = &params.cwd {
		p.current_dir(cwd);
	}

	#[cfg(target_os = "windows")]
	p.creation_flags(winapi::um::winbase::CREATE_NO_WINDOW);

	let mut p = p.spawn().map_err(CodeError::ProcessSpawnFailed)?;

	let block_futs = FuturesUnordered::new();
	let poll_futs = FuturesUnordered::new();
	if let (Some(mut a), Some(mut b)) = (p.stdout.take(), stdout) {
		block_futs.push(async move { tokio::io::copy(&mut a, &mut b).await }.boxed());
	}
	if let (Some(mut a), Some(mut b)) = (p.stderr.take(), stderr) {
		block_futs.push(async move { tokio::io::copy(&mut a, &mut b).await }.boxed());
	}
	if let (Some(mut b), Some(mut a)) = (p.stdin.take(), stdin) {
		poll_futs.push(async move { tokio::io::copy(&mut a, &mut b).await }.boxed());
	}

	wait_for_process_exit(log, &params.command, p, block_futs, poll_futs).await
}

async fn handle_spawn_cli(
	log: &log::Logger,
	params: SpawnParams,
	mut protocol_in: DuplexStream,
	mut protocol_out: DuplexStream,
	mut log_out: DuplexStream,
) -> Result<SpawnResult, AnyError> {
	debug!(
		log,
		"requested to spawn cli {} with args {:?}", params.command, params.args
	);

	let mut p = new_tokio_command(&params.command);
	p.args(&params.args);

	// CLI args to spawn a server; contracted with clients that they should _not_ provide these.
	p.arg("--verbose");
	p.arg("command-shell");

	p.envs(&params.env);
	p.stdin(Stdio::piped());
	p.stdout(Stdio::piped());
	p.stderr(Stdio::piped());
	if let Some(cwd) = &params.cwd {
		p.current_dir(cwd);
	}

	let mut p = p.spawn().map_err(CodeError::ProcessSpawnFailed)?;

	let mut stdin = p.stdin.take().unwrap();
	let mut stdout = p.stdout.take().unwrap();
	let mut stderr = p.stderr.take().unwrap();

	// Start handling logs while doing the handshake in case there's some kind of error
	let log_pump = tokio::spawn(async move { tokio::io::copy(&mut stdout, &mut log_out).await });

	// note: intentionally do not wrap stdin in a bufreader, since we don't
	// want to read anything other than our handshake messages.
	if let Err(e) = spawn_do_child_authentication(log, &mut stdin, &mut stderr).await {
		warning!(log, "failed to authenticate with child process {}", e);
		let _ = p.kill().await;
		return Err(e.into());
	}

	debug!(log, "cli authenticated, attaching stdio");
	let block_futs = FuturesUnordered::new();
	let poll_futs = FuturesUnordered::new();
	poll_futs.push(async move { tokio::io::copy(&mut protocol_in, &mut stdin).await }.boxed());
	block_futs.push(async move { tokio::io::copy(&mut stderr, &mut protocol_out).await }.boxed());
	block_futs.push(async move { log_pump.await.unwrap() }.boxed());

	wait_for_process_exit(log, &params.command, p, block_futs, poll_futs).await
}

type TokioCopyFuture = dyn futures::Future<Output = Result<u64, std::io::Error>> + Send;

async fn get_joined_result(
	mut process: tokio::process::Child,
	block_futs: FuturesUnordered<std::pin::Pin<Box<TokioCopyFuture>>>,
) -> Result<std::process::ExitStatus, std::io::Error> {
	let (_, r) = tokio::join!(futures::future::join_all(block_futs), process.wait());
	r
}

/// Wait for the process to exit and sends the spawn result. Waits until the
/// `block_futs` and the process have exited, and polls the `poll_futs` while
/// doing so.
async fn wait_for_process_exit(
	log: &log::Logger,
	command: &str,
	process: tokio::process::Child,
	block_futs: FuturesUnordered<std::pin::Pin<Box<TokioCopyFuture>>>,
	poll_futs: FuturesUnordered<std::pin::Pin<Box<TokioCopyFuture>>>,
) -> Result<SpawnResult, AnyError> {
	let joined = get_joined_result(process, block_futs);
	pin!(joined);

	let r = tokio::select! {
		_ = futures::future::join_all(poll_futs) => joined.await,
		r = &mut joined => r,
	};

	let r = match r {
		Ok(e) => SpawnResult {
			message: e.to_string(),
			exit_code: e.code().unwrap_or(-1),
		},
		Err(e) => SpawnResult {
			message: e.to_string(),
			exit_code: -1,
		},
	};

	debug!(
		log,
		"spawned cli {} exited with code {}", command, r.exit_code
	);

	Ok(r)
}

async fn spawn_do_child_authentication(
	log: &log::Logger,
	stdin: &mut ChildStdin,
	stdout: &mut ChildStderr,
) -> Result<(), CodeError> {
	let (msg_tx, msg_rx) = mpsc::unbounded_channel();
	let (shutdown_rx, shutdown) = new_barrier();
	let mut rpc = new_msgpack_rpc();
	let caller = rpc.get_caller(msg_tx);

	let challenge_response = do_challenge_response_flow(caller, shutdown);
	let rpc = start_msgpack_rpc(
		rpc.methods(()).build(log.prefixed("client-auth")),
		stdout,
		stdin,
		msg_rx,
		shutdown_rx,
	);
	pin!(rpc);

	tokio::select! {
		r = &mut rpc => {
			match r {
				// means shutdown happened cleanly already, we're good
				Ok(_) => Ok(()),
				Err(e) => Err(CodeError::ProcessSpawnHandshakeFailed(e))
			}
		},
		r = challenge_response => {
			r?;
			rpc.await.map(|_| ()).map_err(CodeError::ProcessSpawnFailed)
		}
	}
}

async fn do_challenge_response_flow(
	caller: RpcCaller<MsgPackSerializer>,
	shutdown: BarrierOpener<()>,
) -> Result<(), CodeError> {
	let challenge: ChallengeIssueResponse = caller
		.call(METHOD_CHALLENGE_ISSUE, EmptyObject {})
		.await
		.unwrap()
		.map_err(CodeError::TunnelRpcCallFailed)?;

	let _: EmptyObject = caller
		.call(
			METHOD_CHALLENGE_VERIFY,
			ChallengeVerifyParams {
				response: sign_challenge(&challenge.challenge),
			},
		)
		.await
		.unwrap()
		.map_err(CodeError::TunnelRpcCallFailed)?;

	shutdown.open(());

	Ok(())
}
