/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{
	async_pipe::{socket_stream_split, AsyncPipe},
	json_rpc::{new_json_rpc, start_json_rpc},
	log,
	util::sync::Barrier,
};

use super::{protocol, shutdown_signal::ShutdownSignal};

pub struct SingletonClientArgs {
	pub log: log::Logger,
	pub stream: AsyncPipe,
	pub shutdown: Barrier<ShutdownSignal>,
}

struct SingletonServerContext {
	log: log::Logger,
}

pub async fn start_singleton_client(args: SingletonClientArgs) {
	let rpc = new_json_rpc();

	debug!(
		args.log,
		"An existing tunnel is running on this machine, connecting to it..."
	);

	let mut rpc = rpc.methods(SingletonServerContext {
		log: args.log.clone(),
	});

	rpc.register_sync("log", |log: protocol::singleton::LogMessageOwned, c| {
		c.log
			.emit(log.level, &format!("{}: {}", log.prefix, log.message));
		Ok(())
	});

	let (read, write) = socket_stream_split(args.stream);
	let _ = start_json_rpc(rpc.build(args.log), read, write, (), args.shutdown.clone()).await;
}
