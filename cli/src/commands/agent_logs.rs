/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use ahp::SubscriptionEvent;
use ahp_types::actions::StateAction;
use ahp_types::commands::{SubscribeParams, SubscribeResult};
use ahp_types::state::{SessionStatus, SnapshotState};
use console::Style;

use crate::tunnels::shutdown_signal::ShutdownRequest;
use crate::util::errors::AnyError;

use super::agent;
use super::args::AgentLogsArgs;
use super::output::Styles;
use super::CommandContext;

/// Subscribes to a session and streams actions/notifications in real time.
pub async fn agent_logs(ctx: CommandContext, args: AgentLogsArgs) -> Result<i32, AnyError> {
	let client = agent::connect(&ctx, args.address.as_deref(), args.tunnel.as_deref()).await?;

	let (result, mut sub): (SubscribeResult, _) = {
		let r: SubscribeResult = agent::request_with_auth(
			&ctx,
			&client,
			"subscribe",
			SubscribeParams {
				channel: args.session.clone(),
			},
		)
		.await?;
		let s = client.attach_subscription(&args.session).await;
		(r, s)
	};

	// Print initial state summary.
	print_initial_state(&args.session, &result);

	let header = Styles::muted();
	println!(
		"\n{}",
		header.apply_to("Streaming events (Ctrl+C to quit)...")
	);
	println!("{}", header.apply_to("─".repeat(50)));

	// Stream events until Ctrl+C or the subscription closes.
	let mut shutdown = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);

	loop {
		tokio::select! {
			ev = sub.recv() => match ev {
				Some(SubscriptionEvent::Action(envelope)) => {
					print_action(envelope.server_seq, &envelope.action);
				}
				Some(other) => {
					let notif_style = Style::new().magenta();
					println!("{}", notif_style.apply_to(format!("notification: {other:?}")));
				}
				None => {
					println!("{}", Styles::muted().apply_to("Subscription closed."));
					break;
				}
			},
			_ = shutdown.wait() => {
				println!("\n{}", Styles::muted().apply_to("Interrupted."));
				break;
			}
		}
	}

	client.shutdown().await;
	Ok(0)
}

fn print_initial_state(uri: &str, result: &SubscribeResult) {
	let title = Styles::title();
	let label = Styles::label();
	let uri_style = Styles::uri();

	println!(
		"\n{} {}",
		title.apply_to("Session"),
		uri_style.apply_to(uri)
	);

	let Some(ref snapshot) = result.snapshot else {
		return;
	};

	if let SnapshotState::Session(ref session) = snapshot.state {
		let s = &session.summary;
		if !s.title.is_empty() {
			println!("  {} {}", label.apply_to("title:"), s.title);
		}
		println!("  {} {}", label.apply_to("provider:"), s.provider);
		if let Some(ref activity) = s.activity {
			if !activity.is_empty() {
				println!("  {} {}", label.apply_to("activity:"), activity);
			}
		}
		println!("  {} {}", label.apply_to("chats:"), session.chats.len());

		// Print a brief summary of the chats in this session.
		for chat in &session.chats {
			let status = SessionStatus::from_bits(chat.status);
			let marker = if status.contains(SessionStatus::InProgress) {
				Style::new().green().bold().apply_to("►")
			} else if status.contains(SessionStatus::Error) {
				Styles::error().apply_to("✗")
			} else {
				Styles::muted().apply_to("○")
			};
			let title = if chat.title.is_empty() {
				"(untitled)".to_string()
			} else {
				truncate(&chat.title, 80)
			};
			println!("    {} {}", marker, Styles::muted().apply_to(title));
		}
	}

	println!("  {} {}", label.apply_to("seq:"), snapshot.from_seq);
}

fn print_action(seq: u64, action: &StateAction) {
	let seq_str = Styles::muted().apply_to(format!("[{seq:>6}]"));

	// Serialize the action to extract the "type" tag and remaining fields.
	let value = serde_json::to_value(action).unwrap_or_default();
	let type_name = value
		.get("type")
		.and_then(|v| v.as_str())
		.unwrap_or("unknown");

	// Build a compact params string from all fields except "type".
	let params = if let Some(obj) = value.as_object() {
		let parts: Vec<String> = obj
			.iter()
			.filter(|(k, _)| k.as_str() != "type")
			.map(|(k, v)| {
				let v_str = match v {
					serde_json::Value::String(s) => truncate(s, 80),
					other => truncate(&other.to_string(), 80),
				};
				format!("{}={}", Styles::label().apply_to(k), v_str)
			})
			.collect();
		parts.join(" ")
	} else {
		String::new()
	};

	let style = action_style(type_name);
	println!("{} {} {}", seq_str, style.apply_to(type_name), params);
}

/// Picks a color for the action type name.
fn action_style(type_name: &str) -> Style {
	if type_name.contains("error") || type_name.contains("Failed") {
		Styles::error()
	} else if type_name.contains("Complete") || type_name.contains("complete") {
		Styles::success()
	} else if type_name.contains("Cancel") || type_name.contains("cancel") {
		Styles::warning()
	} else if type_name.contains("oolCall") || type_name.contains("oolcall") {
		Style::new().blue()
	} else if type_name.contains("delta")
		|| type_name.contains("Delta")
		|| type_name.contains("reasoning")
	{
		Styles::muted()
	} else {
		Style::new().cyan()
	}
}

fn truncate(s: &str, max: usize) -> String {
	let s = s.replace('\n', " ");
	if s.len() <= max {
		s
	} else {
		format!("{}…", &s[..max - 1])
	}
}
