/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use async_trait::async_trait;
use std::str::FromStr;
use std::fmt;
use sysinfo::{Pid, SystemExt};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

use super::{
	args::{
		AuthProvider, CliCore, ExistingTunnelArgs, TunnelRenameArgs, TunnelServeArgs,
		TunnelServiceSubCommands, TunnelUserSubCommands,
	},
	CommandContext,
};

use crate::{
	auth::Auth,
	log::{self, Logger},
	state::LauncherPaths,
	tunnels::{
		code_server::CodeServerArgs, create_service_manager, dev_tunnels, legal,
		paths::get_all_servers, ServiceContainer, ServiceManager,
	},
	util::{
		errors::{wrap, AnyError},
		prereqs::PreReqChecker,
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

impl From<ExistingTunnelArgs> for Option<dev_tunnels::ExistingTunnel> {
	fn from(d: ExistingTunnelArgs) -> Option<dev_tunnels::ExistingTunnel> {
		if let (Some(tunnel_id), Some(tunnel_name), Some(cluster), Some(host_token)) =
			(d.tunnel_id, d.tunnel_name, d.cluster, d.host_token)
		{
			Some(dev_tunnels::ExistingTunnel {
				tunnel_id,
				tunnel_name,
				host_token,
				cluster,
			})
		} else {
			None
		}
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
		shutdown_rx: mpsc::Receiver<ShutdownSignal>,
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
			Some(shutdown_rx),
		)
		.await?;
		Ok(())
	}
}
/// Describes the signal to manully stop the server
pub enum ShutdownSignal {
	CtrlC,
	ParentProcessKilled,
	ServiceStopped,
}

impl fmt::Display for ShutdownSignal {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			ShutdownSignal::CtrlC => write!(f, "Ctrl-C received"),
			ShutdownSignal::ParentProcessKilled => write!(f, "Parent process no longer exists"),
			ShutdownSignal::ServiceStopped => write!(f, "Service stopped"),
		}
	}
}

pub async fn service(
	ctx: CommandContext,
	service_args: TunnelServiceSubCommands,
) -> Result<i32, AnyError> {
	let manager = create_service_manager(ctx.log.clone());
	match service_args {
		TunnelServiceSubCommands::Install => {
			// ensure logged in, otherwise subsequent serving will fail
			Auth::new(&ctx.paths, ctx.log.clone())
				.get_credential()
				.await?;

			// likewise for license consent
			legal::require_consent(&ctx.paths, false)?;

			let current_exe =
				std::env::current_exe().map_err(|e| wrap(e, "could not get current exe"))?;

			manager.register(
				current_exe,
				&[
					"--cli-data-dir",
					ctx.paths.root().as_os_str().to_string_lossy().as_ref(),
					"tunnel",
					"service",
					"internal-run",
				],
			)?;
			ctx.log.result("Service successfully installed! You can use `code tunnel service log` to monitor it, and `code tunnel service uninstall` to remove it.");
		}
		TunnelServiceSubCommands::Uninstall => {
			manager.unregister()?;
		}
		TunnelServiceSubCommands::InternalRun => {
			manager.run(ctx.paths.clone(), TunnelServiceContainer::new(ctx.args))?;
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

/// Remove the tunnel used by this gateway, if any.
pub async fn rename(ctx: CommandContext, rename_args: TunnelRenameArgs) -> Result<i32, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = dev_tunnels::DevTunnels::new(&ctx.log, auth, &ctx.paths);
	dt.rename_tunnel(&rename_args.name).await?;
	ctx.log.result(&format!(
		"Successfully renamed this gateway to {}",
		&rename_args.name
	));

	Ok(0)
}

/// Remove the tunnel used by this gateway, if any.
pub async fn unregister(ctx: CommandContext) -> Result<i32, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = dev_tunnels::DevTunnels::new(&ctx.log, auth, &ctx.paths);
	dt.remove_tunnel().await?;
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
				.result(&format!("Deleted {}", s.server_dir.display()));
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

	legal::require_consent(&paths, gateway_args.accept_server_license_terms)?;

	let csa = (&args).into();
	serve_with_csa(paths, log, gateway_args, csa, None).await
}

async fn serve_with_csa(
	paths: LauncherPaths,
	log: Logger,
	gateway_args: TunnelServeArgs,
	csa: CodeServerArgs,
	shutdown_rx: Option<mpsc::Receiver<ShutdownSignal>>,
) -> Result<i32, AnyError> {
	// Intentionally read before starting the server. If the server updated and
	// respawn is requested, the old binary will get renamed, and then
	// current_exe will point to the wrong path.
	let current_exe = std::env::current_exe().unwrap();
	let platform = spanf!(log, log.span("prereq"), PreReqChecker::new().verify())?;

	let auth = Auth::new(&paths, log.clone());
	let mut dt = dev_tunnels::DevTunnels::new(&log, auth, &paths);
	let tunnel = if let Some(d) = gateway_args.tunnel.clone().into() {
		dt.start_existing_tunnel(d).await
	} else {
		dt.start_new_launcher_tunnel(gateway_args.name, gateway_args.random_name)
			.await
	}?;

	let shutdown_tx = if let Some(tx) = shutdown_rx {
		tx
	} else {
		let (tx, rx) = mpsc::channel::<ShutdownSignal>(2);
		if let Some(process_id) = gateway_args.parent_process_id {
			match Pid::from_str(&process_id) {
				Ok(pid) => {
					let tx = tx.clone();
					info!(log, "checking for parent process {}", process_id);
					tokio::spawn(async move {
						let mut s = sysinfo::System::new();
						while s.refresh_process(pid) {
							sleep(Duration::from_millis(2000)).await;
						}
						tx.send(ShutdownSignal::ParentProcessKilled).await.ok();
					});
				}
				Err(_) => {
					info!(log, "invalid parent process id: {}", process_id);
				}
			}
		}
		tokio::spawn(async move {
			tokio::signal::ctrl_c().await.ok();
			tx.send(ShutdownSignal::CtrlC).await.ok();
		});
		rx
	};

	let mut r = crate::tunnels::serve(&log, tunnel, &paths, &csa, platform, shutdown_tx).await?;
	r.tunnel.close().await.ok();

	if r.respawn {
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

	Ok(0)
}
