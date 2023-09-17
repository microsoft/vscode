/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use async_trait::async_trait;
use base64::{engine::general_purpose as b64, Engine as _};
use futures::{stream::FuturesUnordered, StreamExt};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{str::FromStr, time::Duration};
use sysinfo::Pid;
use tokio::{
	io::{AsyncBufReadExt, BufReader},
	sync::watch,
};

use super::{
	args::{
		AuthProvider, CliCore, CommandShellArgs, ExistingTunnelArgs, TunnelForwardArgs,
		TunnelRenameArgs, TunnelServeArgs, TunnelServiceSubCommands, TunnelUserSubCommands,
	},
	CommandContext,
};

use crate::{
	async_pipe::{get_socket_name, listen_socket_rw_stream, AsyncRWAccepter},
	auth::Auth,
	constants::{
		APPLICATION_NAME, CONTROL_PORT, IS_A_TTY, TUNNEL_CLI_LOCK_NAME, TUNNEL_SERVICE_LOCK_NAME,
	},
	log,
	state::LauncherPaths,
	tunnels::{
		code_server::CodeServerArgs,
		create_service_manager,
		dev_tunnels::{self, DevTunnels},
		legal, local_forwarding,
		paths::get_all_servers,
		protocol, serve_stream,
		shutdown_signal::ShutdownRequest,
		singleton_client::do_single_rpc_call,
		singleton_server::{
			make_singleton_server, start_singleton_server, BroadcastLogSink, SingletonServerArgs,
		},
		AuthRequired, Next, ServeStreamParams, ServiceContainer, ServiceManager,
	},
	util::{
		app_lock::AppMutex,
		errors::{wrap, AnyError, CodeError},
		prereqs::PreReqChecker,
	},
};
use crate::{
	singleton::{acquire_singleton, SingletonConnection},
	tunnels::{
		dev_tunnels::ActiveTunnel,
		singleton_client::{start_singleton_client, SingletonClientArgs},
		SleepInhibitor,
	},
};

impl From<AuthProvider> for crate::auth::AuthProvider {
	fn from(auth_provider: AuthProvider) -> Self {
		match auth_provider {
			AuthProvider::Github => crate::auth::AuthProvider::Github,
			AuthProvider::Microsoft => crate::auth::AuthProvider::Microsoft,
		}
	}
}

fn fulfill_existing_tunnel_args(
	d: ExistingTunnelArgs,
	name_arg: &Option<String>,
) -> Option<dev_tunnels::ExistingTunnel> {
	let tunnel_name = d.tunnel_name.or_else(|| name_arg.clone());

	match (d.tunnel_id, d.cluster, d.host_token) {
		(Some(tunnel_id), None, Some(host_token)) => {
			let i = tunnel_id.find('.')?;
			Some(dev_tunnels::ExistingTunnel {
				tunnel_id: tunnel_id[..i].to_string(),
				cluster: tunnel_id[i + 1..].to_string(),
				tunnel_name,
				host_token,
			})
		}

		(Some(tunnel_id), Some(cluster), Some(host_token)) => Some(dev_tunnels::ExistingTunnel {
			tunnel_id,
			tunnel_name,
			host_token,
			cluster,
		}),

		_ => None,
	}
}

struct TunnelServiceContainer {
	args: CliCore,
}

impl TunnelServiceContainer {
	fn new(args: CliCore) -> Self {
		Self { args }
	}
}

#[async_trait]
impl ServiceContainer for TunnelServiceContainer {
	async fn run_service(
		&mut self,
		log: log::Logger,
		launcher_paths: LauncherPaths,
	) -> Result<(), AnyError> {
		let csa = (&self.args).into();
		serve_with_csa(
			launcher_paths,
			log,
			TunnelServeArgs {
				random_name: true, // avoid prompting
				..Default::default()
			},
			csa,
			TUNNEL_SERVICE_LOCK_NAME,
		)
		.await?;
		Ok(())
	}
}

pub async fn command_shell(ctx: CommandContext, args: CommandShellArgs) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let mut params = ServeStreamParams {
		log: ctx.log,
		launcher_paths: ctx.paths,
		platform,
		requires_auth: args
			.require_token
			.map(AuthRequired::VSDAWithToken)
			.unwrap_or(AuthRequired::VSDA),
		exit_barrier: ShutdownRequest::create_rx([ShutdownRequest::CtrlC]),
		code_server_args: (&ctx.args).into(),
	};

	let mut listener: Box<dyn AsyncRWAccepter> = match (args.on_port, args.on_socket) {
		(_, true) => {
			let socket = get_socket_name();
			let listener = listen_socket_rw_stream(&socket)
				.await
				.map_err(|e| wrap(e, "error listening on socket"))?;

			params
				.log
				.result(format!("Listening on {}", socket.display()));

			Box::new(listener)
		}
		(true, _) => {
			let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
				.await
				.map_err(|e| wrap(e, "error listening on port"))?;

			params
				.log
				.result(format!("Listening on {}", listener.local_addr().unwrap()));

			Box::new(listener)
		}
		_ => {
			serve_stream(tokio::io::stdin(), tokio::io::stderr(), params).await;
			return Ok(0);
		}
	};

	let mut servers = FuturesUnordered::new();

	loop {
		tokio::select! {
			Some(_) = servers.next() => {},
			socket = listener.accept_rw() => {
				match socket {
					Ok((read, write)) => servers.push(serve_stream(read, write, params.clone())),
					Err(e) => {
						error!(params.log, &format!("Error accepting connection: {}", e));
						return Ok(1);
					}
				}
			},
			_ = params.exit_barrier.wait() => {
				// wait for all servers to finish up:
				while (servers.next().await).is_some() { }
				return Ok(0);
			}
		}
	}
}

pub async fn service(
	ctx: CommandContext,
	service_args: TunnelServiceSubCommands,
) -> Result<i32, AnyError> {
	let manager = create_service_manager(ctx.log.clone(), &ctx.paths);
	match service_args {
		TunnelServiceSubCommands::Install(args) => {
			let auth = Auth::new(&ctx.paths, ctx.log.clone());

			if let Some(name) = &args.name {
				// ensure the name matches, and tunnel exists
				dev_tunnels::DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths)
					.rename_tunnel(name)
					.await?;
			} else {
				// still ensure they're logged in, otherwise subsequent serving will fail
				auth.get_credential().await?;
			}

			// likewise for license consent
			legal::require_consent(&ctx.paths, args.accept_server_license_terms)?;

			let current_exe =
				std::env::current_exe().map_err(|e| wrap(e, "could not get current exe"))?;

			manager
				.register(
					current_exe,
					&[
						"--verbose",
						"--cli-data-dir",
						ctx.paths.root().as_os_str().to_string_lossy().as_ref(),
						"tunnel",
						"service",
						"internal-run",
					],
				)
				.await?;
			ctx.log.result(format!("Service successfully installed! You can use `{} tunnel service log` to monitor it, and `{} tunnel service uninstall` to remove it.", APPLICATION_NAME, APPLICATION_NAME));
		}
		TunnelServiceSubCommands::Uninstall => {
			manager.unregister().await?;
		}
		TunnelServiceSubCommands::Log => {
			manager.show_logs().await?;
		}
		TunnelServiceSubCommands::InternalRun => {
			manager
				.run(ctx.paths.clone(), TunnelServiceContainer::new(ctx.args))
				.await?;
		}
	}

	Ok(0)
}

pub async fn user(ctx: CommandContext, user_args: TunnelUserSubCommands) -> Result<i32, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	match user_args {
		TunnelUserSubCommands::Login(login_args) => {
			auth.login(
				login_args.provider.map(|p| p.into()),
				login_args.access_token.to_owned(),
			)
			.await?;
		}
		TunnelUserSubCommands::Logout => {
			auth.clear_credentials()?;
		}
		TunnelUserSubCommands::Show => {
			if let Ok(Some(_)) = auth.get_current_credential() {
				ctx.log.result("logged in");
			} else {
				ctx.log.result("not logged in");
				return Ok(1);
			}
		}
	}

	Ok(0)
}

/// Remove the tunnel used by this tunnel, if any.
pub async fn rename(ctx: CommandContext, rename_args: TunnelRenameArgs) -> Result<i32, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = dev_tunnels::DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);
	dt.rename_tunnel(&rename_args.name).await?;
	ctx.log.result(format!(
		"Successfully renamed this tunnel to {}",
		&rename_args.name
	));

	Ok(0)
}

/// Remove the tunnel used by this tunnel, if any.
pub async fn unregister(ctx: CommandContext) -> Result<i32, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = dev_tunnels::DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);
	dt.remove_tunnel().await?;
	Ok(0)
}

pub async fn restart(ctx: CommandContext) -> Result<i32, AnyError> {
	do_single_rpc_call::<_, ()>(
		&ctx.paths.tunnel_lockfile(),
		ctx.log,
		protocol::singleton::METHOD_RESTART,
		protocol::EmptyObject {},
	)
	.await
	.map(|_| 0)
	.map_err(|e| e.into())
}

pub async fn kill(ctx: CommandContext) -> Result<i32, AnyError> {
	do_single_rpc_call::<_, ()>(
		&ctx.paths.tunnel_lockfile(),
		ctx.log,
		protocol::singleton::METHOD_SHUTDOWN,
		protocol::EmptyObject {},
	)
	.await
	.map(|_| 0)
	.map_err(|e| e.into())
}

#[derive(Serialize)]
pub struct StatusOutput {
	pub tunnel: Option<protocol::singleton::StatusWithTunnelName>,
	pub service_installed: bool,
}

pub async fn status(ctx: CommandContext) -> Result<i32, AnyError> {
	let tunnel = do_single_rpc_call::<_, protocol::singleton::StatusWithTunnelName>(
		&ctx.paths.tunnel_lockfile(),
		ctx.log.clone(),
		protocol::singleton::METHOD_STATUS,
		protocol::EmptyObject {},
	)
	.await;

	let service_installed = create_service_manager(ctx.log.clone(), &ctx.paths)
		.is_installed()
		.await
		.unwrap_or(false);

	ctx.log.result(
		serde_json::to_string(&StatusOutput {
			service_installed,
			tunnel: match tunnel {
				Ok(s) => Some(s),
				Err(CodeError::NoRunningTunnel) => None,
				Err(e) => return Err(e.into()),
			},
		})
		.unwrap(),
	);

	Ok(0)
}

/// Removes unused servers.
pub async fn prune(ctx: CommandContext) -> Result<i32, AnyError> {
	get_all_servers(&ctx.paths)
		.into_iter()
		.map(|s| s.server_paths(&ctx.paths))
		.filter(|s| s.get_running_pid().is_none())
		.try_for_each(|s| {
			ctx.log
				.result(format!("Deleted {}", s.server_dir.display()));
			s.delete()
		})
		.map_err(AnyError::from)?;

	ctx.log.result("Successfully removed all unused servers");

	Ok(0)
}

/// Starts the gateway server.
pub async fn serve(ctx: CommandContext, gateway_args: TunnelServeArgs) -> Result<i32, AnyError> {
	let CommandContext {
		log, paths, args, ..
	} = ctx;

	let no_sleep = match gateway_args.no_sleep.then(SleepInhibitor::new) {
		Some(i) => match i.await {
			Ok(i) => Some(i),
			Err(e) => {
				warning!(log, "Could not inhibit sleep: {}", e);
				None
			}
		},
		None => None,
	};

	legal::require_consent(&paths, gateway_args.accept_server_license_terms)?;

	let csa = (&args).into();
	let result = serve_with_csa(paths, log, gateway_args, csa, TUNNEL_CLI_LOCK_NAME).await;
	drop(no_sleep);

	result
}

/// Internal command used by port forwarding. It reads requests for forwarded ports
/// on lines from stdin, as JSON. It uses singleton logic as well (though on
/// a different tunnel than the main one used for the control server) so that
/// all forward requests on a single machine go through a single hosted tunnel
/// process. Without singleton logic, requests could get routed to processes
/// that aren't forwarding a given port and then fail.
pub async fn forward(
	ctx: CommandContext,
	mut forward_args: TunnelForwardArgs,
) -> Result<i32, AnyError> {
	// Spooky: check IS_A_TTY before starting the stdin reader, since IS_A_TTY will
	// access stdin but a lock will later be held on stdin by the line-reader.
	if *IS_A_TTY {
		trace!(ctx.log, "port forwarding is an internal preview feature");
	}

	// #region stdin reading logic:
	let (own_ports_tx, own_ports_rx) = watch::channel(vec![]);
	let ports_process_log = ctx.log.clone();
	tokio::spawn(async move {
		let mut lines = BufReader::new(tokio::io::stdin()).lines();
		while let Ok(Some(line)) = lines.next_line().await {
			match serde_json::from_str(&line) {
				Ok(p) => {
					let _ = own_ports_tx.send(p);
				}
				Err(e) => warning!(ports_process_log, "error parsing ports: {}", e),
			}
		}
	});

	// #region singleton acquisition
	let shutdown = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);
	let server = loop {
		if shutdown.is_open() {
			return Ok(0);
		}

		match acquire_singleton(&ctx.paths.forwarding_lockfile()).await {
			Ok(SingletonConnection::Client(stream)) => {
				debug!(ctx.log, "starting as client to singleton");
				let r = local_forwarding::client(local_forwarding::SingletonClientArgs {
					log: ctx.log.clone(),
					shutdown: shutdown.clone(),
					stream,
					port_requests: own_ports_rx.clone(),
				})
				.await;
				if let Err(e) = r {
					warning!(ctx.log, "error contacting forwarding singleton: {}", e);
				}
			}
			Ok(SingletonConnection::Singleton(server)) => break server,
			Err(e) => {
				warning!(ctx.log, "error access singleton, retrying: {}", e);
				tokio::time::sleep(Duration::from_secs(2)).await
			}
		}
	};

	// #region singleton handler
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	if let (Some(p), Some(at)) = (
		forward_args.login.provider.take(),
		forward_args.login.access_token.take(),
	) {
		auth.login(Some(p.into()), Some(at)).await?;
	}

	let mut tunnels = DevTunnels::new_port_forwarding(&ctx.log, auth, &ctx.paths);
	let tunnel = tunnels
		.start_new_launcher_tunnel(None, true, &forward_args.ports)
		.await?;

	local_forwarding::server(ctx.log, tunnel, server, own_ports_rx, shutdown).await?;

	Ok(0)
}

fn get_connection_token(tunnel: &ActiveTunnel) -> String {
	let mut hash = Sha256::new();
	hash.update(tunnel.id.as_bytes());
	let result = hash.finalize();
	b64::URL_SAFE_NO_PAD.encode(result)
}

async fn serve_with_csa(
	paths: LauncherPaths,
	mut log: log::Logger,
	gateway_args: TunnelServeArgs,
	mut csa: CodeServerArgs,
	app_mutex_name: Option<&'static str>,
) -> Result<i32, AnyError> {
	let log_broadcast = BroadcastLogSink::new();
	log = log.tee(log_broadcast.clone());
	log::install_global_logger(log.clone()); // re-install so that library logs are captured

	debug!(
		log,
		"Starting tunnel with `{} {}`",
		APPLICATION_NAME,
		std::env::args().collect::<Vec<_>>().join(" ")
	);

	// Intentionally read before starting the server. If the server updated and
	// respawn is requested, the old binary will get renamed, and then
	// current_exe will point to the wrong path.
	let current_exe = std::env::current_exe().unwrap();

	let mut vec = vec![
		ShutdownRequest::CtrlC,
		ShutdownRequest::ExeUninstalled(current_exe.to_owned()),
	];
	if let Some(p) = gateway_args
		.parent_process_id
		.and_then(|p| Pid::from_str(&p).ok())
	{
		vec.push(ShutdownRequest::ParentProcessKilled(p));
	}
	let shutdown = ShutdownRequest::create_rx(vec);

	let server = loop {
		if shutdown.is_open() {
			return Ok(0);
		}

		match acquire_singleton(&paths.tunnel_lockfile()).await {
			Ok(SingletonConnection::Client(stream)) => {
				debug!(log, "starting as client to singleton");
				let should_exit = start_singleton_client(SingletonClientArgs {
					log: log.clone(),
					shutdown: shutdown.clone(),
					stream,
				})
				.await;
				if should_exit {
					return Ok(0);
				}
			}
			Ok(SingletonConnection::Singleton(server)) => break server,
			Err(e) => {
				warning!(log, "error access singleton, retrying: {}", e);
				tokio::time::sleep(Duration::from_secs(2)).await
			}
		}
	};

	debug!(log, "starting as new singleton");

	let mut server =
		make_singleton_server(log_broadcast.clone(), log.clone(), server, shutdown.clone());
	let platform = spanf!(log, log.span("prereq"), PreReqChecker::new().verify())?;
	let _lock = app_mutex_name.map(AppMutex::new);

	let auth = Auth::new(&paths, log.clone());
	let mut dt = dev_tunnels::DevTunnels::new_remote_tunnel(&log, auth, &paths);
	loop {
		let tunnel = if let Some(t) =
			fulfill_existing_tunnel_args(gateway_args.tunnel.clone(), &gateway_args.name)
		{
			dt.start_existing_tunnel(t).await
		} else {
			dt.start_new_launcher_tunnel(
				gateway_args.name.as_deref(),
				gateway_args.random_name,
				&[CONTROL_PORT],
			)
			.await
		}?;

		csa.connection_token = Some(get_connection_token(&tunnel));

		let mut r = start_singleton_server(SingletonServerArgs {
			log: log.clone(),
			tunnel,
			paths: &paths,
			code_server_args: &csa,
			platform,
			log_broadcast: &log_broadcast,
			shutdown: shutdown.clone(),
			server: &mut server,
		})
		.await?;
		r.tunnel.close().await.ok();

		match r.next {
			Next::Respawn => {
				warning!(log, "respawn requested, starting new server");
				// reuse current args, but specify no-forward since tunnels will
				// already be running in this process, and we cannot do a login
				let args = std::env::args().skip(1).collect::<Vec<String>>();
				let exit = std::process::Command::new(current_exe)
					.args(args)
					.spawn()
					.map_err(|e| wrap(e, "error respawning after update"))?
					.wait()
					.map_err(|e| wrap(e, "error waiting for child"))?;

				return Ok(exit.code().unwrap_or(1));
			}
			Next::Exit => {
				debug!(log, "Tunnel shut down");
				return Ok(0);
			}
			Next::Restart => continue,
		}
	}
}
