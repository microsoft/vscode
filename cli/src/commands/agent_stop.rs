/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use ahp_types::actions::{ChatTurnCancelledAction, StateAction};
use ahp_types::commands::{SubscribeParams, SubscribeResult};
use ahp_types::state::{SessionStatus, SnapshotState};

use crate::log;
use crate::util::errors::{wrap, AnyError};

use super::agent;
use super::args::AgentStopArgs;
use super::CommandContext;

/// Cancels the active turn of every in-progress chat in a session on a running
/// agent host.
pub async fn agent_stop(ctx: CommandContext, args: AgentStopArgs) -> Result<i32, AnyError> {
	let client = agent::connect(&ctx, args.address.as_deref(), args.tunnel.as_deref()).await?;

	// Subscribe to the session to get its catalog of chats.
	let result: SubscribeResult = agent::request_with_auth(
		&ctx,
		&client,
		"subscribe",
		SubscribeParams {
			channel: args.session.clone(),
		},
	)
	.await?;

	// Turns live on individual chats now, so collect the chats that look active
	// from the session catalog before drilling into each one.
	let chat_uris: Vec<String> = match result.snapshot.map(|s| s.state) {
		Some(SnapshotState::Session(session)) => session
			.chats
			.into_iter()
			.filter(|c| SessionStatus::from_bits(c.status).contains(SessionStatus::InProgress))
			.map(|c| c.resource)
			.collect(),
		_ => Vec::new(),
	};

	let mut cancelled = 0;
	for chat_uri in chat_uris {
		// Subscribe to the chat to find its active turn, if any.
		let chat_result: SubscribeResult = agent::request_with_auth(
			&ctx,
			&client,
			"subscribe",
			SubscribeParams {
				channel: chat_uri.clone(),
			},
		)
		.await?;

		let turn_id = match chat_result.snapshot.map(|s| s.state) {
			Some(SnapshotState::Chat(chat)) => chat.active_turn.map(|t| t.id),
			_ => None,
		};

		let Some(turn_id) = turn_id else {
			continue;
		};

		debug!(ctx.log, "Cancelling turn {} on {}", turn_id, chat_uri);

		client
			.dispatch(
				chat_uri.clone(),
				StateAction::ChatTurnCancelled(ChatTurnCancelledAction {
					turn_id: turn_id.clone(),
					meta: None,
				}),
			)
			.await
			.map_err(|e| wrap(e, "Failed to dispatch turn cancellation"))?;

		ctx.log
			.result(format!("Cancelled turn {turn_id} on {chat_uri}"));
		cancelled += 1;
	}

	if cancelled == 0 {
		ctx.log.result("No active turn to cancel.");
	}

	client.shutdown().await;
	Ok(0)
}
