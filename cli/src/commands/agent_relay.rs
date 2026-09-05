/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! `code agent relay <instance-id>`: a raw stdin/stdout <-> endpoint
//! relay with no WebSocket interpretation and no banner output, meant to
//! be used as an SSH `ProxyCommand`-style bridge (e.g.
//! `ProxyCommand ssh host code agent relay <instance-id>`) so a remote
//! caller can reach an `editor`-owned socket/pipe endpoint (or a
//! `standalone` TCP one) as if it were dialing it directly.
//!
//! Unlike every other `code agent` subcommand, this one must never print
//! anything of its own to stdout: stdout *is* the relayed byte stream for
//! the entire lifetime of the process. Diagnostics go to stderr/logging
//! only, and only ever before the relay actually starts moving bytes.

use std::path::Path;

use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpStream;

use crate::async_pipe::{get_socket_rw_stream, socket_stream_split, AcceptedRW};
use crate::log;
use crate::tunnels::agent_host_registry::{AgentHostEndpointAddress, AgentHostEndpointMetadata};
use crate::tunnels::user_data_path::resolve_user_data_path;
use crate::util::errors::{wrap, AnyError, CodeError};

use super::agent_discovery;
use super::agent_host::dial_host;
use super::args::AgentRelayArgs;
use super::CommandContext;

/// Finds the exact live registry endpoint for `instance_id`, connects to
/// it (TCP or socket/named pipe, whichever it publishes), and relays
/// stdin/stdout to/from it verbatim until either side closes.
///
/// Considers *every* live endpoint kind (both `editor` and `standalone`)
/// since editor-owned socket/pipe endpoints are exactly what this
/// command exists to bridge remotely; `code agent kill`'s
/// standalone-only restriction does not apply here.
pub async fn agent_relay(ctx: CommandContext, args: AgentRelayArgs) -> Result<i32, AnyError> {
	let user_data_path = resolve_user_data_path(args.user_data_dir.as_deref());
	let endpoints =
		agent_discovery::discover_live_endpoints(&ctx, args.user_data_dir.as_deref()).await;

	let target = select_target(&endpoints, &args.instance_id)?;

	debug!(
		ctx.log,
		"relaying stdio to {} (registry: {})",
		target.label(),
		user_data_path.display()
	);

	let (remote_read, remote_write) = connect_raw(target).await?;

	relay_bidirectional(
		tokio::io::stdin(),
		tokio::io::stdout(),
		remote_read,
		remote_write,
	)
	.await
	.map_err(|e| wrap(e, "relay failed"))?;

	Ok(0)
}

/// Picks the single live endpoint whose `instanceId` exactly matches
/// `instance_id`.
///
/// - No match: [`CodeError::UnknownAgentHostRelayTarget`] — covers both
///   "never existed" and "existed but its process has since exited"
///   (dead entries are already excluded by
///   [`agent_discovery::discover_live_endpoints`], so there's nothing
///   further to check here to satisfy "fail clearly if ... dead").
/// - More than one match: [`CodeError::AmbiguousAgentHostRelayTarget`].
///   `instanceId` is meant to be a globally unique identifier minted per
///   process (see `mint_connection_token`/instance-id generation in
///   `commands::agent_host`), so this should only ever happen if the
///   registry itself is corrupted; it is still handled explicitly rather
///   than silently picking one, since relaying stdio to the wrong
///   process is a much worse failure mode than erroring out.
fn select_target<'a>(
	endpoints: &'a [AgentHostEndpointMetadata],
	instance_id: &str,
) -> Result<&'a AgentHostEndpointMetadata, AnyError> {
	let mut matches = endpoints.iter().filter(|e| e.instance_id == instance_id);
	let first = matches
		.next()
		.ok_or_else(|| CodeError::UnknownAgentHostRelayTarget(instance_id.to_string()))?;

	if matches.next().is_some() {
		return Err(CodeError::AmbiguousAgentHostRelayTarget(instance_id.to_string()).into());
	}

	Ok(first)
}

/// Opens a raw (non-WebSocket) connection to `endpoint`'s address,
/// reusing the same [`crate::async_pipe`]/TCP primitives used elsewhere
/// in the crate, and returns it split into boxed read/write halves (the
/// same [`AcceptedRW`] shape the accept-side listener helpers produce),
/// so the caller doesn't need to care which concrete stream type was
/// used.
async fn connect_raw(endpoint: &AgentHostEndpointMetadata) -> Result<AcceptedRW, AnyError> {
	match &endpoint.endpoint {
		AgentHostEndpointAddress::Tcp { host, port } => {
			let dial = dial_host(Some(host));
			let stream = TcpStream::connect((dial, *port)).await.map_err(|e| {
				wrap(
					e,
					format!("failed to connect to agent host at {dial}:{port}"),
				)
			})?;
			let (read, write) = tokio::io::split(stream);
			Ok((
				Box::new(read) as Box<dyn AsyncRead + Send + Unpin>,
				Box::new(write) as Box<dyn AsyncWrite + Send + Unpin>,
			))
		}
		AgentHostEndpointAddress::Socket { path } => {
			let pipe = get_socket_rw_stream(Path::new(path)).await.map_err(|e| {
				wrap(
					e,
					format!("failed to connect to agent host socket at {path}"),
				)
			})?;
			let (read, write) = socket_stream_split(pipe);
			Ok((
				Box::new(read) as Box<dyn AsyncRead + Send + Unpin>,
				Box::new(write) as Box<dyn AsyncWrite + Send + Unpin>,
			))
		}
	}
}

/// Copies bytes in both directions between `(a_read, a_write)` and
/// `(b_read, b_write)` with no framing/interpretation of any kind,
/// returning as soon as either direction hits EOF or an error (typical
/// proxy behavior: once one side closes, the other half of the pipe has
/// nothing meaningful left to relay either).
///
/// Generic and decoupled from real stdio/sockets specifically so it can
/// be exercised in tests with cheap, deterministic in-memory
/// [`tokio::io::duplex`] pairs instead.
async fn relay_bidirectional<AR, AW, BR, BW>(
	mut a_read: AR,
	mut a_write: AW,
	mut b_read: BR,
	mut b_write: BW,
) -> std::io::Result<()>
where
	AR: AsyncRead + Unpin,
	AW: AsyncWrite + Unpin,
	BR: AsyncRead + Unpin,
	BW: AsyncWrite + Unpin,
{
	let a_to_b = tokio::io::copy(&mut a_read, &mut b_write);
	let b_to_a = tokio::io::copy(&mut b_read, &mut a_write);
	tokio::pin!(a_to_b, b_to_a);

	tokio::select! {
		r = &mut a_to_b => { r?; }
		r = &mut b_to_a => { r?; }
	}

	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::async_pipe::{get_socket_name, listen_socket_rw_stream};
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpListener;

	fn standalone_tcp(instance_id: &str, port: u16) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			instance_id.to_string(),
			"127.0.0.1".to_string(),
			port,
			"tok".to_string(),
			"1".to_string(),
			None,
			None,
		)
	}

	fn editor_socket(instance_id: &str, path: &str) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata {
			schema_version:
				crate::tunnels::agent_host_registry::AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: crate::tunnels::agent_host_registry::AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: instance_id.to_string(),
			protocol_version: "1".to_string(),
			connection_token: "tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: path.to_string(),
			},
			quality: None,
			tunnel_name: None,
		}
	}

	#[test]
	fn select_target_returns_the_exact_instance_id_match() {
		let endpoints = vec![standalone_tcp("a", 1), standalone_tcp("b", 2)];
		let selected = select_target(&endpoints, "b").unwrap();
		assert_eq!(selected.instance_id, "b");
		assert_eq!(
			selected.endpoint,
			AgentHostEndpointAddress::Tcp {
				host: "127.0.0.1".to_string(),
				port: 2,
			}
		);
	}

	#[test]
	fn select_target_considers_editor_entries_too() {
		let endpoints = vec![standalone_tcp("a", 1), editor_socket("e", "/tmp/e.sock")];
		let selected = select_target(&endpoints, "e").unwrap();
		assert_eq!(selected.instance_id, "e");
		assert_eq!(
			selected.endpoint,
			AgentHostEndpointAddress::Socket {
				path: "/tmp/e.sock".to_string()
			}
		);
	}

	#[test]
	fn select_target_errors_clearly_when_missing() {
		let endpoints = vec![standalone_tcp("a", 1)];
		let err = select_target(&endpoints, "missing").unwrap_err();
		assert!(matches!(
			err,
			AnyError::CodeError(CodeError::UnknownAgentHostRelayTarget(ref id)) if id == "missing"
		));
	}

	#[test]
	fn select_target_errors_clearly_when_ambiguous() {
		// Data-integrity edge case: two live entries sharing an
		// instanceId should never happen in practice, but must not
		// silently pick one if the registry ever ends up in this state.
		let endpoints = vec![standalone_tcp("dup", 1), standalone_tcp("dup", 2)];
		let err = select_target(&endpoints, "dup").unwrap_err();
		assert!(matches!(
			err,
			AnyError::CodeError(CodeError::AmbiguousAgentHostRelayTarget(ref id)) if id == "dup"
		));
	}

	#[test]
	fn select_target_missing_on_empty_registry() {
		let err = select_target(&[], "anything").unwrap_err();
		assert!(matches!(
			err,
			AnyError::CodeError(CodeError::UnknownAgentHostRelayTarget(_))
		));
	}

	#[tokio::test]
	async fn relay_bidirectional_copies_both_directions_and_stops_on_close() {
		let (a_read, mut a_write_remote) = tokio::io::duplex(64);
		let (mut a_read_remote, a_write) = tokio::io::duplex(64);
		let (b_read, mut b_write_remote) = tokio::io::duplex(64);
		let (mut b_read_remote, b_write) = tokio::io::duplex(64);

		let relay = tokio::spawn(relay_bidirectional(a_read, a_write, b_read, b_write));

		// a -> b
		a_write_remote.write_all(b"ping").await.unwrap();
		let mut buf = [0u8; 4];
		b_read_remote.read_exact(&mut buf).await.unwrap();
		assert_eq!(&buf, b"ping");

		// b -> a
		b_write_remote.write_all(b"pong").await.unwrap();
		let mut buf = [0u8; 4];
		a_read_remote.read_exact(&mut buf).await.unwrap();
		assert_eq!(&buf, b"pong");

		// Closing one remote side should make the relay finish, since
		// there's nothing further to copy in that direction and a real
		// bidirectional pipe/socket peer closing means the whole
		// connection is going away.
		drop(a_write_remote);
		drop(b_write_remote);
		relay.await.unwrap().unwrap();
	}

	#[tokio::test]
	async fn connect_raw_reaches_a_real_tcp_endpoint() {
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let port = listener.local_addr().unwrap().port();

		let server = tokio::spawn(async move {
			let (mut stream, _) = listener.accept().await.unwrap();
			let mut buf = [0u8; 5];
			stream.read_exact(&mut buf).await.unwrap();
			stream.write_all(&buf).await.unwrap();
		});

		let endpoint = standalone_tcp("tcp-instance", port);
		let (mut read, mut write) = connect_raw(&endpoint).await.unwrap();
		write.write_all(b"hello").await.unwrap();
		let mut buf = [0u8; 5];
		read.read_exact(&mut buf).await.unwrap();
		assert_eq!(&buf, b"hello");

		server.await.unwrap();
	}

	#[tokio::test]
	async fn connect_raw_reaches_a_real_socket_endpoint() {
		let path = get_socket_name();
		let mut listener = listen_socket_rw_stream(&path).await.unwrap();

		let server = tokio::spawn(async move {
			let mut pipe = listener.accept().await.unwrap();
			let mut buf = [0u8; 5];
			pipe.read_exact(&mut buf).await.unwrap();
			pipe.write_all(&buf).await.unwrap();
		});

		let endpoint = editor_socket("socket-instance", path.to_str().unwrap());
		let (mut read, mut write) = connect_raw(&endpoint).await.unwrap();
		write.write_all(b"hello").await.unwrap();
		let mut buf = [0u8; 5];
		read.read_exact(&mut buf).await.unwrap();
		assert_eq!(&buf, b"hello");

		server.await.unwrap();

		#[cfg(unix)]
		let _ = std::fs::remove_file(&path);
	}
}
