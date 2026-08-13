/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::constants::IS_INTERACTIVE_CLI;
use crate::log;
use crate::tunnels::agent_host_registry::{self, AgentHostEndpointMetadata};
use crate::tunnels::user_data_path::resolve_user_data_path;
use crate::util::command::kill_tree;
use crate::util::errors::{wrap, AnyError, CodeError};
use crate::util::input::prompt_index;

use super::args::AgentKillArgs;
use super::CommandContext;

/// Forcefully kills a running **standalone** agent host process tree and
/// cleans up its registry entry.
///
/// Only ever considers `standalone` entries (see
/// [`agent_host_registry::list_live_standalone_endpoints`]): `editor`
/// entries are owned by running VS Code windows and must never be killed
/// by this command. If exactly one live standalone host is registered it
/// is killed directly, matching prior single-instance behavior. If more
/// than one exists, `--instance-id` selects one non-interactively;
/// otherwise, in an interactive terminal, the user is prompted to choose
/// by pid/instance/address/quality. In a non-interactive context with
/// more than one candidate and no `--instance-id`, this fails rather than
/// guessing which host to kill. Returns
/// [`CodeError::NoRunningAgentHost`] when the shared registry has no live
/// standalone entry at all.
pub async fn agent_kill(ctx: CommandContext, args: AgentKillArgs) -> Result<i32, AnyError> {
	let user_data_path = resolve_user_data_path(args.user_data_dir.as_deref());
	let candidates =
		agent_host_registry::list_live_standalone_endpoints(&ctx.log, &user_data_path).await;

	if candidates.is_empty() {
		return Err(CodeError::NoRunningAgentHost.into());
	}

	let selected = select_candidate(&candidates, args.instance_id.as_deref())?;
	kill_standalone_endpoint(&ctx, &user_data_path, selected).await
}

/// Picks the standalone endpoint to kill out of `candidates`, which must
/// be non-empty. Behavior:
/// - `instance_id` given: the matching candidate, or an error if none
///   matches (even when there is only one candidate — an explicit
///   mismatch should not silently kill the wrong host).
/// - Exactly one candidate, no `instance_id`: that one, directly.
/// - Multiple candidates, no `instance_id`, interactive terminal: prompt.
/// - Multiple candidates, no `instance_id`, non-interactive: error asking
///   for `--instance-id`.
fn select_candidate<'a>(
	candidates: &'a [AgentHostEndpointMetadata],
	instance_id: Option<&str>,
) -> Result<&'a AgentHostEndpointMetadata, AnyError> {
	if let Some(instance_id) = instance_id {
		return candidates
			.iter()
			.find(|e| e.instance_id == instance_id)
			.ok_or_else(|| CodeError::UnknownAgentHostInstance(instance_id.to_string()).into());
	}

	if candidates.len() == 1 {
		return Ok(&candidates[0]);
	}

	if !*IS_INTERACTIVE_CLI {
		let ids = candidates
			.iter()
			.map(|e| e.instance_id.clone())
			.collect::<Vec<_>>()
			.join(", ");
		return Err(CodeError::AmbiguousAgentHostInstance(ids).into());
	}

	let labels: Vec<String> = candidates.iter().map(|e| e.label()).collect();
	let chosen = prompt_index(
		"Multiple standalone agent hosts are running; pick one to kill",
		&labels,
	)
	.map_err(|e| wrap(e, "Failed to read agent host selection"))?;
	Ok(&candidates[chosen])
}

async fn kill_standalone_endpoint(
	ctx: &CommandContext,
	user_data_path: &std::path::Path,
	selected: &AgentHostEndpointMetadata,
) -> Result<i32, AnyError> {
	debug!(
		ctx.log,
		"Killing agent host process tree (pid {})", selected.pid
	);

	kill_tree(selected.pid)
		.await
		.map_err(|e| wrap(e, "Failed to kill agent host process tree"))?;

	agent_host_registry::remove_agent_host_endpoint(&ctx.log, user_data_path, &selected.identity());

	ctx.log
		.result(format!("Killed agent host (pid {}).", selected.pid));
	Ok(0)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn standalone(pid: u32, instance_id: &str) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata::new_standalone(
			pid,
			instance_id.to_string(),
			"127.0.0.1".to_string(),
			9000,
			"tok".to_string(),
			"1".to_string(),
			None,
			None,
		)
	}

	#[test]
	fn select_candidate_returns_single_candidate_directly() {
		let candidates = vec![standalone(1, "only")];
		let selected = select_candidate(&candidates, None).unwrap();
		assert_eq!(selected.instance_id, "only");
	}

	#[test]
	fn select_candidate_with_instance_id_matches_even_when_only_one_candidate() {
		let candidates = vec![standalone(1, "only")];
		let selected = select_candidate(&candidates, Some("only")).unwrap();
		assert_eq!(selected.instance_id, "only");
	}

	#[test]
	fn select_candidate_with_mismatched_instance_id_errors() {
		let candidates = vec![standalone(1, "only")];
		let err = select_candidate(&candidates, Some("nope")).unwrap_err();
		assert!(matches!(
			err,
			AnyError::CodeError(CodeError::UnknownAgentHostInstance(ref id)) if id == "nope"
		));
	}

	#[test]
	fn select_candidate_with_instance_id_picks_matching_one_of_several() {
		let candidates = vec![standalone(1, "a"), standalone(2, "b")];
		let selected = select_candidate(&candidates, Some("b")).unwrap();
		assert_eq!(selected.pid, 2);
	}

	#[test]
	fn select_candidate_multiple_without_instance_id_in_non_interactive_test_env_errors() {
		// `cargo test` runs with no attached TTY, so `IS_INTERACTIVE_CLI` is
		// false here; this exercises the non-interactive-disambiguation
		// error path without needing to fake a terminal/prompt.
		let candidates = vec![standalone(1, "a"), standalone(2, "b")];
		let err = select_candidate(&candidates, None).unwrap_err();
		assert!(matches!(
			err,
			AnyError::CodeError(CodeError::AmbiguousAgentHostInstance(_))
		));
	}
}
