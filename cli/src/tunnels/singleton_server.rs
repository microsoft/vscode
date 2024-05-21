/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	pin::Pin,
	sync::{Arc, Mutex},
};

use super::{
	code_server::CodeServerArgs,
	control_server::ServerTermination,
	dev_tunnels::{ActiveTunnel, StatusLock},
	protocol,
	shutdown_signal::{ShutdownRequest, ShutdownSignal},
};
use crate::{
	async_pipe::socket_stream_split,
	json_rpc::{new_json_rpc, start_json_rpc, JsonRpcSerializer},
	log,
	rpc::{RpcCaller, RpcDispatcher},
	singleton::SingletonServer,
	state::LauncherPaths,
	tunnels::code_server::print_listening,
	update_service::Platform,
	util::{
		errors::{AnyError, CodeError},
		ring_buffer::RingBuffer,
		sync::{Barrier, ConcatReceivable},
	},
};
use futures::future::Either;
use tokio::{
	pin,
	sync::{broadcast, mpsc},
	task::JoinHandle,
};

pub struct SingletonServerArgs<'a> {
	pub server: &'a mut RpcServer,
	pub log: log::Logger,
	pub tunnel: ActiveTunnel,
	pub paths: &'a LauncherPaths,
	pub code_server_args: &'a CodeServerArgs,
	pub platform: Platform,
	pub shutdown: Barrier<ShutdownSignal>,
	pub log_broadcast: &'a BroadcastLogSink,
}

struct StatusInfo {
	name: String,
	lock: StatusLock,
}

#[derive(Clone)]
struct SingletonServerContext {
	log: log::Logger,
	shutdown_tx: broadcast::Sender<ShutdownSignal>,
	broadcast_tx: broadcast::Sender<Vec<u8>>,
	// ugly: a lock in a lock. current_status needs to be provided only
	// after we set up the tunnel, however the tunnel is created after the
	// singleton server starts to avoid a gap in singleton availability.
	// However, this should be safe, as the lock is only used for immediate
	// data reads (in the `status` method).
	current_status: Arc<Mutex<Option<StatusInfo>>>,
}

pub struct RpcServer {
	fut: JoinHandle<Result<(), CodeError>>,
	shutdown_broadcast: broadcast::Sender<ShutdownSignal>,
	current_status: Arc<Mutex<Option<StatusInfo>>>,
}

pub fn make_singleton_server(
	log_broadcast: BroadcastLogSink,
	log: log::Logger,
	server: SingletonServer,
	shutdown_rx: Barrier<ShutdownSignal>,
) -> RpcServer {
	let (shutdown_broadcast, _) = broadcast::channel(4);
	let rpc = new_json_rpc();

	let current_status = Arc::new(Mutex::default());
	let mut rpc = rpc.methods(SingletonServerContext {
		log: log.clone(),
		shutdown_tx: shutdown_broadcast.clone(),
		broadcast_tx: log_broadcast.get_brocaster(),
		current_status: current_status.clone(),
	});

	rpc.register_sync(
		protocol::singleton::METHOD_RESTART,
		|_: protocol::EmptyObject, ctx| {
			info!(ctx.log, "restarting tunnel after client request");
			let _ = ctx.shutdown_tx.send(ShutdownSignal::RpcRestartRequested);
			Ok(())
		},
	);

	rpc.register_sync(
		protocol::singleton::METHOD_STATUS,
		|_: protocol::EmptyObject, c| {
			Ok(c.current_status
				.lock()
				.unwrap()
				.as_ref()
				.map(|s| protocol::singleton::StatusWithTunnelName {
					name: Some(s.name.clone()),
					status: s.lock.read(),
				})
				.unwrap_or_default())
		},
	);

	rpc.register_sync(
		protocol::singleton::METHOD_SHUTDOWN,
		|_: protocol::EmptyObject, ctx| {
			info!(
				ctx.log,
				"closing tunnel and all clients after a shutdown request"
			);
			let _ = ctx.broadcast_tx.send(RpcCaller::serialize_notify(
				&JsonRpcSerializer {},
				protocol::singleton::METHOD_SHUTDOWN,
				protocol::EmptyObject {},
			));
			let _ = ctx.shutdown_tx.send(ShutdownSignal::RpcShutdownRequested);
			Ok(())
		},
	);

	// we tokio spawn instead of keeping a future, since we want it to progress
	// even outside of the start_singleton_server loop (i.e. while the tunnel restarts)
	let fut = tokio::spawn(async move {
		serve_singleton_rpc(log_broadcast, server, rpc.build(log), shutdown_rx).await
	});
	RpcServer {
		shutdown_broadcast,
		current_status,
		fut,
	}
}

pub async fn start_singleton_server<'a>(
	args: SingletonServerArgs<'_>,
) -> Result<ServerTermination, AnyError> {
	let shutdown_rx = ShutdownRequest::create_rx([
		ShutdownRequest::Derived(Box::new(args.server.shutdown_broadcast.subscribe())),
		ShutdownRequest::Derived(Box::new(args.shutdown.clone())),
	]);

	{
		print_listening(&args.log, &args.tunnel.name);
		let mut status = args.server.current_status.lock().unwrap();
		*status = Some(StatusInfo {
			name: args.tunnel.name.clone(),
			lock: args.tunnel.status(),
		})
	}

	let serve_fut = super::serve(
		&args.log,
		args.tunnel,
		args.paths,
		args.code_server_args,
		args.platform,
		shutdown_rx,
	);

	pin!(serve_fut);

	match futures::future::select(Pin::new(&mut args.server.fut), &mut serve_fut).await {
		Either::Left((rpc_result, fut)) => {
			// the rpc server will only end as a result of a graceful shutdown, or
			// with an error. Return the result of the eventual shutdown of the
			// control server.
			rpc_result.unwrap()?;
			fut.await
		}
		Either::Right((ctrl_result, _)) => ctrl_result,
	}
}

async fn serve_singleton_rpc<C: Clone + Send + Sync + 'static>(
	log_broadcast: BroadcastLogSink,
	mut server: SingletonServer,
	dispatcher: RpcDispatcher<JsonRpcSerializer, C>,
	shutdown_rx: Barrier<ShutdownSignal>,
) -> Result<(), CodeError> {
	let mut own_shutdown = shutdown_rx.clone();
	let shutdown_fut = own_shutdown.wait();
	pin!(shutdown_fut);

	loop {
		let cnx = tokio::select! {
			c = server.accept() => c?,
			_ = &mut shutdown_fut => return Ok(()),
		};

		let (read, write) = socket_stream_split(cnx);
		let dispatcher = dispatcher.clone();
		let msg_rx = log_broadcast.replay_and_subscribe();
		let shutdown_rx = shutdown_rx.clone();
		tokio::spawn(async move {
			let _ = start_json_rpc(dispatcher.clone(), read, write, msg_rx, shutdown_rx).await;
		});
	}
}

/// Log sink that can broadcast and replay log events. Used for transmitting
/// logs from the singleton to all clients. This should be created and injected
/// into other services, like the tunnel, before `start_singleton_server`
/// is called.
#[derive(Clone)]
pub struct BroadcastLogSink {
	recent: Arc<Mutex<RingBuffer<Vec<u8>>>>,
	tx: broadcast::Sender<Vec<u8>>,
}

impl Default for BroadcastLogSink {
	fn default() -> Self {
		Self::new()
	}
}

impl BroadcastLogSink {
	pub fn new() -> Self {
		let (tx, _) = broadcast::channel(64);
		Self {
			tx,
			recent: Arc::new(Mutex::new(RingBuffer::new(50))),
		}
	}

	pub fn get_brocaster(&self) -> broadcast::Sender<Vec<u8>> {
		self.tx.clone()
	}

	fn replay_and_subscribe(
		&self,
	) -> ConcatReceivable<Vec<u8>, mpsc::UnboundedReceiver<Vec<u8>>, broadcast::Receiver<Vec<u8>>> {
		let (log_replay_tx, log_replay_rx) = mpsc::unbounded_channel();

		for log in self.recent.lock().unwrap().iter() {
			let _ = log_replay_tx.send(log.clone());
		}

		let _ = log_replay_tx.send(RpcCaller::serialize_notify(
			&JsonRpcSerializer {},
			protocol::singleton::METHOD_LOG_REPLY_DONE,
			protocol::EmptyObject {},
		));

		ConcatReceivable::new(log_replay_rx, self.tx.subscribe())
	}
}

impl log::LogSink for BroadcastLogSink {
	fn write_log(&self, level: log::Level, prefix: &str, message: &str) {
		let s = JsonRpcSerializer {};
		let serialized = RpcCaller::serialize_notify(
			&s,
			protocol::singleton::METHOD_LOG,
			protocol::singleton::LogMessage {
				level: Some(level),
				prefix,
				message,
			},
		);

		let _ = self.tx.send(serialized.clone());
		self.recent.lock().unwrap().push(serialized);
	}

	fn write_result(&self, message: &str) {
		self.write_log(log::Level::Info, "", message);
	}
}
