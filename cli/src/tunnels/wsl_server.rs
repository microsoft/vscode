/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::PathBuf;

use tokio::sync::mpsc;

use crate::{
	json_rpc::{new_json_rpc, start_json_rpc, JsonRpcSerializer},
	log,
	rpc::RpcCaller,
	state::LauncherPaths,
	tunnels::code_server::ServerBuilder,
	update_service::{Platform, Release, TargetKind},
	util::{
		errors::{wrap, AnyError, MismatchedLaunchModeError},
		http::ReqwestSimpleHttp,
	},
};

use super::{
	code_server::{AnyCodeServer, CodeServerArgs, ResolvedServerParams},
	protocol::{InstallFromLocalFolderParams, InstallPortServerResult},
	shutdown_signal::ShutdownSignal,
};

struct HandlerContext {
	log: log::Logger,
	code_server_args: CodeServerArgs,
	launcher_paths: LauncherPaths,
	platform: Platform,
	http: ReqwestSimpleHttp,
}

#[derive(Clone)]
struct JsonRpcLogSink(RpcCaller<JsonRpcSerializer>);

impl JsonRpcLogSink {
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

impl log::LogSink for JsonRpcLogSink {
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
	shutdown_rx: mpsc::UnboundedReceiver<ShutdownSignal>,
) -> Result<i32, AnyError> {
	let (caller_tx, caller_rx) = mpsc::unbounded_channel();
	let mut rpc = new_json_rpc();
	let caller = rpc.get_caller(caller_tx);

	let log = log.with_sink(JsonRpcLogSink(caller));
	let mut rpc = rpc.methods(HandlerContext {
		log: log.clone(),
		code_server_args,
		launcher_paths,
		platform,
		http: ReqwestSimpleHttp::with_client(http),
	});

	rpc.register_async(
		"install_local",
		move |params: InstallFromLocalFolderParams, c| async move { install_local(&c, params).await },
	);

	start_json_rpc(
		rpc.build(log),
		tokio::io::stdin(),
		tokio::io::stdout(),
		caller_rx,
		shutdown_rx,
	)
	.await
	.map_err(|e| wrap(e, "error handling server stdio"))?;

	Ok(0)
}

async fn install_local(
	c: &HandlerContext,
	params: InstallFromLocalFolderParams,
) -> Result<InstallPortServerResult, AnyError> {
	// fill params.extensions into code_server_args.install_extensions
	let mut csa = c.code_server_args.clone();
	csa.install_extensions.extend(params.extensions.into_iter());

	let resolved = ResolvedServerParams {
		code_server_args: csa,
		release: Release {
			name: String::new(),
			commit: params.commit_id,
			platform: c.platform,
			target: TargetKind::Server,
			quality: params.quality,
		},
	};

	let sb = ServerBuilder::new(&c.log, &resolved, &c.launcher_paths, c.http.clone());

	let s = match sb.get_running().await? {
		Some(AnyCodeServer::Port(s)) => s,
		Some(_) => return Err(MismatchedLaunchModeError().into()),
		None => {
			sb.setup(Some(PathBuf::from(params.archive_path))).await?;
			sb.listen_on_port(0).await?
		}
	};

	Ok(InstallPortServerResult { port: s.port })
}
