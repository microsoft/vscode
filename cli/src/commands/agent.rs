/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::LazyLock;

use ahp::{Client, Transport, TransportError, TransportMessage};
use ahp_types::commands::{AuthenticateParams, AuthenticateResult};
use ahp_types::errors::ahp_error_codes;
use ahp_types::state::ProtectedResourceMetadata;
use ahp_types::{PROTOCOL_VERSION, ROOT_RESOURCE_URI};
use futures::{SinkExt, StreamExt};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::Mutex as AsyncMutex;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, WebSocketStream};

use crate::async_pipe::get_socket_rw_stream;
use crate::auth::{Auth, AuthProvider};
use crate::constants::AGENT_HOST_PORT;
use crate::log;
use crate::tunnels::agent_host_registry::{AgentHostEndpointAddress, AgentHostEndpointMetadata};
use crate::tunnels::dev_tunnels::DevTunnels;
use crate::util::errors::{wrap, AnyError};

use super::CommandContext;

/// Connects to an agent host at an explicit `--address` or `--tunnel`
/// target, initializes the AHP session, and returns the ready-to-use
/// client. If `address` is given it is used directly; otherwise
/// `tunnel_name` is looked up via the dev tunnels API.
///
/// This is deliberately explicit-target-only: automatic discovery of a
/// local standalone/editor instance lives in
/// [`super::agent_discovery`] instead (see
/// [`super::agent_discovery::discover_live_endpoints`] and
/// [`super::agent_discovery::connect_to_session_host`]). Every call site
/// already branches to one of those before falling through here, so
/// passing neither `address` nor `tunnel_name` is a caller bug, not a
/// "no target given" case to recover from silently.
///
/// The returned client has been initialized but **not** authenticated.
/// Use [`request_with_auth`] to issue commands that may require auth.
pub async fn connect_explicit(
	ctx: &CommandContext,
	address: Option<&str>,
	tunnel_name: Option<&str>,
) -> Result<Client, AnyError> {
	let client = match (address, tunnel_name) {
		(Some(addr), _) => connect_ws(addr).await?,
		(None, Some(name)) => connect_via_tunnel(ctx, name).await?,
		(None, None) => unreachable!(
			"connect_explicit requires --address or --tunnel; callers must route \
			 the no-target case through agent_discovery instead"
		),
	};

	initialize_client(&client).await?;
	Ok(client)
}

/// Connects to a specific registry-discovered endpoint (used by
/// multi-host auto-discovery in `ps`/`logs`/`stop`/`kill`). Dispatches to
/// a `tcp` WebSocket connection or a `socket`/named-pipe raw-stream
/// WebSocket handshake depending on the endpoint's address kind, and
/// always includes the endpoint's connection token as the `tkn` query
/// parameter, matching the wire convention documented in
/// `LOCAL_ENDPOINT.md`.
///
/// Like [`connect_explicit`], the returned client is initialized but not yet
/// authenticated; use [`request_with_auth`] for calls that may need it.
pub async fn connect_to_endpoint(endpoint: &AgentHostEndpointMetadata) -> Result<Client, AnyError> {
	let client = match &endpoint.endpoint {
		AgentHostEndpointAddress::Tcp { host, port } => {
			let dial_host = crate::commands::agent_host::dial_host(Some(host));
			let mut url = format!("ws://{dial_host}:{port}/");
			if !endpoint.connection_token.is_empty() {
				url.push_str(&format!("?tkn={}", endpoint.connection_token));
			}
			connect_ws(&url).await?
		}
		AgentHostEndpointAddress::Socket { path } => {
			connect_ws_over_socket(path, &endpoint.connection_token).await?
		}
	};

	initialize_client(&client).await?;
	Ok(client)
}

/// Shared final step of establishing an AHP session: performs the
/// protocol `initialize` handshake common to every connection kind.
async fn initialize_client(client: &Client) -> Result<(), AnyError> {
	client
		.initialize(
			"code-cli".into(),
			vec![PROTOCOL_VERSION.to_string()],
			vec![],
		)
		.await
		.map_err(|e| wrap(e, "AHP initialize failed"))?;
	Ok(())
}

/// Opens a WebSocket connection and creates an AHP client.
async fn connect_ws(address: &str) -> Result<Client, AnyError> {
	let (ws_stream, _) = connect_async(address)
		.await
		.map_err(|e| wrap(e, format!("Failed to connect to agent host at {address}")))?;

	let transport = WsTransport::new(ws_stream, ());

	Client::connect(transport, ahp::ClientConfig::default())
		.await
		.map_err(|e| wrap(e, "Failed to establish AHP session").into())
}

/// Opens a raw-stream WebSocket connection over a Unix domain socket
/// (Unix) or named pipe (Windows) using the existing [`async_pipe`]
/// abstraction, mirroring the tunnel raw-stream handshake in
/// [`connect_via_tunnel`]. This is how the CLI reaches `editor`-owned
/// registry endpoints, which are never TCP.
async fn connect_ws_over_socket(path: &str, connection_token: &str) -> Result<Client, AnyError> {
	let pipe = get_socket_rw_stream(std::path::Path::new(path))
		.await
		.map_err(|e| {
			wrap(
				e,
				format!("Failed to connect to agent host socket at {path}"),
			)
		})?;

	let mut url = "ws://localhost/".to_string();
	if !connection_token.is_empty() {
		url.push_str(&format!("?tkn={connection_token}"));
	}

	let (ws_stream, _) = tokio_tungstenite::client_async(url, pipe)
		.await
		.map_err(|e| wrap(e, format!("WebSocket handshake over socket {path} failed")))?;

	let transport = WsTransport::new(ws_stream, ());

	Client::connect(transport, ahp::ClientConfig::default())
		.await
		.map_err(|e| wrap(e, "Failed to establish AHP session over socket").into())
}

/// A [`Transport`] backed by a `tokio-tungstenite` WebSocket stream.
///
/// `_guard` keeps an auxiliary resource alive for the lifetime of the
/// transport; the tunnel connection uses it to retain the relay handle so
/// the underlying SSH session isn't dropped. Use `()` when no such
/// resource is needed.
struct WsTransport<S, G = ()> {
	inner: WebSocketStream<S>,
	_guard: G,
}

impl<S, G> WsTransport<S, G> {
	fn new(inner: WebSocketStream<S>, guard: G) -> Self {
		Self {
			inner,
			_guard: guard,
		}
	}
}

impl<S, G> Transport for WsTransport<S, G>
where
	S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
	G: Send + 'static,
{
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

/// Connects to an agent host over a dev tunnel relay. Looks up the tunnel
/// by name, opens a direct-tcpip channel to the agent host port, performs
/// a WebSocket handshake over the raw stream, then creates an AHP client.
async fn connect_via_tunnel(ctx: &CommandContext, name: &str) -> Result<Client, AnyError> {
	let auth = Auth::new(&ctx.paths, ctx.log.clone());
	let mut dt = DevTunnels::new_remote_tunnel(&ctx.log, auth, &ctx.paths);

	let (port_conn, relay_handle) = dt.connect_to_tunnel_port(name, AGENT_HOST_PORT).await?;

	let rw = port_conn.into_rw();
	let (ws_stream, _) = tokio_tungstenite::client_async("ws://localhost/", rw)
		.await
		.map_err(|e| wrap(e, "WebSocket handshake over tunnel failed"))?;

	// Keep the relay handle alive so the SSH session isn't dropped.
	let transport = WsTransport::new(ws_stream, relay_handle);

	Client::connect(transport, ahp::ClientConfig::default())
		.await
		.map_err(|e| wrap(e, "Failed to establish AHP session over tunnel").into())
}

/// Serializes the auth-retry branch of [`request_with_auth`] across
/// concurrently-queried hosts (see multi-host `ps`/`logs`/`stop`
/// discovery). Without this, two hosts hitting `AUTH_REQUIRED` at the
/// same time could each kick off a competing device-flow login. Callers
/// past the first still pay the lock wait, but
/// [`authenticate_from_error`] checks for a cached credential before
/// starting a new login, so only the first caller actually performs one;
/// the rest observe the cache and proceed immediately.
static AUTH_SERIALIZE: LazyLock<AsyncMutex<()>> = LazyLock::new(|| AsyncMutex::new(()));

/// Runs `authenticate` while holding [`AUTH_SERIALIZE`], releasing the
/// guard as soon as `authenticate` completes — *before* returning to the
/// caller. This is split out from [`request_with_auth`] specifically so
/// the guard is never accidentally held across the retried RPC that
/// follows: that RPC can be slow (or the host can be hung/unreachable),
/// and holding the lock across it would stall unrelated hosts' own
/// authentication attempts for no reason. Also split out so this
/// locking behavior can be exercised directly in tests without needing
/// a live AHP client.
async fn serialize_auth<T, F, Fut>(authenticate: F) -> T
where
	F: FnOnce() -> Fut,
	Fut: std::future::Future<Output = T>,
{
	let _guard = AUTH_SERIALIZE.lock().await;
	authenticate().await
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
			serialize_auth(|| authenticate_from_error(ctx, client, e)).await?;
			// Deliberately outside `serialize_auth`'s guard: this retry
			// can be slow or hang if the host is unreachable, and must
			// not block other hosts' concurrent authentication.
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
					channel: ROOT_RESOURCE_URI.to_string(),
					resource: resource.resource.clone(),
					token: credential.access_token().to_string(),
					scopes: None,
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

#[cfg(test)]
mod tests {
	use super::*;
	use crate::async_pipe::{get_socket_name, listen_socket_rw_stream};

	/// Exercises the real Unix-socket/named-pipe raw-stream WebSocket
	/// handshake used to reach `editor`-owned (and socket-based
	/// standalone) registry endpoints, using the same cross-platform
	/// [`async_pipe`] listener/accept pattern already established for
	/// this abstraction elsewhere in the crate (see
	/// `tunnels::agent_host` tests), rather than mocking the transport.
	#[tokio::test]
	async fn connect_ws_over_socket_completes_handshake_over_a_real_socket() {
		let path = get_socket_name();
		let mut listener = listen_socket_rw_stream(&path).await.unwrap();

		let server = tokio::spawn(async move {
			let pipe = listener.accept().await.unwrap();
			// Accepting the WS handshake server-side is enough to prove
			// the client's raw-stream `client_async` handshake (with the
			// `?tkn=` connection token in the URL) completes correctly
			// against a real listener; `Client::connect` itself never
			// blocks on server behavior past that.
			let _ws = tokio_tungstenite::accept_async(pipe).await.unwrap();
		});

		let client = connect_ws_over_socket(path.to_str().unwrap(), "test-token").await;
		assert!(client.is_ok(), "expected Ok, got {:?}", client.err());

		server.await.unwrap();

		#[cfg(unix)]
		let _ = std::fs::remove_file(&path);
	}

	/// Regression test for the `AUTH_SERIALIZE` scoping fix: the guard
	/// must be released as soon as `authenticate` finishes, *not* held
	/// across whatever the caller does afterwards (in production, the
	/// retried RPC). Otherwise a slow/hung host's post-auth retry could
	/// stall an unrelated host's own authentication attempt. We can't
	/// easily stand up two real AHP `Client`s here, so this exercises
	/// `serialize_auth` directly: task A's simulated "retry" (a long
	/// sleep performed *after* `serialize_auth` returns) must not block
	/// task B's concurrent `serialize_auth` call.
	#[tokio::test]
	async fn serialize_auth_releases_guard_before_caller_retries() {
		let host_a = tokio::spawn(async {
			serialize_auth(|| async {}).await;
			// Simulates a slow/hung host's retried RPC, which happens
			// *after* the guard should already have been released.
			tokio::time::sleep(std::time::Duration::from_millis(300)).await;
		});

		// Give host A a head start so it acquires the guard first.
		tokio::time::sleep(std::time::Duration::from_millis(20)).await;

		// If the guard were (incorrectly) held across host A's simulated
		// retry, this would time out; with the fix it resolves almost
		// immediately since the guard was already released.
		let host_b = tokio::time::timeout(std::time::Duration::from_millis(150), async {
			serialize_auth(|| async {}).await;
		})
		.await;

		assert!(
			host_b.is_ok(),
			"host B's authenticate must not wait for host A's retry"
		);

		host_a.await.unwrap();
	}
}
