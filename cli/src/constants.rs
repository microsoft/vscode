/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use lazy_static::lazy_static;

pub const CONTROL_PORT: u16 = 31545;
pub const PROTOCOL_VERSION: u32 = 1;

pub const VSCODE_CLI_VERSION: Option<&'static str> = option_env!("VSCODE_CLI_VERSION");
pub const VSCODE_CLI_ASSET_NAME: Option<&'static str> = option_env!("VSCODE_CLI_ASSET_NAME");
pub const VSCODE_CLI_AI_KEY: Option<&'static str> = option_env!("VSCODE_CLI_AI_KEY");
pub const VSCODE_CLI_AI_ENDPOINT: Option<&'static str> = option_env!("VSCODE_CLI_AI_ENDPOINT");
pub const VSCODE_CLI_UPDATE_ENDPOINT: Option<&'static str> =
	option_env!("VSCODE_CLI_UPDATE_ENDPOINT");

pub const TUNNEL_SERVICE_USER_AGENT_ENV_VAR: &str = "TUNNEL_SERVICE_USER_AGENT";

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
}
