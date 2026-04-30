/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use ahp_types::actions::{SessionTurnCancelledAction, StateAction};
use ahp_types::commands::{SubscribeParams, SubscribeResult};
use ahp_types::state::SnapshotState;

use crate::log;
use crate::util::errors::{wrap, AnyError};

use super::agent;
use super::args::AgentStopArgs;
use super::CommandContext;

/// Cancels the active turn of a session on a running agent host.
pub async fn agent_stop(ctx: CommandContext, args: AgentStopArgs) -> Result<i32, AnyError> {
	let client = agent::connect(&ctx, args.address.as_deref(), args.tunnel.as_deref()).await?;

	// Subscribe to the session to get its current state.
	let result: SubscribeResult = agent::request_with_auth(
		&ctx,
		&client,
		"subscribe",
		SubscribeParams {
			resource: args.session.clone(),
		},
	)
	.await?;

	let turn_id = match result.snapshot.state {
		SnapshotState::Session(session) => session.active_turn.map(|t| t.id),
		_ => None,
	};

	let turn_id = match turn_id {
		Some(id) => id,
		None => {
			ctx.log.result("No active turn to cancel.");
			client.shutdown().await;
			return Ok(0);
		}
	};

	debug!(ctx.log, "Cancelling turn {} on {}", turn_id, args.session);

	client
		.dispatch(StateAction::SessionTurnCancelled(
			SessionTurnCancelledAction {
				session: args.session.clone(),
				turn_id: turn_id.clone(),
			},
		))
		.await
		.map_err(|e| wrap(e, "Failed to dispatch turn cancellation"))?;

	ctx.log
		.result(format!("Cancelled turn {turn_id} on {}", args.session));

	client.shutdown().await;
	Ok(0)
}
