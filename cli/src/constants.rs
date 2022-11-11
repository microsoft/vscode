/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashMap;

use lazy_static::lazy_static;

use crate::options::Quality;

pub const CONTROL_PORT: u16 = 31545;
pub const PROTOCOL_VERSION: u32 = 1;

pub const VSCODE_CLI_VERSION: Option<&'static str> = option_env!("VSCODE_CLI_VERSION");
pub const VSCODE_CLI_AI_KEY: Option<&'static str> = option_env!("VSCODE_CLI_AI_KEY");
pub const VSCODE_CLI_AI_ENDPOINT: Option<&'static str> = option_env!("VSCODE_CLI_AI_ENDPOINT");
pub const VSCODE_CLI_QUALITY: Option<&'static str> = option_env!("VSCODE_CLI_QUALITY");
pub const VSCODE_CLI_COMMIT: Option<&'static str> = option_env!("VSCODE_CLI_COMMIT");
pub const VSCODE_CLI_UPDATE_ENDPOINT: Option<&'static str> =
	option_env!("VSCODE_CLI_UPDATE_ENDPOINT");

pub const TUNNEL_SERVICE_USER_AGENT_ENV_VAR: &str = "TUNNEL_SERVICE_USER_AGENT";

// JSON map of quality names to arrays of app IDs used for them, for example, `{"stable":["ABC123"]}`
const VSCODE_CLI_WIN32_APP_IDS: Option<&'static str> = option_env!("VSCODE_CLI_WIN32_APP_IDS");
// JSON map of quality names to download URIs
const VSCODE_CLI_QUALITY_DOWNLOAD_URIS: Option<&'static str> =
	option_env!("VSCODE_CLI_QUALITY_DOWNLOAD_URIS");

pub fn get_default_user_agent() -> String {
	format!(
		"vscode-server-launcher/{}",
		VSCODE_CLI_VERSION.unwrap_or("dev")
	)
}

lazy_static! {
	pub static ref TUNNEL_SERVICE_USER_AGENT: String =
		match std::env::var(TUNNEL_SERVICE_USER_AGENT_ENV_VAR) {
			Ok(ua) if !ua.is_empty() => format!("{} {}", ua, get_default_user_agent()),
			_ => get_default_user_agent(),
		};
	pub static ref WIN32_APP_IDS: Option<HashMap<Quality, Vec<String>>> =
		VSCODE_CLI_WIN32_APP_IDS.and_then(|s| serde_json::from_str(s).unwrap());
	pub static ref QUALITY_DOWNLOAD_URIS: Option<HashMap<Quality, String>> =
		VSCODE_CLI_QUALITY_DOWNLOAD_URIS.and_then(|s| serde_json::from_str(s).unwrap());
}
