/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use ahp_types::commands::{ListSessionsParams, ListSessionsResult};
use ahp_types::state::{SessionStatus, SessionSummary};

use crate::util::errors::AnyError;

use super::agent;
use super::args::AgentPsArgs;
use super::output::{self, Styles};
use super::CommandContext;

/// Lists active sessions on a running agent host.
pub async fn agent_ps(ctx: CommandContext, args: AgentPsArgs) -> Result<i32, AnyError> {
	let client = agent::connect(&ctx, args.address.as_deref(), args.tunnel.as_deref()).await?;

	let result: ListSessionsResult =
		agent::request_with_auth(&ctx, &client, "listSessions", ListSessionsParams::default())
			.await?;

	client.shutdown().await;

	let mut items: Vec<&SessionSummary> = if args.all {
		result.items.iter().collect()
	} else {
		result
			.items
			.iter()
			.filter(|s| is_active(s.status))
			.collect()
	};

	// Most-recently-modified first.
	items.sort_by_key(|b| std::cmp::Reverse(b.modified_at));

	if args.json {
		let json = serde_json::to_string_pretty(&items)
			.map_err(|e| crate::util::errors::wrap(e, "Failed to serialize sessions"))?;
		output::print_paged(&json);
	} else if items.is_empty() {
		ctx.log.result("No active sessions.");
	} else {
		let out = format_sessions_list(&items);
		output::print_paged(&out);
	}

	Ok(0)
}

/// A session is "active" if it is in-progress, needs input, or errored
/// (i.e. not just idle/archived).
fn is_active(status: u32) -> bool {
	let dominated = SessionStatus::IsRead as u32
		| SessionStatus::IsArchived as u32
		| SessionStatus::Idle as u32;
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
	if status & (SessionStatus::InputNeeded as u32) == (SessionStatus::InputNeeded as u32) {
		Styles::warning().apply_to("● input needed".to_string())
	} else if status & (SessionStatus::InProgress as u32) != 0 {
		Styles::success().apply_to("● in progress".to_string())
	} else if status & (SessionStatus::Error as u32) != 0 {
		Styles::error().apply_to("● error".to_string())
	} else if status & (SessionStatus::Idle as u32) != 0 {
		Styles::muted().apply_to("○ idle".to_string())
	} else {
		Styles::muted().apply_to(format!("? unknown ({status})"))
	}
}
