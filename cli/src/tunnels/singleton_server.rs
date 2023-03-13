/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::{Arc, Mutex};

use super::{
	code_server::CodeServerArgs,
	control_server::ServerTermination,
	dev_tunnels::ActiveTunnel,
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
	update_service::Platform,
	util::{
		errors::{AnyError, CodeError},
		ring_buffer::RingBuffer,
		sync::{new_barrier, Barrier, BarrierOpener, ConcatReceivable},
	},
};
use tokio::{
	pin,
	sync::{broadcast, mpsc},
};

pub struct SingletonServerArgs {
	pub log: log::Logger,
	pub tunnel: ActiveTunnel,
	pub paths: LauncherPaths,
	pub code_server_args: CodeServerArgs,
	pub platform: Platform,
	pub server: SingletonServer,
	pub shutdown: Barrier<ShutdownSignal>,
	pub log_broadcast: BroadcastLogSink,
}

#[derive(Clone)]
struct SingletonServerContext {
	shutdown: BarrierOpener<()>,
}

pub async fn start_singleton_server(
	mut args: SingletonServerArgs,
) -> Result<ServerTermination, AnyError> {
	let (shutdown_rx, shutdown_tx) = new_barrier();
	let shutdown_rx = ShutdownRequest::create_rx([
		ShutdownRequest::RpcShutdownRequested(shutdown_rx),
		ShutdownRequest::Derived(args.shutdown),
	]);

	let rpc = new_json_rpc();

	let mut rpc = rpc.methods(SingletonServerContext {
		shutdown: shutdown_tx,
	});

	rpc.register_sync("shutdown", |_: protocol::EmptyObject, ctx| {
		ctx.shutdown.open(());
		Ok(())
	});

	let (r1, r2) = tokio::join!(
		serve_singleton_rpc(
			args.log_broadcast,
			&mut args.server,
			rpc.build(args.log.clone()),
			shutdown_rx.clone(),
		),
		super::serve(
			&args.log,
			args.tunnel,
			&args.paths,
			&args.code_server_args,
			args.platform,
			shutdown_rx,
		),
	);

	r1?;
	r2
}

async fn serve_singleton_rpc<C: Clone + Send + Sync + 'static>(
	log_broadcast: BroadcastLogSink,
	server: &mut SingletonServer,
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

	fn replay_and_subscribe(
		&self,
	) -> ConcatReceivable<Vec<u8>, mpsc::UnboundedReceiver<Vec<u8>>, broadcast::Receiver<Vec<u8>>> {
		let (log_replay_tx, log_replay_rx) = mpsc::unbounded_channel();

		for log in self.recent.lock().unwrap().iter() {
			let _ = log_replay_tx.send(log.clone());
		}

		let _ = log_replay_tx.send(RpcCaller::serialize_notify(
			&JsonRpcSerializer {},
			"log",
			protocol::singleton::LogMessage {
				level: log::Level::Info,
				prefix: "",
				message: "Connected to an existing tunnel process running on this machined.",
			},
		));

		ConcatReceivable::new(log_replay_rx, self.tx.subscribe())
	}
}

impl log::LogSink for BroadcastLogSink {
	fn write_log(&self, level: log::Level, prefix: &str, message: &str) {
		let s = JsonRpcSerializer {};
		let serialized = RpcCaller::serialize_notify(
			&s,
			"log",
			protocol::singleton::LogMessage {
				level,
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
