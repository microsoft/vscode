/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::{
	atomic::{AtomicBool, Ordering},
	Arc, OnceLock, RwLock,
};

use serde::{Deserialize, Serialize};

use super::code_server::get_tunnel_web_url;

const STATUS_PREFIX: &str = "__VSCODE_CLI_STATUS__";

/// A machine-readable tunnel lifecycle event that can be relayed to attached
/// singleton clients without parsing the human-readable log stream.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(
	tag = "type",
	rename_all = "camelCase",
	rename_all_fields = "camelCase"
)]
pub(crate) enum MachineStatus {
	Connected {
		tunnel_name: String,
		#[serde(skip_serializing_if = "Option::is_none")]
		tunnel_id: Option<String>,
		is_attached: bool,
		#[serde(skip_serializing_if = "Option::is_none")]
		link: Option<String>,
		#[serde(skip_serializing_if = "Option::is_none")]
		domain: Option<String>,
	},
	TokenError {
		message: String,
	},
}

type MachineStatusSink = Arc<dyn Fn(&MachineStatus) + Send + Sync>;

static STATUS_SINK: OnceLock<RwLock<Option<MachineStatusSink>>> = OnceLock::new();
static STDOUT_ENABLED: AtomicBool = AtomicBool::new(false);

fn status_sink() -> &'static RwLock<Option<MachineStatusSink>> {
	STATUS_SINK.get_or_init(|| RwLock::new(None))
}

#[cfg(test)]
static TEST_STDOUT_SINK: OnceLock<RwLock<Option<MachineStatusSink>>> = OnceLock::new();

#[cfg(test)]
fn test_stdout_sink() -> &'static RwLock<Option<MachineStatusSink>> {
	TEST_STDOUT_SINK.get_or_init(|| RwLock::new(None))
}

fn status_line(status: &MachineStatus) -> String {
	format!(
		"{STATUS_PREFIX}{}",
		serde_json::to_string(status).expect("status must serialize")
	)
}

/// Installs a process-wide relay so status events raised by long-lived tunnel
/// services can reach singleton clients that own separate stdout streams.
pub(crate) fn install_sink(sink: impl Fn(&MachineStatus) + Send + Sync + 'static) {
	*status_sink().write().unwrap() = Some(Arc::new(sink));
}

/// Controls local stdout output independently from relaying so attached clients
/// can receive events from servers that were not started for machine consumers.
pub(crate) fn set_stdout_enabled(enabled: bool) {
	STDOUT_ENABLED.store(enabled, Ordering::Relaxed);
}

/// Emits a received or locally-created status event to every enabled process
/// destination, preserving relay delivery when local stdout is disabled.
pub(crate) fn emit(status: MachineStatus) {
	let sink = status_sink().read().unwrap().clone();
	if let Some(sink) = sink {
		sink(&status);
	}
	if STDOUT_ENABLED.load(Ordering::Relaxed) {
		emit_to_stdout(&status);
	}
}

fn emit_to_stdout(status: &MachineStatus) {
	#[cfg(test)]
	if let Some(sink) = test_stdout_sink().read().unwrap().clone() {
		sink(status);
		return;
	}

	println!("{}", status_line(status));
}

pub fn emit_connected(
	tunnel_name: &str,
	tunnel_id: Option<&str>,
	is_attached: bool,
	has_editor_link: bool,
) {
	let (link, domain) = if has_editor_link {
		match get_tunnel_web_url(tunnel_name) {
			Some(link) => (
				Some(link.to_string()),
				link.host_str().map(ToString::to_string),
			),
			None => (None, None),
		}
	} else {
		(None, None)
	};

	emit(MachineStatus::Connected {
		tunnel_name: tunnel_name.to_string(),
		tunnel_id: tunnel_id.map(ToString::to_string),
		is_attached,
		link,
		domain,
	});
}

pub fn emit_token_error(message: String) {
	emit(MachineStatus::TokenError { message });
}

#[cfg(test)]
mod tests {
	use std::sync::{atomic::Ordering, Arc, Mutex};

	use crate::{
		json_rpc::JsonRpcSerializer, rpc::RpcCaller,
		tunnels::protocol::singleton::METHOD_MACHINE_STATUS,
	};

	use super::{
		emit_token_error, install_sink, set_stdout_enabled, status_line, status_sink,
		test_stdout_sink, MachineStatus, STDOUT_ENABLED,
	};

	static STATUS_TEST_LOCK: Mutex<()> = Mutex::new(());

	struct ResetMachineStatus;

	impl Drop for ResetMachineStatus {
		fn drop(&mut self) {
			*status_sink().write().unwrap() = None;
			*test_stdout_sink().write().unwrap() = None;
			STDOUT_ENABLED.store(false, Ordering::Relaxed);
		}
	}

	#[test]
	fn serializes_connected_with_link_for_new_tunnel() {
		assert_eq!(
			status_line(&MachineStatus::Connected {
				tunnel_name: "desktop-oss".to_string(),
				tunnel_id: Some("tunnel-id".to_string()),
				is_attached: false,
				link: Some("https://insiders.vscode.dev/tunnel/desktop-oss/c:/some/dir".to_string()),
				domain: Some("insiders.vscode.dev".to_string()),
			}),
			"__VSCODE_CLI_STATUS__{\"type\":\"connected\",\"tunnelName\":\"desktop-oss\",\"tunnelId\":\"tunnel-id\",\"isAttached\":false,\"link\":\"https://insiders.vscode.dev/tunnel/desktop-oss/c:/some/dir\",\"domain\":\"insiders.vscode.dev\"}"
		);
	}

	#[test]
	fn serializes_connected_without_link_for_attached_tunnel() {
		assert_eq!(
			status_line(&MachineStatus::Connected {
				tunnel_name: "desktop-oss".to_string(),
				tunnel_id: None,
				is_attached: true,
				link: None,
				domain: None,
			}),
			"__VSCODE_CLI_STATUS__{\"type\":\"connected\",\"tunnelName\":\"desktop-oss\",\"isAttached\":true}"
		);
	}

	#[test]
	fn serializes_token_error() {
		assert_eq!(
			status_line(&MachineStatus::TokenError {
				message: "refresh token expired".to_string(),
			}),
			"__VSCODE_CLI_STATUS__{\"type\":\"tokenError\",\"message\":\"refresh token expired\"}"
		);
	}

	#[test]
	fn relays_token_errors_when_stdout_is_disabled() {
		let _lock = STATUS_TEST_LOCK.lock().unwrap();
		let _reset = ResetMachineStatus;
		set_stdout_enabled(false);
		let received = Arc::new(Mutex::new(Vec::new()));
		let sink_received = received.clone();
		install_sink(move |status| sink_received.lock().unwrap().push(status.clone()));

		emit_token_error("refresh token expired".to_string());

		assert_eq!(
			*received.lock().unwrap(),
			vec![MachineStatus::TokenError {
				message: "refresh token expired".to_string(),
			}]
		);
	}

	#[test]
	fn relays_and_writes_token_errors_when_stdout_is_enabled() {
		let _lock = STATUS_TEST_LOCK.lock().unwrap();
		let _reset = ResetMachineStatus;
		set_stdout_enabled(true);
		let relayed = Arc::new(Mutex::new(Vec::new()));
		let relayed_statuses = relayed.clone();
		install_sink(move |status| relayed_statuses.lock().unwrap().push(status.clone()));
		let written = Arc::new(Mutex::new(Vec::new()));
		let written_statuses = written.clone();
		*test_stdout_sink().write().unwrap() = Some(Arc::new(move |status| {
			written_statuses.lock().unwrap().push(status.clone())
		}));

		emit_token_error("refresh token expired".to_string());

		let expected = vec![MachineStatus::TokenError {
			message: "refresh token expired".to_string(),
		}];
		assert_eq!(*relayed.lock().unwrap(), expected);
		assert_eq!(
			*written.lock().unwrap(),
			vec![MachineStatus::TokenError {
				message: "refresh token expired".to_string(),
			}]
		);
	}

	#[test]
	fn machine_status_notification_round_trips() {
		let expected = MachineStatus::TokenError {
			message: "refresh token expired".to_string(),
		};
		let serialized =
			RpcCaller::serialize_notify(&JsonRpcSerializer {}, METHOD_MACHINE_STATUS, &expected);
		let notification: serde_json::Value = serde_json::from_slice(&serialized).unwrap();

		assert_eq!(notification["method"], METHOD_MACHINE_STATUS);
		let deserialized: MachineStatus =
			serde_json::from_value(notification["params"].clone()).unwrap();
		assert_eq!(deserialized, expected);
	}
}
