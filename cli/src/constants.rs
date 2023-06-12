/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashMap;

use const_format::concatcp;
use lazy_static::lazy_static;

use crate::options::Quality;

pub const CONTROL_PORT: u16 = 31545;

/// Protocol version sent to clients. This can be used to indiciate new or
/// changed capabilities that clients may wish to leverage.
///  1 - Initial protocol version
///  2 - Addition of `serve.compressed` property to control whether servermsg's
///      are compressed bidirectionally.
///  3 - The server's connection token is set to a SHA256 hash of the tunnel ID
///  4 - The server's msgpack messages are no longer length-prefixed
pub const PROTOCOL_VERSION: u32 = 4;

/// Prefix for the tunnel tag that includes the version.
pub const PROTOCOL_VERSION_TAG_PREFIX: &str = "protocolv";
/// Tag for the current protocol version, which is included in dev tunnels.
pub const PROTOCOL_VERSION_TAG: &str = concatcp!("protocolv", PROTOCOL_VERSION);

pub const VSCODE_CLI_VERSION: Option<&'static str> = option_env!("VSCODE_CLI_VERSION");
pub const VSCODE_CLI_AI_KEY: Option<&'static str> = option_env!("VSCODE_CLI_AI_KEY");
pub const VSCODE_CLI_AI_ENDPOINT: Option<&'static str> = option_env!("VSCODE_CLI_AI_ENDPOINT");
pub const VSCODE_CLI_QUALITY: Option<&'static str> = option_env!("VSCODE_CLI_QUALITY");
pub const DOCUMENTATION_URL: Option<&'static str> = option_env!("VSCODE_CLI_DOCUMENTATION_URL");
pub const VSCODE_CLI_COMMIT: Option<&'static str> = option_env!("VSCODE_CLI_COMMIT");
pub const VSCODE_CLI_UPDATE_ENDPOINT: Option<&'static str> =
	option_env!("VSCODE_CLI_UPDATE_ENDPOINT");

/// Windows lock name for the running tunnel service. Used by the setup script
/// to detect a tunnel process. See #179265.
pub const TUNNEL_SERVICE_LOCK_NAME: Option<&'static str> =
	option_env!("VSCODE_CLI_TUNNEL_SERVICE_MUTEX");

/// Windows lock name for the running tunnel without a service. Used by the setup
/// script to detect a tunnel process. See #179265.
pub const TUNNEL_CLI_LOCK_NAME: Option<&'static str> = option_env!("VSCODE_CLI_TUNNEL_CLI_MUTEX");

pub const TUNNEL_SERVICE_USER_AGENT_ENV_VAR: &str = "TUNNEL_SERVICE_USER_AGENT";

/// Application name as it appears on the CLI.
pub const APPLICATION_NAME: &str = match option_env!("VSCODE_CLI_APPLICATION_NAME") {
	Some(n) => n,
	None => "code",
};

/// Full name of the product with its version.
pub const PRODUCT_NAME_LONG: &str = match option_env!("VSCODE_CLI_NAME_LONG") {
	Some(n) => n,
	None => "Code - OSS",
};

/// Name of the application without quality information.
pub const QUALITYLESS_PRODUCT_NAME: &str = match option_env!("VSCODE_CLI_QUALITYLESS_PRODUCT_NAME")
{
	Some(n) => n,
	None => "Code",
};

/// Name of the application without quality information.
pub const QUALITYLESS_SERVER_NAME: &str = concatcp!(QUALITYLESS_PRODUCT_NAME, " Server");

/// Web URL the editor is hosted at. For VS Code, this is vscode.dev.
pub const EDITOR_WEB_URL: Option<&'static str> = option_env!("VSCODE_CLI_EDITOR_WEB_URL");

/// Name shown in places where we need to tell a user what a process is, e.g. in sleep inhibition.
pub const TUNNEL_ACTIVITY_NAME: &str = concatcp!(PRODUCT_NAME_LONG, " Tunnel");

const NONINTERACTIVE_VAR: &str = "VSCODE_CLI_NONINTERACTIVE";

/// Default data CLI data directory.
pub const DEFAULT_DATA_PARENT_DIR: &str = match option_env!("VSCODE_CLI_DEFAULT_PARENT_DATA_DIR") {
	Some(n) => n,
	None => ".vscode-oss",
};

pub fn get_default_user_agent() -> String {
	format!(
		"vscode-server-launcher/{}",
		VSCODE_CLI_VERSION.unwrap_or("dev")
	)
}

const NO_COLOR_ENV: &str = "NO_COLOR";

lazy_static! {
	pub static ref TUNNEL_SERVICE_USER_AGENT: String =
		match std::env::var(TUNNEL_SERVICE_USER_AGENT_ENV_VAR) {
			Ok(ua) if !ua.is_empty() => format!("{} {}", ua, get_default_user_agent()),
			_ => get_default_user_agent(),
		};

	/// Map of quality names to arrays of app IDs used for them, for example, `{"stable":["ABC123"]}`
	pub static ref WIN32_APP_IDS: Option<HashMap<Quality, Vec<String>>> =
		option_env!("VSCODE_CLI_WIN32_APP_IDS").and_then(|s| serde_json::from_str(s).unwrap());

	/// Map of quality names to desktop download URIs
	pub static ref QUALITY_DOWNLOAD_URIS: Option<HashMap<Quality, String>> =
		option_env!("VSCODE_CLI_QUALITY_DOWNLOAD_URIS").and_then(|s| serde_json::from_str(s).unwrap());

	/// Map of qualities to the long name of the app in that quality
	pub static ref PRODUCT_NAME_LONG_MAP: Option<HashMap<Quality, String>> =
		option_env!("VSCODE_CLI_NAME_LONG_MAP").and_then(|s| serde_json::from_str(s).unwrap());

	/// Map of qualities to the application name
	pub static ref APPLICATION_NAME_MAP: Option<HashMap<Quality, String>> =
		option_env!("VSCODE_CLI_APPLICATION_NAME_MAP").and_then(|s| serde_json::from_str(s).unwrap());

	/// Map of qualities to the server name
	pub static ref SERVER_NAME_MAP: Option<HashMap<Quality, String>> =
		option_env!("VSCODE_CLI_SERVER_NAME_MAP").and_then(|s| serde_json::from_str(s).unwrap());

	/// Whether i/o interactions are allowed in the current CLI.
	pub static ref IS_A_TTY: bool = atty::is(atty::Stream::Stdin);

	/// Whether i/o interactions are allowed in the current CLI.
	pub static ref COLORS_ENABLED: bool = *IS_A_TTY && std::env::var(NO_COLOR_ENV).is_err();

	/// Whether i/o interactions are allowed in the current CLI.
	pub static ref IS_INTERACTIVE_CLI: bool = *IS_A_TTY && std::env::var(NONINTERACTIVE_VAR).is_err();
}
