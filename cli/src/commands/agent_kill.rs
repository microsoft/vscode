/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;

use crate::log;
use crate::util::command::kill_tree;
use crate::util::errors::{wrap, AnyError};
use crate::util::machine::process_exists;

use super::agent_host::AgentHostLockData;
use super::CommandContext;

/// Forcefully kills the running agent host process tree and cleans up.
pub async fn agent_kill(ctx: CommandContext) -> Result<i32, AnyError> {
	let lockfile_path = ctx.paths.agent_host_lockfile();

	let data = fs::read_to_string(&lockfile_path).map_err(|e| {
		wrap(
			e,
			"No running agent host found. Start one with `code agent host`",
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
		ctx.log
			.result("Agent host is not running (stale lockfile cleaned up).");
		return Ok(0);
	}

	debug!(
		ctx.log,
		"Killing agent host process tree (pid {})", lock.pid
	);

	kill_tree(lock.pid)
		.await
		.map_err(|e| wrap(e, "Failed to kill agent host process tree"))?;

	let _ = fs::remove_file(&lockfile_path);

	ctx.log
		.result(format!("Killed agent host (pid {}).", lock.pid));

	Ok(0)
}
