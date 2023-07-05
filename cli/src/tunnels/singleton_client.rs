/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	path::Path,
	sync::{
		atomic::{AtomicBool, Ordering},
		Arc,
	},
	thread,
};

use const_format::concatcp;
use tokio::sync::mpsc;

use crate::{
	async_pipe::{socket_stream_split, AsyncPipe},
	constants::IS_INTERACTIVE_CLI,
	json_rpc::{new_json_rpc, start_json_rpc, JsonRpcSerializer},
	log,
	rpc::RpcCaller,
	singleton::connect_as_client,
	tunnels::{code_server::print_listening, protocol::EmptyObject},
	util::{errors::CodeError, sync::Barrier},
};

use super::{
	protocol,
	shutdown_signal::{ShutdownRequest, ShutdownSignal},
};

pub struct SingletonClientArgs {
	pub log: log::Logger,
	pub stream: AsyncPipe,
	pub shutdown: Barrier<ShutdownSignal>,
}

struct SingletonServerContext {
	log: log::Logger,
	exit_entirely: Arc<AtomicBool>,
	caller: RpcCaller<JsonRpcSerializer>,
}

const CONTROL_INSTRUCTIONS_COMMON: &str =
	"Connected to an existing tunnel process running on this machine.";

const CONTROL_INSTRUCTIONS_INTERACTIVE: &str = concatcp!(
	CONTROL_INSTRUCTIONS_COMMON,
	" You can press:

- \"x\" + Enter to stop the tunnel and exit
- \"r\" + Enter to restart the tunnel
- Ctrl+C to detach
"
);

/// Serves a client singleton. Returns true if the process should exit after
/// this returns, instead of trying to start a tunnel.
pub async fn start_singleton_client(args: SingletonClientArgs) -> bool {
	let mut rpc = new_json_rpc();
	let (msg_tx, msg_rx) = mpsc::unbounded_channel();
	let exit_entirely = Arc::new(AtomicBool::new(false));

	debug!(
		args.log,
		"An existing tunnel is running on this machine, connecting to it..."
	);

	if *IS_INTERACTIVE_CLI {
		let stdin_handle = rpc.get_caller(msg_tx.clone());
		thread::spawn(move || {
			let mut input = String::new();
			loop {
				input.truncate(0);
				match std::io::stdin().read_line(&mut input) {
					Err(_) | Ok(0) => return, // EOF or not a tty
					_ => {}
				};

				match input.chars().next().map(|c| c.to_ascii_lowercase()) {
					Some('x') => {
						stdin_handle.notify(protocol::singleton::METHOD_SHUTDOWN, EmptyObject {});
						return;
					}
					Some('r') => {
						stdin_handle.notify(protocol::singleton::METHOD_RESTART, EmptyObject {});
					}
					Some(_) | None => {}
				}
			}
		});
	}

	let caller = rpc.get_caller(msg_tx);
	let mut rpc = rpc.methods(SingletonServerContext {
		log: args.log.clone(),
		exit_entirely: exit_entirely.clone(),
		caller,
	});

	rpc.register_sync(protocol::singleton::METHOD_SHUTDOWN, |_: EmptyObject, c| {
		c.exit_entirely.store(true, Ordering::SeqCst);
		Ok(())
	});

	rpc.register_async(
		protocol::singleton::METHOD_LOG_REPLY_DONE,
		|_: EmptyObject, c| async move {
			c.log.result(if *IS_INTERACTIVE_CLI {
				CONTROL_INSTRUCTIONS_INTERACTIVE
			} else {
				CONTROL_INSTRUCTIONS_COMMON
			});

			let res = c.caller.call::<_, _, protocol::singleton::Status>(
				protocol::singleton::METHOD_STATUS,
				protocol::EmptyObject {},
			);

			// we want to ensure the "listening" string always gets printed for
			// consumers (i.e. VS Code). Ask for it. If the tunnel is not currently
			// connected though, it will be soon, and that'll be in the log replays.
			if let Ok(Ok(s)) = res.await {
				if let protocol::singleton::TunnelState::Connected { name } = s.tunnel {
					print_listening(&c.log, &name);
				}
			}

			Ok(())
		},
	);

	rpc.register_sync(
		protocol::singleton::METHOD_LOG,
		|log: protocol::singleton::LogMessageOwned, c| {
			match log.level {
				Some(level) => c.log.emit(level, &format!("{}{}", log.prefix, log.message)),
				None => c.log.result(format!("{}{}", log.prefix, log.message)),
			}
			Ok(())
		},
	);

	let (read, write) = socket_stream_split(args.stream);
	let _ = start_json_rpc(rpc.build(args.log), read, write, msg_rx, args.shutdown).await;

	exit_entirely.load(Ordering::SeqCst)
}

pub async fn do_single_rpc_call<
	P: serde::Serialize + 'static,
	R: serde::de::DeserializeOwned + Send + 'static,
>(
	lock_file: &Path,
	log: log::Logger,
	method: &'static str,
	params: P,
) -> Result<R, CodeError> {
	let client = match connect_as_client(lock_file).await {
		Ok(p) => p,
		Err(CodeError::SingletonLockfileOpenFailed(_))
		| Err(CodeError::SingletonLockedProcessExited(_)) => {
			return Err(CodeError::NoRunningTunnel);
		}
		Err(e) => return Err(e),
	};

	let (msg_tx, msg_rx) = mpsc::unbounded_channel();
	let mut rpc = new_json_rpc();
	let caller = rpc.get_caller(msg_tx);
	let (read, write) = socket_stream_split(client);

	let rpc = tokio::spawn(async move {
		start_json_rpc(
			rpc.methods(()).build(log),
			read,
			write,
			msg_rx,
			ShutdownRequest::create_rx([ShutdownRequest::CtrlC]),
		)
		.await
		.unwrap();
	});

	let r = caller.call(method, params).await.unwrap();
	rpc.abort();
	r.map_err(CodeError::TunnelRpcCallFailed)
}
