/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Shared multi-host discovery helpers for `code agent ps|logs|stop`.
//!
//! `code agent host` supervisors (standalone) and running VS Code windows
//! (editor) each publish a live entry to the shared local agent-host
//! endpoint registry (schema v2; see
//! [`crate::tunnels::agent_host_registry`]). When the user doesn't pin a
//! specific `--address`/`--tunnel`, these commands should consider *every*
//! live entry a candidate host, not just one arbitrarily selected one —
//! that's what this module coordinates.

use ahp::Client;
use ahp_types::commands::{ListSessionsParams, ListSessionsResult};
use ahp_types::ROOT_RESOURCE_URI;
use futures::stream::FuturesUnordered;
use futures::StreamExt;

use crate::log;
use crate::tunnels::agent_host_registry::{self, AgentHostEndpointMetadata};
use crate::tunnels::user_data_path::resolve_user_data_path;
use crate::util::errors::{AnyError, CodeError};

use super::agent;
use super::CommandContext;

/// Enumerates every live schema-v2 registry endpoint (both `editor` and
/// `standalone`, both socket/pipe and TCP addresses) as auto-discovery
/// candidates. The shared registry is the sole source of truth for
/// automatic discovery; callers should treat an empty `Vec` as "no agent
/// host is currently running" ([`CodeError::NoRunningAgentHost`]) rather
/// than falling back to any other discovery mechanism.
pub async fn discover_live_endpoints(
	ctx: &CommandContext,
	user_data_dir: Option<&str>,
) -> Vec<AgentHostEndpointMetadata> {
	let user_data_path = resolve_user_data_path(user_data_dir);
	trace!(
		ctx.log,
		"discovering live agent hosts in {}",
		user_data_path.display()
	);
	agent_host_registry::list_live_endpoints(&ctx.log, &user_data_path).await
}

/// Outcome of probing a single host for a given session, as consumed by
/// [`resolve_first_match`]. Generic over the "found" payload `T` (rather
/// than hard-coding a live [`Client`]) purely so the early-return/
/// cancellation control flow in [`resolve_first_match`] can be exercised
/// directly in tests with cheap, deterministic fake futures instead of a
/// real AHP connection.
enum ProbeResult<T> {
	/// Connected and queried successfully; the session was present. The
	/// payload is whatever the caller wants back for the matching host
	/// (a ready-to-use [`Client`] in production).
	Found(T),
	/// Connected and queried successfully; the session was not present.
	NotFound,
	/// The host could not be connected to or queried at all (network
	/// error, auth failure, protocol error, ...). Nothing can be
	/// concluded about whether it owns the session; its label is kept
	/// for diagnostics.
	Unreachable(String),
}

/// Failure produced by [`resolve_first_match`] when no host matched.
#[derive(Debug, Clone, PartialEq, Eq)]
enum SearchFailure {
	/// Every host was searched successfully and none owns the session:
	/// safe to report "session not found".
	NotFound,
	/// At least one host could not be searched (its label recorded
	/// here), and no host that *could* be searched owned the session. We
	/// must not claim the session doesn't exist — it might live on the
	/// host(s) we couldn't reach.
	Incomplete(Vec<String>),
}

/// Consumes host-probe results as they complete, returning the payload
/// from the first match *immediately*: dropping `probes` (which happens
/// as soon as this function returns) cancels any probes still in flight,
/// so a hung or unreachable host can never delay `logs`/`stop` once a
/// match is found on a faster host. A `Found` anywhere takes precedence
/// over `Unreachable` elsewhere: once we have a definitive match we
/// don't need to care that some other host was unreachable. When
/// nothing matches, returns [`SearchFailure::NotFound`] if every host
/// was searched successfully, or [`SearchFailure::Incomplete`] (carrying
/// the unreachable hosts' labels) if at least one host could not be
/// searched.
async fn resolve_first_match<T, F>(mut probes: FuturesUnordered<F>) -> Result<T, SearchFailure>
where
	F: std::future::Future<Output = ProbeResult<T>>,
{
	let mut unreachable_labels = Vec::new();

	while let Some(probe) = probes.next().await {
		match probe {
			ProbeResult::Found(payload) => return Ok(payload),
			ProbeResult::NotFound => {}
			ProbeResult::Unreachable(label) => unreachable_labels.push(label),
		}
	}

	if unreachable_labels.is_empty() {
		Err(SearchFailure::NotFound)
	} else {
		Err(SearchFailure::Incomplete(unreachable_labels))
	}
}

/// Connects to `endpoint` and checks whether `session` appears in its
/// `listSessions` catalog — membership, not error-text sniffing, is the
/// source of truth per requirement. On success but no match, or on any
/// failure, the client (if any) is shut down before returning so callers
/// never need to remember to clean up non-matching connections.
async fn probe_host(
	ctx: &CommandContext,
	endpoint: AgentHostEndpointMetadata,
	session: &str,
) -> ProbeResult<Client> {
	let label = endpoint.label();

	let client = match agent::connect_to_endpoint(&endpoint).await {
		Ok(client) => client,
		Err(e) => {
			warning!(ctx.log, "Could not connect to agent host {}: {}", label, e);
			return ProbeResult::Unreachable(label);
		}
	};

	let listed: Result<ListSessionsResult, AnyError> = agent::request_with_auth(
		ctx,
		&client,
		"listSessions",
		ListSessionsParams {
			channel: ROOT_RESOURCE_URI.to_string(),
			limit: None,
			cursor: None,
		},
	)
	.await;

	match listed {
		Ok(r) if r.items.iter().any(|s| s.resource == session) => ProbeResult::Found(client),
		Ok(_) => {
			client.shutdown().await;
			ProbeResult::NotFound
		}
		Err(e) => {
			warning!(
				ctx.log,
				"Could not search agent host {} for session {}: {}",
				label,
				session,
				e
			);
			client.shutdown().await;
			ProbeResult::Unreachable(label)
		}
	}
}

/// Shared auto-discovery entry point for session-targeted commands
/// (`logs`, `stop`). Searches every live registry endpoint concurrently
/// for `session`, preferring `listSessions` catalog membership over
/// error-text sniffing, and returns a ready-to-use client for whichever
/// host owns it as soon as that host responds — it does not wait for
/// slower or hung hosts once a match is found. Unused/non-matching
/// clients are shut down before this returns; any probes still in
/// flight when a match is found are cancelled (never leaked) by simply
/// dropping them.
///
/// Returns [`CodeError::NoRunningAgentHost`] when the shared registry has
/// no live endpoints at all — the sole source of truth for automatic
/// discovery.
///
/// Callers with an explicit `--address`/`--tunnel` should call
/// [`agent::connect_explicit`] directly instead of this helper; this
/// path is only for auto-discovery.
pub async fn connect_to_session_host(
	ctx: &CommandContext,
	session: &str,
	user_data_dir: Option<&str>,
) -> Result<Client, AnyError> {
	let endpoints = discover_live_endpoints(ctx, user_data_dir).await;

	if endpoints.is_empty() {
		return Err(CodeError::NoRunningAgentHost.into());
	}

	let probes = FuturesUnordered::new();
	for endpoint in endpoints {
		probes.push(probe_host(ctx, endpoint, session));
	}

	match resolve_first_match(probes).await {
		Ok(client) => Ok(client),
		Err(SearchFailure::NotFound) => {
			Err(CodeError::SessionNotFoundOnAnyHost(session.to_string()).into())
		}
		Err(SearchFailure::Incomplete(unreachable_labels)) => Err(
			CodeError::IncompleteSessionSearch(session.to_string(), unreachable_labels.join(", "))
				.into(),
		),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	/// A fake host probe used by [`resolve_first_match`] tests: same
	/// concrete future type regardless of arguments (required to share a
	/// single [`FuturesUnordered`]), optionally sleeping first to
	/// simulate a slow/hung host, and optionally flipping `completed`
	/// so a test can assert it was never driven to completion.
	async fn fake_probe(
		delay: Option<std::time::Duration>,
		result: ProbeResult<u32>,
		completed: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
	) -> ProbeResult<u32> {
		if let Some(delay) = delay {
			tokio::time::sleep(delay).await;
		}
		if let Some(completed) = completed {
			completed.store(true, std::sync::atomic::Ordering::SeqCst);
		}
		result
	}

	#[tokio::test]
	async fn resolve_first_match_returns_immediately_and_cancels_remaining_probes() {
		use std::sync::atomic::{AtomicBool, Ordering};
		use std::sync::Arc;
		use std::time::Duration;

		let hung_probe_completed = Arc::new(AtomicBool::new(false));

		let probes = FuturesUnordered::new();
		probes.push(fake_probe(None, ProbeResult::Found(42), None));
		probes.push(fake_probe(
			// Long enough that if it were ever awaited to completion the
			// test would time out; the fix must never wait on it.
			Some(Duration::from_secs(3600)),
			ProbeResult::Unreachable("slow-host".to_string()),
			Some(hung_probe_completed.clone()),
		));

		let outcome = tokio::time::timeout(Duration::from_millis(200), resolve_first_match(probes))
			.await
			.expect("resolve_first_match must not wait on the hung probe")
			.expect("expected the fast host's match");

		assert_eq!(outcome, 42);
		assert!(
			!hung_probe_completed.load(Ordering::SeqCst),
			"the hung probe's future must be dropped/cancelled, not run to completion"
		);
	}

	#[tokio::test]
	async fn resolve_first_match_prefers_found_even_when_seen_after_unreachable() {
		use std::time::Duration;

		// The first probe to complete is Unreachable; a slightly slower
		// probe later resolves with a match. A `Found` anywhere must
		// still win over an already-observed `Unreachable`.
		let probes = FuturesUnordered::new();
		probes.push(fake_probe(
			None,
			ProbeResult::Unreachable("host-a".to_string()),
			None,
		));
		probes.push(fake_probe(
			Some(Duration::from_millis(10)),
			ProbeResult::Found(7),
			None,
		));

		let outcome = resolve_first_match(probes)
			.await
			.expect("expected the delayed match to win");
		assert_eq!(outcome, 7);
	}

	#[tokio::test]
	async fn resolve_first_match_is_not_found_when_every_host_was_searched() {
		let probes = FuturesUnordered::new();
		probes.push(fake_probe(None, ProbeResult::NotFound, None));
		probes.push(fake_probe(None, ProbeResult::NotFound, None));

		let err = resolve_first_match::<u32, _>(probes)
			.await
			.expect_err("no host matched, so this should be an Err");
		assert_eq!(err, SearchFailure::NotFound);
	}

	#[tokio::test]
	async fn resolve_first_match_is_incomplete_when_a_host_could_not_be_searched() {
		let probes = FuturesUnordered::new();
		probes.push(fake_probe(None, ProbeResult::NotFound, None));
		probes.push(fake_probe(
			None,
			ProbeResult::Unreachable("host-b".to_string()),
			None,
		));

		let err = resolve_first_match::<u32, _>(probes)
			.await
			.expect_err("no host matched, so this should be an Err");
		assert_eq!(err, SearchFailure::Incomplete(vec!["host-b".to_string()]));
	}
}
