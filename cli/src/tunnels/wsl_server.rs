/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::Arc;

use tokio::sync::mpsc;

use crate::{
	log,
	msgpack_rpc::{new_msgpack_rpc, start_msgpack_rpc, MsgPackCaller},
	state::LauncherPaths,
	tunnels::code_server::ServerBuilder,
	update_service::{Platform, Release, TargetKind},
	util::{
		errors::{
			wrap, AnyError, InvalidRpcDataError, MismatchedLaunchModeError, NoAttachedServerError,
		},
		http::ReqwestSimpleHttp,
		sync::Barrier,
	},
};

use super::{
	code_server::{AnyCodeServer, CodeServerArgs, ResolvedServerParams},
	protocol::{EmptyObject, InstallFromLocalFolderParams, ServerMessageParams, VersionParams},
	server_bridge::ServerBridge,
	server_multiplexer::ServerMultiplexer,
	shutdown_signal::ShutdownSignal,
	socket_signal::{ClientMessageDecoder, ServerMessageDestination, ServerMessageSink},
};

struct HandlerContext {
	log: log::Logger,
	code_server_args: CodeServerArgs,
	launcher_paths: LauncherPaths,
	platform: Platform,
	http: ReqwestSimpleHttp,
	caller: MsgPackCaller,
	multiplexer: ServerMultiplexer,
}

#[derive(Clone)]
struct RpcLogSink(MsgPackCaller);

impl RpcLogSink {
	fn write_json(&self, level: String, message: &str) {
		self.0.notify(
			"log",
			serde_json::json!({
				"level": level,
				"message": message,
			}),
		);
	}
}

impl log::LogSink for RpcLogSink {
	fn write_log(&self, level: log::Level, _prefix: &str, message: &str) {
		self.write_json(level.to_string(), message);
	}

	fn write_result(&self, message: &str) {
		self.write_json("result".to_string(), message);
	}
}

pub async fn serve_wsl(
	log: log::Logger,
	launcher_paths: LauncherPaths,
	code_server_args: CodeServerArgs,
	platform: Platform,
	http: reqwest::Client,
	shutdown_rx: Barrier<ShutdownSignal>,
) -> Result<i32, AnyError> {
	let (caller_tx, caller_rx) = mpsc::unbounded_channel();
	let mut rpc = new_msgpack_rpc();
	let caller = rpc.get_caller(caller_tx);

	// notify the incoming client about the server version
	caller.notify("version", VersionParams::default());

	let log = log.with_sink(RpcLogSink(caller.clone()));
	let mut rpc = rpc.methods(HandlerContext {
		log: log.clone(),
		caller,
		code_server_args,
		launcher_paths,
		platform,
		multiplexer: ServerMultiplexer::new(),
		http: ReqwestSimpleHttp::with_client(http),
	});

	rpc.register_async(
		"serve",
		move |m: InstallFromLocalFolderParams, c| async move { handle_serve(&c, m).await },
	);
	rpc.register_sync("servermsg", move |m: ServerMessageParams, c| {
		if c.multiplexer.write_message(&c.log, m.i, m.body) {
			Ok(EmptyObject {})
		} else {
			Err(NoAttachedServerError().into())
		}
	});

	start_msgpack_rpc(
		rpc.build(log),
		tokio::io::stdin(),
		tokio::io::stderr(),
		caller_rx,
		shutdown_rx,
	)
	.await
	.map_err(|e| wrap(e, "error handling server stdio"))?;

	Ok(0)
}

async fn handle_serve(
	c: &HandlerContext,
	params: InstallFromLocalFolderParams,
) -> Result<EmptyObject, AnyError> {
	// fill params.extensions into code_server_args.install_extensions
	let mut csa = c.code_server_args.clone();
	csa.connection_token = params.inner.connection_token.or(csa.connection_token);
	csa.install_extensions
		.extend(params.inner.extensions.into_iter());

	let resolved = ResolvedServerParams {
		code_server_args: csa,
		release: Release {
			name: String::new(),
			commit: params
				.inner
				.commit_id
				.ok_or_else(|| InvalidRpcDataError("commit_id is required".to_string()))?,
			platform: c.platform,
			target: TargetKind::Server,
			quality: params.inner.quality,
		},
	};

	let sb = ServerBuilder::new(
		&c.log,
		&resolved,
		&c.launcher_paths,
		Arc::new(c.http.clone()),
	);
	let code_server = match sb.get_running().await? {
		Some(AnyCodeServer::Socket(s)) => s,
		Some(_) => return Err(MismatchedLaunchModeError().into()),
		None => {
			sb.setup().await?;
			sb.listen_on_default_socket().await?
		}
	};

	let bridge = ServerBridge::new(
		&code_server.socket,
		ServerMessageSink::new_plain(
			c.multiplexer.clone(),
			params.inner.socket_id,
			ServerMessageDestination::Rpc(c.caller.clone()),
		),
		ClientMessageDecoder::new_plain(),
	)
	.await?;

	c.multiplexer.register(params.inner.socket_id, bridge);
	trace!(c.log, "Attached to server");
	Ok(EmptyObject {})
}
