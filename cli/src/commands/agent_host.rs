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
use crate::state::LauncherPaths;
use crate::tunnels::agent_host::{
	classify_agent_host_lockfile, AgentHostConfig, AgentHostLockfileDecision, AgentHostManager,
	AgentHostSidecar, LoopbackAuth,
};
use crate::tunnels::agent_host_metadata::remove_agent_host_metadata;
use crate::tunnels::code_server::CodeServerArgs;
use crate::tunnels::dev_tunnels::DevTunnels;
use crate::tunnels::shutdown_signal::ShutdownRequest;
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
/// the body that actually binds the TCP listener, writes the lockfile,
/// owns the proxy sidecar, and manages the AH backend's lifecycle. The
/// foreground `code agent host` invocation re-execs itself detached with
/// this variable set so the supervisor outlives the user's terminal.
const SUPERVISOR_ENV: &str = "VSCODE_AGENT_HOST_SUPERVISOR";
/// Single-line sentinel the supervisor prints once the listener is bound,
/// the lockfile is written, and the banner has been flushed. The
/// foreground process watches for this on the supervisor's stdout, then
/// either exits (`--detach`) or starts forwarding output.
const SUPERVISOR_READY_LINE: &str = "__VSCODE_AGENT_HOST_READY__";
/// Cap on how long the foreground waits for the supervisor to become
/// ready before giving up and surfacing a failure.
const SUPERVISOR_READY_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Runs the `code agent host` command. Acts in one of two modes:
///
/// * **Foreground** (the default): classifies the canonical lockfile and
///   either prints info about the live supervisor (`Reuse`), or daemonizes
///   a new supervisor child (`SpawnFresh`) and either exits (`--detach`)
///   or follows the supervisor's stdout until Ctrl-C.
///
/// * **Supervisor** (when [`SUPERVISOR_ENV`] is set): binds the public TCP
///   listener, writes the lockfile recording this process's PID + port,
///   runs the proxy accept loop, and manages the underlying VS Code server
///   as a regular child process so the supervisor can kill+respawn it on
///   update.
pub async fn agent_host(ctx: CommandContext, args: AgentHostArgs) -> Result<i32, AnyError> {
	if std::env::var_os(SUPERVISOR_ENV).is_some() {
		return run_supervisor(ctx, args).await;
	}
	run_foreground(ctx, args).await
}

/// Foreground entry point: decides whether to reuse an existing supervisor
/// or daemonize a fresh one, then prints / streams supervisor output until
/// the user hits Ctrl-C.
async fn run_foreground(ctx: CommandContext, args: AgentHostArgs) -> Result<i32, AnyError> {
	let started = Instant::now();
	let lockfile_path = ctx.paths.agent_host_lockfile();

	let decision = classify_agent_host_lockfile(&ctx.log, &lockfile_path);

	if let AgentHostLockfileDecision::Reuse {
		pid,
		host,
		port,
		token,
		tunnel_name,
	} = &decision
	{
		// User asked to replace explicitly: kill + spawn fresh, regardless
		// of whether the running config matches.
		if args.replace {
			info!(
				ctx.log,
				"--replace set; stopping agent host (PID {}, port {}) before starting new one",
				pid,
				port
			);
			replace_existing(&ctx.log, &lockfile_path, *pid).await?;
			return daemonize_supervisor(&args).await;
		}

		// No `--replace`: check whether the requested network config
		// matches the running supervisor. If it differs, error out with a
		// clear message instead of silently sharing a differently-bound
		// supervisor.
		if let Some(conflict) = detect_config_conflict(
			&args,
			host.as_deref(),
			*port,
			token.as_deref(),
			tunnel_name.as_deref(),
		) {
			ctx.log.result(format!(
				"Agent host already running on {host_str}:{port} (PID {pid}), but {conflict}.\n\
				 Use `code agent kill` to stop it, or pass `--replace` to take over.",
				host_str = host.as_deref().unwrap_or("127.0.0.1"),
			));
			return Ok(2);
		}

		print_reuse_banner(
			&ctx.log,
			started,
			*pid,
			host.as_deref(),
			*port,
			token.as_deref(),
			tunnel_name.as_deref(),
		);
		return Ok(0);
	}

	daemonize_supervisor(&args).await
}

/// Body of the detached supervisor process. Starts an
/// [`AgentHostManager`], binds an [`AgentHostSidecar`] on the user's
/// chosen `--host`/`--port`, optionally exposes it over a dev tunnel,
/// prints the readiness banner / sentinel, then services connections
/// until killed.
async fn run_supervisor(mut ctx: CommandContext, mut args: AgentHostArgs) -> Result<i32, AnyError> {
	let started = Instant::now();

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

	let sidecar = AgentHostSidecar::bind_tcp(
		ctx.log.clone(),
		manager.clone(),
		listen_addr,
		args.host.clone(),
		loopback_auth,
		tunnel_name.clone(),
		ctx.paths.agent_host_lockfile(),
	)
	.await?;
	let bound_port = sidecar.bound_addr().port();

	let mut tunnel_handle: Option<crate::tunnels::dev_tunnels::ActiveTunnel> = None;
	if let Some((tunnel, mut tunnel_port)) = pending_tunnel {
		let sidecar_for_tunnel = sidecar.clone();
		tokio::spawn(async move {
			while let Some(socket) = tunnel_port.recv().await {
				let sidecar = sidecar_for_tunnel.clone();
				tokio::spawn(async move {
					sidecar.serve_tunnel_connection(socket.into_rw()).await;
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
	output::print_banner_line("Manage", "code agent ps  |  code agent kill");
	output::print_banner_footer();
	let _ = std::io::stdout().flush();

	// Signal readiness to the foreground parent (if any) and then sever
	// the inherited stdio so subsequent writes don't `BrokenPipe` once
	// the parent exits.
	println!("{SUPERVISOR_READY_LINE}");
	let _ = std::io::stdout().flush();
	let _ = std::io::stderr().flush();
	if let Err(e) = redirect_stdio_to_null() {
		warning!(ctx.log, "Failed to redirect stdio after detach: {}", e);
	}

	let shutdown_rx = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);
	sidecar.serve(shutdown_rx).await?;
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
	// Surface the host the supervisor was actually bound to (older
	// lockfiles omit it; fall back to loopback). This lets the network
	// hint correctly say "use --host to expose" only when the supervisor
	// really is loopback-only.
	let banner_listen_ip = host
		.and_then(|h| h.parse::<std::net::IpAddr>().ok())
		.unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
	output::print_network_lines(port, banner_listen_ip, &token_suffix);
	output::print_banner_line("Manage", "code agent ps  |  code agent kill");
	output::print_banner_footer();
	let _ = std::io::stdout().flush();
	log.result(format!(
		"Agent host supervisor already running (PID {pid}). \
		 Use `code agent kill` to stop it, or `code agent host --replace` to start a fresh one."
	));
}

/// Compare the user's requested supervisor configuration with what's
/// recorded in the lockfile. Returns a short human description of the
/// first conflict found (e.g. `"--host 0.0.0.0 conflicts with the
/// running supervisor (bound to 127.0.0.1)"`), or `None` when the
/// requested config is compatible with sharing the existing supervisor.
///
/// `lockfile_host` may be `None` when the lockfile was written by an
/// older CLI; in that case we conservatively skip the host comparison
/// (the supervisor is most likely loopback, which is the default).
fn detect_config_conflict(
	args: &AgentHostArgs,
	lockfile_host: Option<&str>,
	lockfile_port: u16,
	lockfile_token: Option<&str>,
	lockfile_tunnel: Option<&str>,
) -> Option<String> {
	if let (Some(requested), Some(running)) = (args.host.as_deref(), lockfile_host) {
		if requested != running {
			return Some(format!(
				"--host {requested} conflicts with the running supervisor (bound to {running})"
			));
		}
	}
	if args.port != 0 && args.port != lockfile_port {
		return Some(format!(
			"--port {requested} conflicts with the running supervisor (bound to {running})",
			requested = args.port,
			running = lockfile_port,
		));
	}
	if args.without_connection_token && lockfile_token.is_some() {
		return Some(
			"--without-connection-token conflicts with the running supervisor (uses a token)"
				.to_string(),
		);
	}
	if let Some(requested) = args.connection_token.as_deref() {
		match lockfile_token {
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
	if args.tunnel && lockfile_tunnel.is_none() {
		return Some(
			"--tunnel conflicts with the running supervisor (not exposed via a tunnel)".to_string(),
		);
	}
	None
}

/// Kill the existing supervisor process tree and drop the lockfile so the
/// subsequent supervisor start writes a clean record.
async fn replace_existing(log: &log::Logger, lockfile: &Path, pid: u32) -> Result<(), AnyError> {
	if let Err(e) = kill_tree(pid).await {
		warning!(
			log,
			"Failed to kill existing agent host (PID {}): {}",
			pid,
			e
		);
	}
	let _ = remove_agent_host_metadata(lockfile);
	Ok(())
}

/// Re-launch the current `code agent host` invocation in a detached
/// background process with [`SUPERVISOR_ENV`] set, and wait on the
/// child's stdout for the readiness sentinel before returning. The
/// foreground always exits as soon as the supervisor is up — the
/// supervisor is shared and outlives any individual invocation, and the
/// user manages it via `code agent kill` / `code agent ps`.
async fn daemonize_supervisor(args: &AgentHostArgs) -> Result<i32, AnyError> {
	let exe = std::env::current_exe().map_err(|e| wrap(e, "could not resolve current_exe"))?;
	let mut cmd = tokio::process::Command::new(&exe);
	// Forward our argv unchanged so the supervisor child sees the same
	// `--host`/`--port`/`--without-connection-token`/etc. flags the user
	// passed in foreground.
	cmd.args(std::env::args_os().skip(1));
	cmd.env(SUPERVISOR_ENV, "1");
	cmd.stdin(std::process::Stdio::null());
	cmd.stdout(std::process::Stdio::piped());
	cmd.stderr(std::process::Stdio::piped());
	cmd.kill_on_drop(false);
	cmd.detach_from_parent();

	let _ = args; // argv was already forwarded above; explicit `args` use is unnecessary

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
	let lockfile_path = launcher_paths.agent_host_lockfile();
	if let AgentHostLockfileDecision::Reuse {
		pid,
		host,
		port,
		token,
		..
	} = classify_agent_host_lockfile(log, &lockfile_path)
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

	let exe = std::env::current_exe().map_err(|e| wrap(e, "could not resolve current_exe"))?;
	let mut cmd = tokio::process::Command::new(&exe);
	cmd.arg("--cli-data-dir").arg(launcher_paths.root());
	cmd.arg("agent").arg("host");
	cmd.env(SUPERVISOR_ENV, "1");
	cmd.stdin(std::process::Stdio::null());
	cmd.stdout(std::process::Stdio::piped());
	cmd.stderr(std::process::Stdio::piped());
	cmd.kill_on_drop(false);
	cmd.detach_from_parent();

	let mut child = cmd
		.spawn()
		.map_err(|e| wrap(e, "could not spawn agent host supervisor"))?;
	let mut stdout = BufReader::new(child.stdout.take().unwrap()).lines();
	let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();

	let timeout = tokio::time::sleep(SUPERVISOR_READY_TIMEOUT);
	tokio::pin!(timeout);

	loop {
		tokio::select! {
			r = stdout.next_line() => match r {
				Ok(Some(line)) => {
					if line == SUPERVISOR_READY_LINE {
						break;
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

	match classify_agent_host_lockfile(log, &lockfile_path) {
		AgentHostLockfileDecision::Reuse {
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
		AgentHostLockfileDecision::SpawnFresh => Err(CodeError::CouldNotListenOnInterface(
			std::io::Error::other("agent host supervisor signalled ready but lockfile is missing"),
		)
		.into()),
	}
}

/// Endpoint of a running agent host supervisor, as recorded in the
/// lockfile and consumed by tunnel + bridge callers.
pub struct ActiveAgentHost {
	pub pid: u32,
	/// Host the supervisor was bound to (e.g. `"0.0.0.0"`, `"::1"`,
	/// `"localhost"`, a specific IP). `None` for lockfiles written by
	/// older CLIs. Consumers should pair this with [`dial_host`] to
	/// pick the right loopback target when the supervisor was bound to
	/// a wildcard.
	pub host: Option<String>,
	pub port: u16,
	pub token: Option<String>,
}

impl ActiveAgentHost {
	/// Loopback address callers should dial to reach this supervisor.
	/// Maps IPv4/IPv6 wildcards (`0.0.0.0` / `::`) to the corresponding
	/// loopback; passes specific hosts (e.g. `::1`, `localhost`,
	/// `10.0.0.5`) through unchanged. Missing host (older lockfile)
	/// falls back to IPv4 loopback to preserve the prior behaviour.
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
	use std::fs;

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
}
