/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use serde::Serialize;

use super::code_server::get_tunnel_web_url;

const STATUS_PREFIX: &str = "__VSCODE_CLI_STATUS__";

#[derive(Serialize)]
#[serde(
	tag = "type",
	rename_all = "camelCase",
	rename_all_fields = "camelCase"
)]
enum MachineStatus {
	Connected {
		tunnel_name: String,
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

fn status_line(status: &MachineStatus) -> String {
	format!(
		"{STATUS_PREFIX}{}",
		serde_json::to_string(status).expect("status must serialize")
	)
}

pub fn emit_connected(tunnel_name: &str, is_attached: bool, has_editor_link: bool) {
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

	println!(
		"{}",
		status_line(&MachineStatus::Connected {
			tunnel_name: tunnel_name.to_string(),
			is_attached,
			link,
			domain,
		})
	);
}

pub fn emit_token_error(message: String) {
	println!("{}", status_line(&MachineStatus::TokenError { message }));
}

#[cfg(test)]
mod tests {
	use super::{status_line, MachineStatus};

	#[test]
	fn serializes_connected_with_link_for_new_tunnel() {
		assert_eq!(
			status_line(&MachineStatus::Connected {
				tunnel_name: "desktop-oss".to_string(),
				is_attached: false,
				link: Some("https://insiders.vscode.dev/tunnel/desktop-oss/c:/some/dir".to_string()),
				domain: Some("insiders.vscode.dev".to_string()),
			}),
			"__VSCODE_CLI_STATUS__{\"type\":\"connected\",\"tunnelName\":\"desktop-oss\",\"isAttached\":false,\"link\":\"https://insiders.vscode.dev/tunnel/desktop-oss/c:/some/dir\",\"domain\":\"insiders.vscode.dev\"}"
		);
	}

	#[test]
	fn serializes_connected_without_link_for_attached_tunnel() {
		assert_eq!(
			status_line(&MachineStatus::Connected {
				tunnel_name: "desktop-oss".to_string(),
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
}
