/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use ahp_types::commands::{ListSessionsParams, ListSessionsResult};
use ahp_types::state::{SessionStatus, SessionSummary};
use ahp_types::ROOT_RESOURCE_URI;
use futures::stream::FuturesUnordered;
use futures::StreamExt;
use serde::Serialize;

use crate::log;
use crate::tunnels::agent_host_registry::AgentHostEndpointMetadata;
use crate::util::errors::{wrap, AnyError, CodeError};

use super::agent;
use super::agent_discovery;
use super::args::AgentPsArgs;
use super::output::{self, Styles};
use super::CommandContext;

/// Lists active sessions on a running agent host.
///
/// With an explicit `--address`/`--tunnel`, this queries exactly one host
/// and prints its sessions with no host-provenance header, same as before
/// multi-host discovery existed. Otherwise every live registry endpoint
/// (both `editor` and `standalone`, both socket/pipe and TCP) is queried
/// concurrently; human output is printed as each host completes rather
/// than waiting for the slowest one, and `--json` collects every host's
/// outcome into a single valid JSON document tagged with host
/// provenance. Returns [`CodeError::NoRunningAgentHost`] when the shared
/// registry has no live entries at all — the sole source of truth for
/// automatic discovery.
pub async fn agent_ps(ctx: CommandContext, args: AgentPsArgs) -> Result<i32, AnyError> {
	if args.discovery.address.is_some() || args.discovery.tunnel.is_some() {
		return agent_ps_single(
			&ctx,
			&args,
			args.discovery.address.as_deref(),
			args.discovery.tunnel.as_deref(),
		)
		.await;
	}

	let endpoints =
		agent_discovery::discover_live_endpoints(&ctx, args.discovery.user_data_dir.as_deref());
	if endpoints.is_empty() {
		return Err(CodeError::NoRunningAgentHost.into());
	}

	agent_ps_multi(&ctx, &args, endpoints).await
}

/// Single-host path used for an explicit `--address`/`--tunnel`.
async fn agent_ps_single(
	ctx: &CommandContext,
	args: &AgentPsArgs,
	address: Option<&str>,
	tunnel: Option<&str>,
) -> Result<i32, AnyError> {
	let client = agent::connect_explicit(ctx, address, tunnel).await?;

	let result: ListSessionsResult = agent::request_with_auth(
		ctx,
		&client,
		"listSessions",
		ListSessionsParams {
			channel: ROOT_RESOURCE_URI.to_string(),
			filter: None,
		},
	)
	.await?;

	client.shutdown().await;

	let items = select_and_sort(&result.items, args.all);

	if args.json {
		let json = serde_json::to_string_pretty(&items)
			.map_err(|e| wrap(e, "Failed to serialize sessions"))?;
		output::print_paged(&json);
	} else if items.is_empty() {
		ctx.log.result("No active sessions.");
	} else {
		let out = format_sessions_list(&items);
		output::print_paged(&out);
	}

	Ok(0)
}

/// Outcome of querying one discovered host for its session list.
struct HostSessions {
	endpoint: AgentHostEndpointMetadata,
	sessions: Result<Vec<SessionSummary>, AnyError>,
}

async fn query_host(ctx: &CommandContext, endpoint: AgentHostEndpointMetadata) -> HostSessions {
	let sessions = query_host_sessions(ctx, &endpoint).await;
	HostSessions { endpoint, sessions }
}

async fn query_host_sessions(
	ctx: &CommandContext,
	endpoint: &AgentHostEndpointMetadata,
) -> Result<Vec<SessionSummary>, AnyError> {
	let client = agent::connect_to_endpoint(endpoint).await?;

	let result: ListSessionsResult = agent::request_with_auth(
		ctx,
		&client,
		"listSessions",
		ListSessionsParams {
			channel: ROOT_RESOURCE_URI.to_string(),
			filter: None,
		},
	)
	.await?;

	client.shutdown().await;
	Ok(result.items)
}

/// Multi-host auto-discovery path (requirement 3): connects to and
/// queries every discovered host concurrently via `FuturesUnordered`,
/// printing each host's results (human mode) as soon as that host
/// completes rather than waiting for the slowest one. Per-host failures
/// are reported as warnings and don't stop other hosts; the command only
/// returns an error if *no* host could be queried at all. `--json`
/// collects every host's outcome (success or error) before printing
/// once, so the emitted JSON is always a single valid document — never
/// corrupted by interleaving multiple hosts' output — tagged with host
/// provenance.
async fn agent_ps_multi(
	ctx: &CommandContext,
	args: &AgentPsArgs,
	endpoints: Vec<AgentHostEndpointMetadata>,
) -> Result<i32, AnyError> {
	let mut tasks = FuturesUnordered::new();
	for endpoint in endpoints {
		tasks.push(query_host(ctx, endpoint));
	}

	let mut any_succeeded = false;
	let mut collected: Vec<HostSessions> = Vec::new();

	while let Some(outcome) = tasks.next().await {
		match &outcome.sessions {
			Ok(_) => any_succeeded = true,
			Err(e) => {
				warning!(
					ctx.log,
					"Could not query agent host {}: {}",
					outcome.endpoint.label(),
					e
				);
			}
		}

		if args.json {
			collected.push(outcome);
		} else {
			print_host_outcome_human(&outcome, args.all);
		}
	}

	if !any_succeeded {
		return Err(CodeError::NoAgentHostReachable(
			"no discovered agent host could be queried".to_string(),
		)
		.into());
	}

	if args.json {
		let json = build_json_output(&collected, args.all)?;
		output::print_paged(&json);
	}

	Ok(0)
}

/// Prints one host's outcome immediately (bypasses the pager used by the
/// single-host path: paging would buffer output until the whole command
/// finishes, defeating the point of streaming results as hosts
/// complete).
fn print_host_outcome_human(outcome: &HostSessions, all: bool) {
	let header = Styles::title();
	println!(
		"\n{}",
		header.apply_to(format!("── {} ──", outcome.endpoint.label()))
	);

	match &outcome.sessions {
		Ok(sessions) => {
			let items = select_and_sort(sessions, all);
			if items.is_empty() {
				println!("  {}", Styles::muted().apply_to("No active sessions."));
			} else {
				print!("{}", format_sessions_list(&items));
			}
		}
		Err(e) => {
			println!("  {}", Styles::error().apply_to(format!("⚠ {e}")));
		}
	}
}

/// JSON-serializable host provenance tag, kept intentionally small and
/// stable (not just a re-export of [`AgentHostEndpointMetadata`], whose
/// shape is an internal implementation detail of the registry file).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostJson {
	#[serde(rename = "type")]
	server_type: &'static str,
	pid: u32,
	instance_id: String,
	address: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	quality: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	tunnel_name: Option<String>,
}

impl From<&AgentHostEndpointMetadata> for HostJson {
	fn from(e: &AgentHostEndpointMetadata) -> Self {
		HostJson {
			server_type: match e.server_type {
				crate::tunnels::agent_host_registry::AgentHostServerType::Editor => "editor",
				crate::tunnels::agent_host_registry::AgentHostServerType::Standalone => {
					"standalone"
				}
			},
			pid: e.pid,
			instance_id: e.instance_id.clone(),
			address: e.address_label(),
			quality: e.quality.clone(),
			tunnel_name: e.tunnel_name.clone(),
		}
	}
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostSessionsJson<'a> {
	host: HostJson,
	#[serde(skip_serializing_if = "Option::is_none")]
	sessions: Option<Vec<&'a SessionSummary>>,
	#[serde(skip_serializing_if = "Option::is_none")]
	error: Option<String>,
}

fn build_json_output(collected: &[HostSessions], all: bool) -> Result<String, AnyError> {
	let hosts: Vec<HostSessionsJson> = collected
		.iter()
		.map(|outcome| HostSessionsJson {
			host: HostJson::from(&outcome.endpoint),
			sessions: outcome
				.sessions
				.as_ref()
				.ok()
				.map(|s| select_and_sort(s, all)),
			error: outcome.sessions.as_ref().err().map(|e| e.to_string()),
		})
		.collect();

	serde_json::to_string_pretty(&hosts).map_err(|e| wrap(e, "Failed to serialize sessions").into())
}

/// Applies the `--all` filter (active-only unless set) and sorts
/// most-recently-modified first, shared by every output path so human
/// and JSON output (single- or multi-host) always agree on ordering.
fn select_and_sort(sessions: &[SessionSummary], all: bool) -> Vec<&SessionSummary> {
	let mut items: Vec<&SessionSummary> = if all {
		sessions.iter().collect()
	} else {
		sessions.iter().filter(|s| is_active(s.status)).collect()
	};

	items.sort_by_key(|b| std::cmp::Reverse(b.modified_at));
	items
}

/// A session is "active" if it is in-progress, needs input, or errored
/// (i.e. not just idle/archived).
fn is_active(status: u32) -> bool {
	let dominated = SessionStatus::IsRead.bits()
		| SessionStatus::IsArchived.bits()
		| SessionStatus::Idle.bits();
	status & !dominated != 0
}

fn format_sessions_list(sessions: &[&SessionSummary]) -> String {
	let title_style = Styles::title();
	let label_style = Styles::label();
	let uri_style = Styles::uri();

	let mut out = String::new();

	for (i, s) in sessions.iter().enumerate() {
		if i > 0 {
			out.push('\n');
		}

		let status = status_styled(s.status);
		let title = if s.title.is_empty() {
			"(untitled)".to_string()
		} else {
			s.title.clone()
		};
		out.push_str(&format!("  {} {}\n", title_style.apply_to(&title), status));

		out.push_str(&format!(
			"    {} {}\n",
			label_style.apply_to("uri:"),
			uri_style.apply_to(&s.resource),
		));

		out.push_str(&format!(
			"    {} {}\n",
			label_style.apply_to("provider:"),
			s.provider,
		));

		if let Some(activity) = &s.activity {
			if !activity.is_empty() {
				out.push_str(&format!(
					"    {} {}\n",
					label_style.apply_to("activity:"),
					activity,
				));
			}
		}

		if let Some(wd) = &s.working_directory {
			out.push_str(&format!("    {} {}\n", label_style.apply_to("cwd:"), wd,));
		}
	}

	out
}

fn status_styled(status: u32) -> console::StyledObject<String> {
	let status = SessionStatus::from_bits(status);
	if status.contains(SessionStatus::InputNeeded) {
		Styles::warning().apply_to("● input needed".to_string())
	} else if status.contains(SessionStatus::InProgress) {
		Styles::success().apply_to("● in progress".to_string())
	} else if status.contains(SessionStatus::Error) {
		Styles::error().apply_to("● error".to_string())
	} else if status.contains(SessionStatus::Idle) {
		Styles::muted().apply_to("○ idle".to_string())
	} else {
		Styles::muted().apply_to(format!("? unknown ({})", status.bits()))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn session(resource: &str, status: u32, modified_at: i64) -> SessionSummary {
		SessionSummary {
			resource: resource.to_string(),
			provider: "test".to_string(),
			title: String::new(),
			status,
			activity: None,
			created_at: 0,
			modified_at,
			project: None,
			model: None,
			agent: None,
			working_directory: None,
			changes: None,
			annotations: None,
		}
	}

	#[test]
	fn select_and_sort_filters_idle_unless_all() {
		let idle = session("a", SessionStatus::Idle.bits(), 1);
		let active = session("b", SessionStatus::InProgress.bits(), 2);
		let sessions = vec![idle.clone(), active.clone()];

		let filtered = select_and_sort(&sessions, false);
		assert_eq!(filtered.len(), 1);
		assert_eq!(filtered[0].resource, "b");

		let all = select_and_sort(&sessions, true);
		assert_eq!(all.len(), 2);
	}

	#[test]
	fn select_and_sort_orders_most_recently_modified_first() {
		let older = session("a", SessionStatus::InProgress.bits(), 1);
		let newer = session("b", SessionStatus::InProgress.bits(), 2);
		let sessions = vec![older, newer];

		let sorted = select_and_sort(&sessions, true);
		assert_eq!(sorted[0].resource, "b");
		assert_eq!(sorted[1].resource, "a");
	}

	#[test]
	fn host_json_carries_provenance_fields() {
		let entry = AgentHostEndpointMetadata::new_standalone(
			42,
			"instance-a".to_string(),
			"127.0.0.1".to_string(),
			8080,
			"tok".to_string(),
			"0.1.0".to_string(),
			Some("insider".to_string()),
			None,
		);

		let json = HostJson::from(&entry);
		assert_eq!(json.server_type, "standalone");
		assert_eq!(json.pid, 42);
		assert_eq!(json.instance_id, "instance-a");
		assert_eq!(json.address, "127.0.0.1:8080");
		assert_eq!(json.quality.as_deref(), Some("insider"));
	}
}
