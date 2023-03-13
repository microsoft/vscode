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
use sysinfo::Pid;
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
	pub parent_pid: Option<Pid>,
}

#[derive(Clone)]
struct SingletonServerContext {
	shutdown: BarrierOpener<()>,
}

pub async fn start_singleton_server(
	mut args: SingletonServerArgs,
) -> Result<ServerTermination, AnyError> {
	let (event_tx, _) = broadcast::channel(64);
	let log_broadcast = BroadcastLogSink::new(event_tx);
	let log = args.log.tee(log_broadcast.clone());
	let (shutdown_rx, shutdown_tx) = new_barrier();
	let shutdown_rx = ShutdownRequest::create_rx(match args.parent_pid {
		Some(pid) => vec![
			ShutdownRequest::ParentProcessKilled(pid),
			ShutdownRequest::RpcShutdownRequested(shutdown_rx),
			ShutdownRequest::CtrlC,
		],
		None => vec![
			ShutdownRequest::RpcShutdownRequested(shutdown_rx),
			ShutdownRequest::CtrlC,
		],
	});

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
			log_broadcast,
			&mut args.server,
			rpc.build(log.clone()),
			shutdown_rx.clone(),
		),
		super::serve(
			&log,
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

#[derive(Clone)]
pub struct BroadcastLogSink {
	recent: Arc<Mutex<RingBuffer<Vec<u8>>>>,
	tx: broadcast::Sender<Vec<u8>>,
}

impl BroadcastLogSink {
	pub fn new(tx: broadcast::Sender<Vec<u8>>) -> Self {
		Self {
			tx,
			recent: Arc::new(Mutex::new(RingBuffer::new(50))),
		}
	}

	pub fn replay_and_subscribe(
		&self,
	) -> ConcatReceivable<Vec<u8>, mpsc::UnboundedReceiver<Vec<u8>>, broadcast::Receiver<Vec<u8>>> {
		let (log_replay_tx, log_replay_rx) = mpsc::unbounded_channel();
		for log in self.recent.lock().unwrap().iter() {
			let _ = log_replay_tx.send(log.clone());
		}

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

	fn write_result(&self, _message: &str) {}
}
