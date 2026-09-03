/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};

use crate::auth::Auth;
use crate::constants::{self, AGENT_HOST_PORT};
use crate::log;
use crate::options::TelemetryLevel;
use crate::state::LauncherPaths;
use crate::tunnels::agent_host::{
	classify_agent_host, serve_agent_host_tunnel_connection, AgentHostConfig, AgentHostManager,
	AgentHostReuseDecision, AgentHostSidecar, LoopbackAuth,
};
use crate::tunnels::agent_host_registry::{self, AgentHostEndpointIdentity, AgentHostServerType};
use crate::tunnels::code_server::CodeServerArgs;
use crate::tunnels::dev_tunnels::DevTunnels;
use crate::tunnels::idle_timeout::{self, TokioIdleSleeper};
use crate::tunnels::ready_active_agent_host;
use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::tunnels::user_data_path::resolve_user_data_path;
use crate::update_service::Platform;
use crate::util::command::{kill_tree, DetachFromParent};
use crate::util::errors::{wrap, AnyError, CodeError};
use crate::util::http::ReqwestSimpleHttp;
use crate::util::prereqs::PreReqChecker;

use super::args::AgentHostArgs;
use super::output;
use super::tunnels::fulfill_existing_tunnel_args;
use super::CommandContext;

/// Internal env var that flips `code agent host` into supervisor mode:
/// the body that actually binds the TCP listener, publishes the
/// supervisor's registry entry, owns the proxy sidecar, and manages the AH
/// backend's lifecycle. Unless `--foreground` is passed, the foreground
/// `code agent host` invocation re-execs itself detached with this
/// variable set so the supervisor outlives the user's terminal.
const SUPERVISOR_ENV: &str = "VSCODE_AGENT_HOST_SUPERVISOR";
/// Single-line sentinel the supervisor prints once the listener is bound,
/// its registry entry is published, and the banner has been flushed. The
/// foreground process watches for this on the detached supervisor's stdout
/// and then exits. Not printed when the supervisor runs with
/// `--foreground`, since there is no parent waiting on it.
const SUPERVISOR_READY_LINE: &str = "__VSCODE_AGENT_HOST_READY__";
/// Cap on how long the foreground waits for the supervisor to become
/// ready before giving up and surfacing a failure.
const SUPERVISOR_READY_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Runs the `code agent host` command. Acts in one of two modes:
///
/// * **Foreground** (the default): consults the shared local agent-host
///   endpoint registry and either prints info about the live supervisor
///   (`Reuse`), or starts a new supervisor (`SpawnFresh`) — daemonized by
///   default, or run inline in this process when `--foreground` is set.
///
/// * **Supervisor** (when [`SUPERVISOR_ENV`] is set): binds the public TCP
///   listener, publishes a registry entry recording this process's PID +
///   port, runs the proxy accept loop, and manages the underlying VS Code
///   server as a regular child process so the supervisor can kill+respawn
///   it on update.
pub async fn agent_host(ctx: CommandContext, args: AgentHostArgs) -> Result<i32, AnyError> {
	if std::env::var_os(SUPERVISOR_ENV).is_some() {
		return run_supervisor(ctx, args).await;
	}
	run_foreground(ctx, args).await
}

/// Pure decision of what `run_foreground` should do next, derived only
/// from `args` and an already-computed [`AgentHostReuseDecision`] — no
/// I/O, process killing, or spawning happens here. Kept separate from
/// `run_foreground` so the flag-priority rules (in particular, that
/// `--new-instance` always wins and never triggers the `--replace` kill
/// path) can be unit tested deterministically without spawning any real
/// process or touching a real registry.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ForegroundAction {
	/// Start a brand new supervisor unconditionally: either nothing
	/// reusable is registered, or `--new-instance` was passed. Never
	/// touches any existing registry entry.
	SpawnFresh,
	/// `--replace` was passed and a reusable supervisor exists: kill it
	/// and remove its exact registry entry first, then start a new one.
	ReplaceThenSpawnFresh { pid: u32, instance_id: String },
	/// The requested configuration conflicts with the reusable
	/// supervisor's; print `message` and exit with status 2.
	ConflictError(String),
	/// Reuse the existing supervisor; print an informational banner and
	/// exit with status 0 without spawning anything.
	ReuseBanner {
		pid: u32,
		host: Option<String>,
		port: u16,
		token: Option<String>,
		tunnel_name: Option<String>,
	},
}

fn decide_foreground_action(
	args: &AgentHostArgs,
	decision: AgentHostReuseDecision,
) -> ForegroundAction {
	// `--new-instance` always wins: it bypasses reuse (and therefore
	// `--replace`'s kill path too) so an existing standalone/editor
	// entry is guaranteed to survive untouched, and a brand new
	// supervisor is always started.
	if args.new_instance {
		return ForegroundAction::SpawnFresh;
	}

	let AgentHostReuseDecision::Reuse {
		pid,
		host,
		port,
		token,
		tunnel_name,
		instance_id,
	} = decision
	else {
		return ForegroundAction::SpawnFresh;
	};

	// User asked to replace explicitly: kill + spawn fresh, regardless
	// of whether the running config matches.
	if args.replace {
		return ForegroundAction::ReplaceThenSpawnFresh { pid, instance_id };
	}

	// No `--replace`: check whether the requested network config
	// matches the running supervisor. If it differs, error out with a
	// clear message instead of silently sharing a differently-bound
	// supervisor.
	if let Some(conflict) = detect_config_conflict(
		args,
		host.as_deref(),
		port,
		token.as_deref(),
		tunnel_name.as_deref(),
	) {
		return ForegroundAction::ConflictError(format!(
			"Agent host already running on {host_str}:{port} (PID {pid}), but {conflict}.\n\
			 Use `{application_name} agent kill` to stop it, or pass `--replace` to take over.",
			application_name = constants::APPLICATION_NAME,
			host_str = host.as_deref().unwrap_or("127.0.0.1"),
		));
	}

	ForegroundAction::ReuseBanner {
		pid,
		host,
		port,
		token,
		tunnel_name,
	}
}

/// Foreground entry point: decides whether to reuse an existing supervisor
/// or start a fresh one, either detached (the default) or inline in this
/// process when `--foreground` is set.
async fn run_foreground(ctx: CommandContext, args: AgentHostArgs) -> Result<i32, AnyError> {
	let started = Instant::now();
	let user_data_path = resolve_user_data_path(args.user_data_dir.as_deref());

	// Skip consulting the registry entirely when `--new-instance` is set:
	// its outcome can't change the decision (see `decide_foreground_action`)
	// and we don't want an unrelated registry read to slow down or race
	// with the fresh spawn below.
	let decision = if args.new_instance {
		AgentHostReuseDecision::SpawnFresh
	} else {
		classify_agent_host(&ctx.log, &user_data_path).await
	};

	// Bind the action before matching so the `&args` borrow ends here and
	// the arms below are free to move `args` into `start_supervisor`.
	let action = decide_foreground_action(&args, decision);
	match action {
		ForegroundAction::SpawnFresh => start_supervisor(ctx, args).await,
		ForegroundAction::ReplaceThenSpawnFresh { pid, instance_id } => {
			info!(
				ctx.log,
				"--replace set; stopping agent host (PID {}) before starting new one", pid
			);
			replace_existing(&ctx.log, &user_data_path, pid, instance_id).await?;
			start_supervisor(ctx, args).await
		}
		ForegroundAction::ConflictError(message) => {
			ctx.log.result(message);
			Ok(2)
		}
		ForegroundAction::ReuseBanner {
			pid,
			host,
			port,
			token,
			tunnel_name,
		} => {
			print_reuse_banner(
				&ctx.log,
				started,
				pid,
				host.as_deref(),
				port,
				token.as_deref(),
				tunnel_name.as_deref(),
			);
			Ok(0)
		}
	}
}

/// Starts a brand new supervisor for this invocation: inline in this
/// process when `--foreground` is set (so its logs stay attached to the
/// terminal and Ctrl-C stops it), otherwise detached in the background.
async fn start_supervisor(ctx: CommandContext, args: AgentHostArgs) -> Result<i32, AnyError> {
	if args.foreground {
		run_supervisor(ctx, args).await
	} else {
		daemonize_supervisor().await
	}
}

/// Body of the supervisor process. Starts an [`AgentHostManager`], binds
/// an [`AgentHostSidecar`] on the user's chosen `--host`/`--port`,
/// optionally exposes it over a dev tunnel, prints the readiness banner /
/// sentinel, then services connections until killed.
async fn run_supervisor(mut ctx: CommandContext, mut args: AgentHostArgs) -> Result<i32, AnyError> {
	let started = Instant::now();
	let user_data_path = resolve_user_data_path(args.user_data_dir.as_deref());
	let instance_id = uuid::Uuid::new_v4().to_string();

	// Attach a file log sink before anything else, so download progress,
	// AH child crashes, update-loop errors, and post-handoff diagnostics
	// are captured even after we redirect stdio to null. The file always
	// records at Trace level — the foreground stdio sink keeps its
	// caller-supplied level so the parent doesn't see noise on its
	// terminal.
	let log_file = ctx.paths.agent_host_log_file();
	if let Some(parent) = log_file.parent() {
		let _ = fs::create_dir_all(parent);
	}
	match log::FileLogSink::new(log::Level::Trace, &log_file) {
		Ok(sink) => {
			ctx.log = ctx.log.tee(sink);
			info!(
				ctx.log,
				"Agent host supervisor logging to {}",
				log_file.display()
			);
		}
		Err(e) => {
			warning!(
				ctx.log,
				"Failed to open agent host supervisor log file {}: {}",
				log_file.display(),
				e
			);
		}
	}

	let platform: Platform = PreReqChecker::new().verify().await?;

	if !args.without_connection_token {
		if let Some(p) = args.connection_token_file.as_deref() {
			let token = fs::read_to_string(PathBuf::from(p))
				.map_err(CodeError::CouldNotReadConnectionTokenFile)?;
			args.connection_token = Some(token.trim().to_string());
		} else {
			let token_path = ctx.paths.root().join("agent-host-token");
			let token = mint_connection_token(&token_path, args.connection_token.clone())
				.map_err(CodeError::CouldNotCreateConnectionTokenFile)?;
			args.connection_token = Some(token);
			args.connection_token_file = Some(token_path.to_string_lossy().to_string());
		}
	}

	let manager = AgentHostManager::new(
		ctx.log.clone(),
		platform,
		ctx.paths.server_cache.clone(),
		Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
		AgentHostConfig {
			server_data_dir: args.server_data_dir.clone(),
			telemetry_level: if ctx.args.global_options.disable_telemetry {
				Some(TelemetryLevel::Off)
			} else {
				ctx.args.global_options.telemetry_level
			},
			// The AH backend runs on an internal-only unix socket / named
			// pipe between this supervisor and its child, so we
			// deliberately disable the backend's token check; this
			// supervisor's loopback accept loop enforces the user-facing
			// token at the proxy edge.
			without_connection_token: true,
			connection_token: None,
			connection_token_file: None,
		},
	);

	// Eagerly resolve the latest version so the first connection is fast,
	// and kick off the background update loop. Skip when using a dev
	// override since updates don't apply.
	if option_env!("VSCODE_CLI_OVERRIDE_SERVER_PATH").is_none() {
		match manager.get_latest_release().await {
			Ok(release) => {
				if let Err(e) = manager.ensure_downloaded(&release).await {
					warning!(ctx.log, "Error downloading latest server version: {}", e);
				}
			}
			Err(e) => warning!(ctx.log, "Error resolving initial server version: {}", e),
		}

		let manager_for_updates = manager.clone();
		tokio::spawn(async move {
			manager_for_updates.run_update_loop().await;
		});
	}

	let mut pending_tunnel = None;
	let mut tunnel_name: Option<String> = None;
	if args.tunnel {
		let mut auth = Auth::new(&ctx.paths, ctx.log.clone());
		auth.set_provider(crate::auth::AuthProvider::Github);
		let mut dt = DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);

		let mut tunnel = if let Some(existing) =
			fulfill_existing_tunnel_args(args.existing_tunnel.clone(), &args.name)
		{
			dt.start_existing_tunnel(existing).await
		} else {
			dt.start_new_launcher_tunnel(args.name.as_deref(), args.random_name, &[])
				.await
		}?;

		tunnel_name = Some(tunnel.name.clone());
		let tunnel_port = tunnel.add_port_direct(AGENT_HOST_PORT).await?;
		pending_tunnel = Some((tunnel, tunnel_port));
	}

	let listen_addr = resolve_listen_addr(&args)?;
	let loopback_auth = match args.connection_token.as_deref() {
		Some(t) => LoopbackAuth::Token(t.to_string()),
		None => LoopbackAuth::Disabled,
	};

	// `--idle-timeout` is opt-in: only build the activity-tracking channel
	// when requested, so a manually started local host (the default) never
	// pays for/depends on this bookkeeping and never self-terminates.
	let idle_timeout_duration = args.idle_timeout.map(Duration::from_secs);
	let (activity, activity_rx) = match idle_timeout_duration {
		Some(_) => {
			let (tracker, rx) = idle_timeout::new_activity_channel();
			(Some(tracker), Some(rx))
		}
		None => (None, None),
	};

	let sidecar = AgentHostSidecar::bind_tcp(
		ctx.log.clone(),
		manager.clone(),
		listen_addr,
		args.host.clone(),
		loopback_auth,
		tunnel_name.clone(),
		user_data_path.clone(),
		instance_id.clone(),
		activity,
	)
	.await?;
	let bound_port = sidecar.bound_addr().port();

	let mut tunnel_handle: Option<crate::tunnels::dev_tunnels::ActiveTunnel> = None;
	if let Some((tunnel, mut tunnel_port)) = pending_tunnel {
		// Route each tunneled connection through the same protocol-v6
		// selection-gateway request router `code tunnel`'s control_server
		// uses (`serve_agent_host_tunnel_connection`), instead of the
		// legacy direct proxy (`AgentHostSidecar::serve_tunnel_connection`)
		// this used to call unconditionally. That legacy method never
		// looked at the request path, so a renderer's `/agent-host/select`
		// WebSocket upgrade -- sent because this tunnel is tagged
		// `protocolv6`, see `add_port_direct` above -- fell straight
		// through to the AH backend instead of the selection gateway, and
		// no inventory was ever sent (the reported timeout).
		//
		// The root/default (legacy v5) route must still resolve to *this*
		// running sidecar -- never `ensure_supervisor_running`, which
		// could spawn or reuse an unrelated supervisor -- so we build an
		// already-resolved `SharedActiveAgentHost` from the sidecar's own
		// published identity.
		//
		// Each relayed socket carries its own `--idle-timeout` activity
		// guard, attached to the transport so it survives the WebSocket
		// upgrade (see `idle_timeout::GuardedStream`). The inner dial the
		// gateway makes back into our own listener is not enough on its
		// own: a client still waiting to send its selection, or one whose
		// selection resolves to a *different* endpoint (another live
		// registry entry, or a freshly spawned dedicated host), never
		// reaches our accept loop at all, so without this guard an
		// actively proxied tunnel client could not stop us timing out from
		// under it.
		let active_agent_host = ready_active_agent_host(sidecar.active_agent_host());
		let launcher_paths = ctx.paths.clone();
		let gateway_user_data_path = user_data_path.clone();
		let tunnel_log = ctx.log.clone();
		info!(
			ctx.log,
			"Routing dev-tunnel-hosted agent-host port through the protocol-v6 selection gateway"
		);
		let tunnel_activity = sidecar.activity_tracker();
		tokio::spawn(async move {
			while let Some(socket) = tunnel_port.recv().await {
				let log = tunnel_log.clone();
				let active_agent_host = active_agent_host.clone();
				let launcher_paths = launcher_paths.clone();
				let user_data_path = gateway_user_data_path.clone();
				let rw = idle_timeout::GuardedStream::new(
					socket.into_rw(),
					tunnel_activity.as_ref().map(|a| a.client_connected()),
				);
				tokio::spawn(async move {
					serve_agent_host_tunnel_connection(
						log,
						rw,
						active_agent_host,
						launcher_paths,
						user_data_path,
						false,
					)
					.await;
				});
			}
		});
		tunnel_handle = Some(tunnel);
	}

	let product = constants::QUALITYLESS_PRODUCT_NAME;
	let token_suffix = args
		.connection_token
		.as_deref()
		.map(|t| format!("?tkn={t}"))
		.unwrap_or_default();

	output::print_banner_header(&format!("{product} Agent Host"), started.elapsed());
	if let (Some(base), Some(name)) = (constants::EDITOR_WEB_URL, &tunnel_name) {
		output::print_banner_line("Tunnel", &format!("{base}/agents/tunnel/{name}"));
	}
	// Resolve the user's `--host` choice into an `IpAddr` so the banner can
	// either suggest exposing the agent host or enumerate the bound
	// interfaces. Defaults to loopback when `--host` was omitted.
	let banner_listen_ip = args
		.host
		.as_deref()
		.and_then(|h| h.parse::<std::net::IpAddr>().ok())
		.unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
	output::print_network_lines(bound_port, banner_listen_ip, &token_suffix);
	print_manage_banner_line();
	output::print_banner_footer();
	let _ = std::io::stdout().flush();

	if !args.foreground {
		// Signal readiness to the foreground parent and then sever the
		// inherited stdio so subsequent writes don't `BrokenPipe` once
		// the parent exits. When running with `--foreground` there is no
		// parent waiting on us and the user wants to keep seeing logs,
		// so both are skipped.
		println!("{SUPERVISOR_READY_LINE}");
		let _ = std::io::stdout().flush();
		let _ = std::io::stderr().flush();
		if let Err(e) = redirect_stdio_to_null() {
			warning!(ctx.log, "Failed to redirect stdio after detach: {}", e);
		}
	}

	let shutdown_rx = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);
	match (idle_timeout_duration, activity_rx) {
		(Some(duration), Some(rx)) => {
			tokio::select! {
				result = sidecar.serve(shutdown_rx) => {
					result?;
				}
				_ = idle_timeout::wait_for_idle_timeout(duration, rx, &TokioIdleSleeper) => {
					info!(
						ctx.log,
						"Agent host supervisor idle for {}s with no connected clients; shutting down",
						duration.as_secs()
					);
				}
			}
		}
		_ => {
			sidecar.serve(shutdown_rx).await?;
		}
	}
	sidecar.shutdown().await;

	if let Some(mut tunnel) = tunnel_handle.take() {
		tunnel.close().await.ok();
	}

	Ok(0)
}

/// Resolve the user's `--host`/`--port` choice into a single
/// [`SocketAddr`]. Defaults to loopback when `--host` is unset.
fn resolve_listen_addr(args: &AgentHostArgs) -> Result<SocketAddr, AnyError> {
	let host = args.host.as_deref().unwrap_or("127.0.0.1");
	let ip: std::net::IpAddr = match host.parse() {
		Ok(ip) => ip,
		Err(_) => match (host, 0).to_socket_addrs() {
			Ok(mut iter) => match iter.next() {
				Some(addr) => addr.ip(),
				None => {
					return Err(CodeError::CouldNotListenOnInterface(std::io::Error::new(
						std::io::ErrorKind::InvalidInput,
						format!("could not resolve --host '{host}'"),
					))
					.into())
				}
			},
			Err(e) => return Err(wrap(e, format!("could not resolve --host '{host}'")).into()),
		},
	};
	Ok(SocketAddr::new(ip, args.port))
}

fn print_reuse_banner(
	log: &log::Logger,
	started: Instant,
	pid: u32,
	host: Option<&str>,
	port: u16,
	token: Option<&str>,
	tunnel_name: Option<&str>,
) {
	let product = constants::QUALITYLESS_PRODUCT_NAME;
	let token_suffix = token.map(|t| format!("?tkn={t}")).unwrap_or_default();
	output::print_banner_header(&format!("{product} Agent Host"), started.elapsed());
	if let (Some(base), Some(name)) = (constants::EDITOR_WEB_URL, tunnel_name) {
		output::print_banner_line("Tunnel", &format!("{base}/agents/tunnel/{name}"));
	}
	// Surface the host the supervisor was actually bound to (falling back
	// to loopback if unknown). This lets the network hint correctly say
	// "use --host to expose" only when the supervisor really is
	// loopback-only.
	let banner_listen_ip = host
		.and_then(|h| h.parse::<std::net::IpAddr>().ok())
		.unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
	output::print_network_lines(port, banner_listen_ip, &token_suffix);
	print_manage_banner_line();
	output::print_banner_footer();
	let _ = std::io::stdout().flush();
	log.result(format!(
		"Agent host supervisor already running (PID {pid}). \
		 Use `{application_name} agent kill` to stop it, or `{application_name} agent host --replace` to start a fresh one.",
		application_name = constants::APPLICATION_NAME,
	));
}

fn print_manage_banner_line() {
	let application_name = constants::APPLICATION_NAME;
	output::print_banner_line(
		"Manage",
		&format!("{application_name} agent ps  |  {application_name} agent kill"),
	);
}

/// Compare the user's requested supervisor configuration with what's
/// recorded for the running supervisor's registry entry. Returns a short
/// human description of the first conflict found (e.g. `"--host 0.0.0.0
/// conflicts with the running supervisor (bound to 127.0.0.1)"`), or
/// `None` when the requested config is compatible with sharing the
/// existing supervisor.
///
/// `running_host` may be `None` when the registry entry doesn't record a
/// host; in that case we conservatively skip the host comparison (the
/// supervisor is most likely loopback, which is the default).
fn detect_config_conflict(
	args: &AgentHostArgs,
	running_host: Option<&str>,
	running_port: u16,
	running_token: Option<&str>,
	running_tunnel: Option<&str>,
) -> Option<String> {
	if let (Some(requested), Some(running)) = (args.host.as_deref(), running_host) {
		if requested != running {
			return Some(format!(
				"--host {requested} conflicts with the running supervisor (bound to {running})"
			));
		}
	}
	if args.port != 0 && args.port != running_port {
		return Some(format!(
			"--port {requested} conflicts with the running supervisor (bound to {running})",
			requested = args.port,
			running = running_port,
		));
	}
	if args.without_connection_token && running_token.is_some() {
		return Some(
			"--without-connection-token conflicts with the running supervisor (uses a token)"
				.to_string(),
		);
	}
	if let Some(requested) = args.connection_token.as_deref() {
		match running_token {
			None => {
				return Some(
					"--connection-token conflicts with the running supervisor (no token configured)"
						.to_string(),
				);
			}
			Some(running) if running != requested => {
				return Some(
					"--connection-token conflicts with the running supervisor's token".to_string(),
				);
			}
			Some(_) => {}
		}
	}
	if args.tunnel && running_tunnel.is_none() {
		return Some(
			"--tunnel conflicts with the running supervisor (not exposed via a tunnel)".to_string(),
		);
	}
	None
}

/// Kill the existing supervisor process tree and remove its exact
/// `(standalone, pid, instanceId)` entry from the shared local agent-host
/// endpoint registry, so the subsequent supervisor start publishes a
/// clean one.
async fn replace_existing(
	log: &log::Logger,
	user_data_path: &Path,
	pid: u32,
	instance_id: String,
) -> Result<(), AnyError> {
	if let Err(e) = kill_tree(pid).await {
		warning!(
			log,
			"Failed to kill existing agent host (PID {}): {}",
			pid,
			e
		);
	}
	let identity = AgentHostEndpointIdentity {
		server_type: AgentHostServerType::Standalone,
		pid,
		instance_id,
	};
	agent_host_registry::remove_agent_host_endpoint(log, user_data_path, &identity);
	Ok(())
}

/// Re-launch the current `code agent host` invocation in a detached
/// background process with [`SUPERVISOR_ENV`] set, and wait on the
/// child's stdout for the readiness sentinel before returning. The
/// foreground always exits as soon as the supervisor is up — the
/// supervisor is shared and outlives any individual invocation, and the
/// user manages it via `code agent kill` / `code agent ps`.
async fn daemonize_supervisor() -> Result<i32, AnyError> {
	let exe = std::env::current_exe().map_err(|e| wrap(e, "could not resolve current_exe"))?;
	let mut cmd = tokio::process::Command::new(&exe);
	// Forward our argv unchanged so the supervisor child sees the same
	// `--host`/`--port`/`--without-connection-token`/etc. flags the user
	// passed in foreground.
	cmd.args(std::env::args_os().skip(1));
	cmd.env(SUPERVISOR_ENV, "1");
	#[cfg(windows)]
	cmd.env(
		output::PARENT_STDOUT_SUPPORTS_UTF8_ENV,
		if output::stdout_supports_utf8() {
			"1"
		} else {
			"0"
		},
	);
	cmd.stdin(std::process::Stdio::null());
	cmd.stdout(std::process::Stdio::piped());
	cmd.stderr(std::process::Stdio::piped());
	cmd.kill_on_drop(false);
	cmd.detach_from_parent();

	let mut child = cmd
		.spawn()
		.map_err(|e| wrap(e, "could not spawn detached agent host supervisor"))?;
	let mut stdout = BufReader::new(child.stdout.take().unwrap()).lines();
	let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();

	let timeout = tokio::time::sleep(SUPERVISOR_READY_TIMEOUT);
	tokio::pin!(timeout);

	loop {
		tokio::select! {
			r = stdout.next_line() => match r {
				Ok(Some(line)) => {
					if line == SUPERVISOR_READY_LINE {
						// With `kill_on_drop` false the supervisor keeps
						// running independently after we return.
						return Ok(0);
					}
					println!("{line}");
				}
				Ok(None) | Err(_) => {
					eprintln!("Agent host supervisor exited before becoming ready.");
					return Ok(1);
				}
			},
			r = stderr.next_line() => {
				if let Ok(Some(line)) = r {
					eprintln!("{line}");
				}
			},
			_ = &mut timeout => {
				eprintln!(
					"Timed out after {}s waiting for agent host supervisor to become ready.",
					SUPERVISOR_READY_TIMEOUT.as_secs()
				);
				return Ok(1);
			}
		}
	}
}

/// Ensure an agent host supervisor is running on this machine and return
/// the live endpoint to dial. Used by callers that want to reuse the
/// supervisor regardless of who started it (e.g. `code tunnel`'s
/// SpawnFresh branch).
pub async fn ensure_supervisor_running(
	launcher_paths: &LauncherPaths,
	log: &log::Logger,
) -> Result<ActiveAgentHost, AnyError> {
	let user_data_path = resolve_user_data_path(None);
	if let AgentHostReuseDecision::Reuse {
		pid,
		host,
		port,
		token,
		..
	} = classify_agent_host(log, &user_data_path).await
	{
		return Ok(ActiveAgentHost {
			pid,
			host,
			port,
			token,
		});
	}

	info!(
		log,
		"No agent host supervisor running; starting one in the background"
	);

	spawn_supervisor_and_wait_ready(launcher_paths, log, &[]).await?;

	match classify_agent_host(log, &user_data_path).await {
		AgentHostReuseDecision::Reuse {
			pid,
			host,
			port,
			token,
			..
		} => Ok(ActiveAgentHost {
			pid,
			host,
			port,
			token,
		}),
		AgentHostReuseDecision::SpawnFresh => {
			Err(CodeError::CouldNotListenOnInterface(std::io::Error::other(
				"agent host supervisor signalled ready but its registry entry is missing",
			))
			.into())
		}
	}
}

/// Spawns a brand-new standalone agent host supervisor dedicated to one
/// protocol-v6 tunnel gateway `newDedicated` selection, equivalent to
/// running `code agent host --new-instance --idle-timeout
/// <idle_timeout_secs>` directly. Unlike [`ensure_supervisor_running`],
/// this never reuses or replaces an existing registry entry: it spawns
/// unconditionally (mirroring `--new-instance`'s contract, see
/// `decide_foreground_action`) and identifies the exact new entry by
/// matching the spawned child's PID against the fresh set of live
/// `standalone` entries, so any pre-existing `editor`/`standalone`
/// entries are never touched.
pub async fn spawn_dedicated_supervisor(
	launcher_paths: &LauncherPaths,
	log: &log::Logger,
	user_data_path: &Path,
	idle_timeout_secs: u64,
) -> Result<agent_host_registry::AgentHostEndpointMetadata, AnyError> {
	info!(
		log,
		"Starting a new dedicated agent host supervisor for tunnel gateway selection"
	);

	let idle_timeout_arg = idle_timeout_secs.to_string();
	let user_data_dir_arg = user_data_path.to_string_lossy().to_string();
	let extra_args = [
		"--new-instance".to_string(),
		"--idle-timeout".to_string(),
		idle_timeout_arg,
		"--user-data-dir".to_string(),
		user_data_dir_arg,
	];
	let child_pid = spawn_supervisor_and_wait_ready(launcher_paths, log, &extra_args).await?;

	agent_host_registry::list_live_standalone_endpoints(log, user_data_path)
		.await
		.into_iter()
		.find(|e| e.pid == child_pid)
		.ok_or_else(|| {
			CodeError::CouldNotListenOnInterface(std::io::Error::other(
				"dedicated agent host supervisor signalled ready but its registry entry is missing",
			))
			.into()
		})
}

/// Spawns `code agent host` as a detached supervisor with the given
/// extra CLI arguments and blocks until it prints [`SUPERVISOR_READY_LINE`]
/// on stdout, forwarding its stderr lines to our log in the meantime.
/// Returns the spawned child's PID. Shared by [`ensure_supervisor_running`]
/// (no extra args; reuse-or-spawn-fresh) and [`spawn_dedicated_supervisor`]
/// (`--new-instance --idle-timeout ... --user-data-dir ...`; always
/// fresh).
async fn spawn_supervisor_and_wait_ready(
	launcher_paths: &LauncherPaths,
	log: &log::Logger,
	extra_args: &[String],
) -> Result<u32, AnyError> {
	let exe = std::env::current_exe().map_err(|e| wrap(e, "could not resolve current_exe"))?;
	let mut cmd = tokio::process::Command::new(&exe);
	cmd.arg("--cli-data-dir").arg(launcher_paths.root());
	cmd.arg("agent").arg("host");
	cmd.args(extra_args);
	cmd.env(SUPERVISOR_ENV, "1");
	cmd.stdin(std::process::Stdio::null());
	cmd.stdout(std::process::Stdio::piped());
	cmd.stderr(std::process::Stdio::piped());
	cmd.kill_on_drop(false);
	cmd.detach_from_parent();

	let mut child = cmd
		.spawn()
		.map_err(|e| wrap(e, "could not spawn agent host supervisor"))?;
	let child_pid = child.id().ok_or_else(|| {
		wrap(
			std::io::Error::other("spawned agent host supervisor process has no pid"),
			"could not resolve spawned supervisor pid",
		)
	})?;
	let mut stdout = BufReader::new(child.stdout.take().unwrap()).lines();
	let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();

	let timeout = tokio::time::sleep(SUPERVISOR_READY_TIMEOUT);
	tokio::pin!(timeout);

	loop {
		tokio::select! {
			r = stdout.next_line() => match r {
				Ok(Some(line)) => {
					if line == SUPERVISOR_READY_LINE {
						return Ok(child_pid);
					}
				}
				Ok(None) | Err(_) => {
					return Err(CodeError::CouldNotListenOnInterface(std::io::Error::other(
						"agent host supervisor exited before becoming ready",
					))
					.into());
				}
			},
			r = stderr.next_line() => {
				if let Ok(Some(line)) = r {
					debug!(log, "[supervisor stderr]: {}", line);
				}
			},
			_ = &mut timeout => {
				return Err(CodeError::CouldNotListenOnInterface(std::io::Error::other(format!(
					"timed out after {}s waiting for agent host supervisor",
					SUPERVISOR_READY_TIMEOUT.as_secs()
				)))
				.into());
			}
		}
	}
}

/// Endpoint of a running agent host supervisor, as recorded in the shared
/// local agent-host endpoint registry and consumed by tunnel + bridge
/// callers.
pub struct ActiveAgentHost {
	pub pid: u32,
	/// Host the supervisor was bound to (e.g. `"0.0.0.0"`, `"::1"`,
	/// `"localhost"`, a specific IP). `None` when the registry entry
	/// doesn't record a host. Consumers should pair this with
	/// [`dial_host`] to pick the right loopback target when the
	/// supervisor was bound to a wildcard.
	pub host: Option<String>,
	pub port: u16,
	pub token: Option<String>,
}

impl ActiveAgentHost {
	/// Loopback address callers should dial to reach this supervisor.
	/// Maps IPv4/IPv6 wildcards (`0.0.0.0` / `::`) to the corresponding
	/// loopback; passes specific hosts (e.g. `::1`, `localhost`,
	/// `10.0.0.5`) through unchanged. A missing host falls back to IPv4
	/// loopback to preserve the prior behaviour.
	pub fn dial_host(&self) -> &str {
		dial_host(self.host.as_deref())
	}

	/// Populate the `--agent-host-bridge-*` fields on a [`CodeServerArgs`]
	/// so the spawned VS Code server's `agentHostProxy` channel dials this
	/// supervisor. Uses [`dial_host`] for the host so a supervisor bound
	/// to a wildcard (`0.0.0.0` / `::`) is reached via loopback rather
	/// than the wildcard itself.
	pub fn apply_to_bridge(&self, csa: &mut CodeServerArgs) {
		csa.agent_host_bridge_host = Some(self.dial_host().to_string());
		csa.agent_host_bridge_port = Some(self.port);
		csa.agent_host_bridge_connection_token = self.token.clone();
	}
}

/// See [`ActiveAgentHost::dial_host`].
pub fn dial_host(bound: Option<&str>) -> &str {
	match bound {
		Some("0.0.0.0") | Some("::") | Some("[::]") | None => "127.0.0.1",
		Some(other) => other,
	}
}

/// After the detach child has signalled ready, sever its inherited stdio
/// so subsequent writes (banner footer, info!/warning! from the update
/// loop, etc.) don't fail with `BrokenPipe` once the parent exits and
/// closes the read end of the pipes.
fn redirect_stdio_to_null() -> std::io::Result<()> {
	let null_path = if cfg!(windows) { "NUL" } else { "/dev/null" };
	let null = std::fs::OpenOptions::new()
		.read(true)
		.write(true)
		.open(null_path)?;

	#[cfg(unix)]
	{
		use std::os::unix::io::AsRawFd as _;
		let fd = null.as_raw_fd();
		// SAFETY: dup2 is async-signal-safe and only mutates the calling
		// process's fd table. Failure is reported via -1 + errno.
		unsafe {
			if libc::dup2(fd, 0) < 0 || libc::dup2(fd, 1) < 0 || libc::dup2(fd, 2) < 0 {
				return Err(std::io::Error::last_os_error());
			}
		}
	}
	#[cfg(windows)]
	{
		use std::os::windows::io::AsRawHandle as _;
		use windows_sys::Win32::System::Console::{
			SetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
		};
		let handle = null.as_raw_handle();
		// SAFETY: SetStdHandle only updates the process's per-stdio
		// handles. The handle stays valid because we leak the file below.
		unsafe {
			if SetStdHandle(STD_INPUT_HANDLE, handle as _) == 0
				|| SetStdHandle(STD_OUTPUT_HANDLE, handle as _) == 0
				|| SetStdHandle(STD_ERROR_HANDLE, handle as _) == 0
			{
				return Err(std::io::Error::last_os_error());
			}
		}
		// Keep the handle alive past `null`'s drop on Windows (where the
		// std handles store the raw handle without taking ownership).
		std::mem::forget(null);
	}
	Ok(())
}

fn mint_connection_token(path: &Path, prefer_token: Option<String>) -> std::io::Result<String> {
	#[cfg(not(windows))]
	use std::os::unix::fs::OpenOptionsExt;

	let mut file_options = fs::OpenOptions::new();
	file_options.create(true);
	file_options.write(true);
	file_options.read(true);
	#[cfg(not(windows))]
	file_options.mode(0o600);
	let mut file = file_options.open(path)?;

	if prefer_token.is_none() {
		let mut token = String::new();
		file.read_to_string(&mut token)?;
		let token = token.trim();
		if !token.is_empty() {
			return Ok(token.to_string());
		}
	}

	file.set_len(0)?;
	let prefer_token = prefer_token.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
	file.write_all(prefer_token.as_bytes())?;
	Ok(prefer_token)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::async_pipe::{get_socket_name, listen_socket_rw_stream};
	use std::fs;
	use tokio::net::TcpListener;

	#[test]
	fn mint_connection_token_generates_and_persists() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		// First call with no preference generates a UUID and persists it
		let token1 = mint_connection_token(&path, None).unwrap();
		assert!(!token1.is_empty());
		assert_eq!(fs::read_to_string(&path).unwrap(), token1);

		// Second call with no preference reads the existing token
		let token2 = mint_connection_token(&path, None).unwrap();
		assert_eq!(token1, token2);
	}

	#[test]
	fn mint_connection_token_respects_preferred() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		// Providing a preferred token writes it to the file
		let token = mint_connection_token(&path, Some("my-token".to_string())).unwrap();
		assert_eq!(token, "my-token");
		assert_eq!(fs::read_to_string(&path).unwrap(), "my-token");
	}

	#[test]
	fn mint_connection_token_preferred_overwrites_existing() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");

		mint_connection_token(&path, None).unwrap();

		// Providing a preference overwrites any existing token
		let token = mint_connection_token(&path, Some("override".to_string())).unwrap();
		assert_eq!(token, "override");
		assert_eq!(fs::read_to_string(&path).unwrap(), "override");
	}

	fn reusable_decision() -> AgentHostReuseDecision {
		AgentHostReuseDecision::Reuse {
			pid: 4242,
			host: Some("127.0.0.1".to_string()),
			port: 9000,
			token: Some("tok".to_string()),
			tunnel_name: None,
			instance_id: "instance-existing".to_string(),
		}
	}

	#[test]
	fn decide_foreground_action_spawn_fresh_when_nothing_registered() {
		let args = AgentHostArgs::default();
		let action = decide_foreground_action(&args, AgentHostReuseDecision::SpawnFresh);
		assert_eq!(action, ForegroundAction::SpawnFresh);
	}

	#[test]
	fn decide_foreground_action_reuses_when_compatible() {
		let args = AgentHostArgs::default();
		let action = decide_foreground_action(&args, reusable_decision());
		assert_eq!(
			action,
			ForegroundAction::ReuseBanner {
				pid: 4242,
				host: Some("127.0.0.1".to_string()),
				port: 9000,
				token: Some("tok".to_string()),
				tunnel_name: None,
			}
		);
	}

	#[test]
	fn decide_foreground_action_replace_kills_existing_when_set() {
		let args = AgentHostArgs {
			replace: true,
			..Default::default()
		};
		let action = decide_foreground_action(&args, reusable_decision());
		assert_eq!(
			action,
			ForegroundAction::ReplaceThenSpawnFresh {
				pid: 4242,
				instance_id: "instance-existing".to_string(),
			}
		);
	}

	#[test]
	fn decide_foreground_action_conflict_error_when_config_differs() {
		let args = AgentHostArgs {
			port: 1234,
			..Default::default()
		};
		let action = decide_foreground_action(&args, reusable_decision());
		match action {
			ForegroundAction::ConflictError(message) => {
				assert!(message.contains("--port 1234"));
			}
			other => panic!("expected ConflictError, got {other:?}"),
		}
	}

	/// The core `--new-instance` contract: it must win over every other
	/// branch, in particular `--replace`'s kill path, so that passing
	/// both flags together can never remove an existing entry.
	#[test]
	fn decide_foreground_action_new_instance_bypasses_reuse_even_when_live_standalone_registered() {
		let args = AgentHostArgs {
			new_instance: true,
			..Default::default()
		};
		let action = decide_foreground_action(&args, reusable_decision());
		assert_eq!(action, ForegroundAction::SpawnFresh);
	}

	#[test]
	fn decide_foreground_action_new_instance_takes_priority_over_replace() {
		let args = AgentHostArgs {
			new_instance: true,
			replace: true,
			..Default::default()
		};
		let action = decide_foreground_action(&args, reusable_decision());
		// Must be `SpawnFresh`, never `ReplaceThenSpawnFresh`: `--new-instance`
		// must not trigger the kill-and-remove path even when `--replace`
		// is also passed.
		assert_eq!(action, ForegroundAction::SpawnFresh);
	}

	#[test]
	fn decide_foreground_action_new_instance_bypasses_config_conflict_check() {
		// A `--port` that would otherwise conflict with the running
		// supervisor must not block `--new-instance`: creating a second,
		// independently configured instance is the whole point.
		let args = AgentHostArgs {
			new_instance: true,
			port: 1234,
			..Default::default()
		};
		let action = decide_foreground_action(&args, reusable_decision());
		assert_eq!(action, ForegroundAction::SpawnFresh);
	}

	/// End-to-end-ish proof, against a real temp registry, that
	/// `--new-instance` leaves pre-existing `editor` and `standalone`
	/// entries completely untouched, while a normal (non-`--new-instance`)
	/// request against the same registry would have chosen to reuse the
	/// existing standalone entry instead of starting anything new.
	#[tokio::test]
	async fn new_instance_preserves_existing_editor_and_standalone_registry_entries() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("user-data");
		let log = log::Logger::test();
		let editor_socket_path = get_socket_name();
		let mut editor_socket_listener =
			listen_socket_rw_stream(&editor_socket_path).await.unwrap();
		let _editor_accept_task = tokio::spawn(async move {
			loop {
				let _connection = editor_socket_listener.accept().await.unwrap();
			}
		});
		let standalone_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
		let standalone_port = standalone_listener.local_addr().unwrap().port();
		let new_supervisor_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
		let new_supervisor_port = new_supervisor_listener.local_addr().unwrap().port();

		let editor = agent_host_registry::AgentHostEndpointMetadata {
			schema_version: agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: "editor-instance".to_string(),
			protocol_version: agent_host_registry::AGENT_HOST_PROTOCOL_VERSION.to_string(),
			connection_token: "editor-tok".to_string(),
			endpoint: agent_host_registry::AgentHostEndpointAddress::Socket {
				path: editor_socket_path.to_string_lossy().to_string(),
			},
			quality: None,
			tunnel_name: None,
		};
		agent_host_registry::publish_agent_host_endpoint(&log, &user_data_path, &editor).unwrap();

		let standalone = agent_host_registry::AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			"standalone-existing".to_string(),
			"127.0.0.1".to_string(),
			standalone_port,
			"standalone-tok".to_string(),
			agent_host_registry::AGENT_HOST_PROTOCOL_VERSION.to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(&log, &user_data_path, &standalone)
			.unwrap();

		// Sanity check: without `--new-instance`, this registry state
		// would have caused a plain `code agent host` to reuse the
		// existing standalone entry rather than spawn anything.
		let plain_decision = classify_agent_host(&log, &user_data_path).await;
		assert_eq!(
			plain_decision,
			AgentHostReuseDecision::Reuse {
				pid: std::process::id(),
				host: Some("127.0.0.1".to_string()),
				port: standalone_port,
				token: Some("standalone-tok".to_string()),
				tunnel_name: None,
				instance_id: "standalone-existing".to_string(),
			}
		);
		assert_eq!(
			decide_foreground_action(&AgentHostArgs::default(), plain_decision),
			ForegroundAction::ReuseBanner {
				pid: std::process::id(),
				host: Some("127.0.0.1".to_string()),
				port: standalone_port,
				token: Some("standalone-tok".to_string()),
				tunnel_name: None,
			}
		);

		// With `--new-instance`, `run_foreground` skips consulting the
		// registry entirely (mirrored here) and the decision must always
		// be `SpawnFresh`, never touching the registry.
		let new_instance_args = AgentHostArgs {
			new_instance: true,
			..Default::default()
		};
		let action =
			decide_foreground_action(&new_instance_args, AgentHostReuseDecision::SpawnFresh);
		assert_eq!(action, ForegroundAction::SpawnFresh);

		// The pre-existing editor and standalone entries must still be
		// present, byte-for-byte, after deciding to spawn a new instance.
		let entries_after = agent_host_registry::read_registry(&log, &user_data_path).unwrap();
		assert_eq!(entries_after.len(), 2);
		assert!(entries_after.contains(&editor));
		assert!(entries_after.contains(&standalone));

		// Once the new supervisor actually starts, it publishes its own
		// additional standalone entry (fresh PID/instanceId/port) rather
		// than replacing the old one; all three live entries then coexist.
		let new_supervisor = agent_host_registry::AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			"standalone-new-instance".to_string(),
			"127.0.0.1".to_string(),
			new_supervisor_port,
			"new-instance-tok".to_string(),
			agent_host_registry::AGENT_HOST_PROTOCOL_VERSION.to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(&log, &user_data_path, &new_supervisor)
			.unwrap();

		let live = agent_host_registry::list_live_endpoints(&log, &user_data_path).await;
		assert_eq!(live.len(), 3);
		assert!(live.iter().any(|e| e.instance_id == "editor-instance"));
		assert!(live.iter().any(|e| e.instance_id == "standalone-existing"));
		assert!(live
			.iter()
			.any(|e| e.instance_id == "standalone-new-instance"));
	}

	#[test]
	fn agent_host_args_new_instance_composes_with_idle_timeout() {
		use clap::Parser;

		#[derive(clap::Parser)]
		struct Wrapper {
			#[clap(flatten)]
			args: AgentHostArgs,
		}

		let parsed = Wrapper::parse_from([
			"code",
			"--new-instance",
			"--idle-timeout",
			"300",
			"--port",
			"5000",
		]);
		assert!(parsed.args.new_instance);
		assert_eq!(parsed.args.idle_timeout, Some(300));
		assert_eq!(parsed.args.port, 5000);
	}
}
