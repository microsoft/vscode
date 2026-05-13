/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;

use ahp::{Client, Transport, TransportError, TransportMessage};
use ahp_types::commands::{AuthenticateParams, AuthenticateResult};
use ahp_types::errors::ahp_error_codes;
use ahp_types::state::ProtectedResourceMetadata;
use ahp_types::PROTOCOL_VERSION;
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

use crate::auth::{Auth, AuthProvider};
use crate::constants::AGENT_HOST_PORT;
use crate::log;
use crate::tunnels::dev_tunnels::DevTunnels;
use crate::util::errors::{wrap, AnyError, CodeError};
use crate::util::machine::process_exists;

use super::agent_host::AgentHostLockData;
use super::CommandContext;

/// Connects to an agent host, initializes the AHP session, and returns
/// the ready-to-use client. If an explicit `address` is given it is used
/// directly; if `tunnel_name` is given, the tunnel is looked up via the
/// dev tunnels API; otherwise the lockfile written by `code agent host`
/// is read to discover the local instance.
///
/// The returned client has been initialized but **not** authenticated.
/// Use [`request_with_auth`] to issue commands that may require auth.
pub async fn connect(
	ctx: &CommandContext,
	address: Option<&str>,
	tunnel_name: Option<&str>,
) -> Result<Client, AnyError> {
	let client = match (address, tunnel_name) {
		(Some(addr), _) => connect_ws(addr).await?,
		(None, Some(name)) => connect_via_tunnel(ctx, name).await?,
		(None, None) => {
			let addr = resolve_address_from_lockfile(ctx)?;
			connect_ws(&addr).await?
		}
	};

	client
		.initialize("code-cli".into(), PROTOCOL_VERSION as i64, vec![])
		.await
		.map_err(|e| wrap(e, "AHP initialize failed"))?;

	Ok(client)
}

/// Opens a WebSocket connection and creates an AHP client.
async fn connect_ws(address: &str) -> Result<Client, AnyError> {
	let transport = ahp_ws::WebSocketTransport::connect(address)
		.await
		.map_err(|e| wrap(e, format!("Failed to connect to agent host at {address}")))?;

	Client::connect(transport, ahp::ClientConfig::default())
		.await
		.map_err(|e| wrap(e, "Failed to establish AHP session").into())
}

/// Connects to an agent host over a dev tunnel relay. Looks up the tunnel
/// by name, opens a direct-tcpip channel to the agent host port, performs
/// a WebSocket handshake over the raw stream, then creates an AHP client.
async fn connect_via_tunnel(ctx: &CommandContext, name: &str) -> Result<Client, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);

	let (port_conn, _relay_handle) = dt.connect_to_tunnel_port(name, AGENT_HOST_PORT).await?;

	let rw = port_conn.into_rw();
	let (ws_stream, _) = tokio_tungstenite::client_async("ws://localhost/", rw)
		.await
		.map_err(|e| wrap(e, "WebSocket handshake over tunnel failed"))?;

	let transport = TunnelWsTransport {
		inner: ws_stream,
		// Keep the relay handle alive so the SSH session isn't dropped.
		_relay_handle,
	};

	Client::connect(transport, ahp::ClientConfig::default())
		.await
		.map_err(|e| wrap(e, "Failed to establish AHP session over tunnel").into())
}

/// A [`Transport`] backed by a WebSocket stream running over a tunnel
/// relay channel (via `PortConnectionRW`).
struct TunnelWsTransport {
	inner: tokio_tungstenite::WebSocketStream<tunnels::connections::PortConnectionRW>,
	/// Prevent the relay handle from being dropped, which would close the
	/// underlying SSH session.
	_relay_handle: tunnels::connections::ClientRelayHandle,
}

impl Transport for TunnelWsTransport {
	async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
		let frame = match msg {
			TransportMessage::Parsed(m) => {
				let s = serde_json::to_string(&m)
					.map_err(|e| TransportError::Protocol(e.to_string()))?;
				Message::Text(s.into())
			}
			TransportMessage::Text(s) => Message::Text(s.into()),
			TransportMessage::Binary(b) => Message::Binary(b.into()),
		};
		self.inner
			.send(frame)
			.await
			.map_err(|e| TransportError::Io(e.to_string()))
	}

	async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
		loop {
			match self.inner.next().await {
				None => return Ok(None),
				Some(Err(e)) => return Err(TransportError::Io(e.to_string())),
				Some(Ok(Message::Text(s))) => {
					return Ok(Some(TransportMessage::Text(s.to_string())))
				}
				Some(Ok(Message::Binary(b))) => {
					return Ok(Some(TransportMessage::Binary(b.to_vec())))
				}
				Some(Ok(Message::Close(_))) => return Ok(None),
				Some(Ok(_)) => continue,
			}
		}
	}

	async fn close(&mut self) -> Result<(), TransportError> {
		self.inner
			.close(None)
			.await
			.map_err(|e| TransportError::Io(e.to_string()))
	}
}

/// Issues a JSON-RPC request, automatically handling `-32007` auth errors
/// by running the device-flow login and retrying once.
pub async fn request_with_auth<P, R>(
	ctx: &CommandContext,
	client: &Client,
	method: &str,
	params: P,
) -> Result<R, AnyError>
where
	P: serde::Serialize + Clone,
	R: serde::de::DeserializeOwned,
{
	match client.request::<P, R>(method, params.clone()).await {
		Ok(r) => Ok(r),
		Err(ref e) if is_auth_required(e) => {
			debug!(
				ctx.log,
				"Server requires authentication, starting login flow..."
			);
			authenticate_from_error(ctx, client, e).await?;
			client
				.request::<P, R>(method, params)
				.await
				.map_err(|e| wrap(e, format!("Failed after authentication: {method}")).into())
		}
		Err(e) => Err(wrap(e, format!("Request failed: {method}")).into()),
	}
}

fn is_auth_required(err: &ahp::ClientError) -> bool {
	matches!(err, ahp::ClientError::Rpc(e) if e.code == ahp_error_codes::AUTH_REQUIRED)
}

fn parse_protected_resources(err: &ahp::ClientError) -> Vec<ProtectedResourceMetadata> {
	if let ahp::ClientError::Rpc(e) = err {
		if let Some(data) = &e.data {
			if let Ok(resources) =
				serde_json::from_value::<Vec<ProtectedResourceMetadata>>(data.clone())
			{
				return resources;
			}
		}
	}
	Vec::new()
}

fn provider_for_resource(resource: &ProtectedResourceMetadata) -> Option<AuthProvider> {
	for server in resource
		.authorization_servers
		.as_deref()
		.unwrap_or_default()
	{
		if server.contains("github.com") {
			return Some(AuthProvider::Github);
		}
		if server.contains("microsoftonline.com") || server.contains("login.microsoft.com") {
			return Some(AuthProvider::Microsoft);
		}
	}
	None
}

async fn authenticate_from_error(
	ctx: &CommandContext,
	client: &Client,
	err: &ahp::ClientError,
) -> Result<(), AnyError> {
	let resources = parse_protected_resources(err);
	if resources.is_empty() {
		return Err(wrap(
			"Server returned AuthRequired but did not include protected resource metadata",
			"Cannot determine authentication provider",
		)
		.into());
	}

	let auth = Auth::with_namespace(&ctx.paths, ctx.log.clone(), Some("agent-host".into()));

	for resource in &resources {
		let provider = provider_for_resource(resource);
		let scopes = resource.scopes_supported.as_ref().map(|s| s.join("+"));

		// Reuse a stored credential from the namespace if one exists; only
		// start a device-flow login when there is nothing cached.
		let credential = match auth.get_current_credential() {
			Ok(Some(existing)) => existing,
			_ => match provider {
				Some(p) => auth.login_with_scopes(p, scopes).await?,
				None => auth.get_credential().await?,
			},
		};

		let _: AuthenticateResult = client
			.request(
				"authenticate",
				AuthenticateParams {
					resource: resource.resource.clone(),
					token: credential.access_token().to_string(),
				},
			)
			.await
			.map_err(|e| {
				wrap(
					e,
					format!("AHP authenticate failed for {}", resource.resource),
				)
			})?;
	}

	Ok(())
}

fn resolve_address_from_lockfile(ctx: &CommandContext) -> Result<String, AnyError> {
	let lockfile_path = ctx.paths.agent_host_lockfile();

	let data = fs::read_to_string(&lockfile_path).map_err(|e| {
		wrap(
			e,
			"No running agent host found. Start one with `code agent host` or specify --address",
		)
	})?;

	let lock: AgentHostLockData = serde_json::from_str(&data).map_err(|e| {
		wrap(
			e,
			format!("Corrupt agent host lockfile at {}", lockfile_path.display()),
		)
	})?;

	if !process_exists(lock.pid) {
		let _ = fs::remove_file(&lockfile_path);
		return Err(CodeError::NoRunningAgentHost.into());
	}

	let mut url = lock.address;
	if let Some(token) = &lock.connection_token {
		url.push_str(&format!("?tkn={token}"));
	}
	Ok(url)
}
