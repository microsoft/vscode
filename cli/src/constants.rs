/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use lazy_static::lazy_static;

pub const CONTROL_PORT: u16 = 31545;
pub const PROTOCOL_VERSION: u32 = 1;

pub const LAUNCHER_VERSION: Option<&'static str> = option_env!("LAUNCHER_VERSION");
pub const LAUNCHER_ASSET_NAME: Option<&'static str> =
    if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("x86_64-apple-darwin-signed")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("aarch64-apple-darwin-signed")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("x86_64-pc-windows-msvc-signed")
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        Some("aarch64-pc-windows-msvc-signed")
    } else {
        option_env!("LAUNCHER_ASSET_NAME")
    };

pub const LAUNCHER_AI_KEY: Option<&'static str> = option_env!("LAUNCHER_AI_KEY");
pub const LAUNCHER_AI_ENDPOINT: Option<&'static str> = option_env!("LAUNCHER_AI_ENDPOINT");
pub const VSCODE_CLI_UPDATE_ENDPOINT: Option<&'static str> = option_env!("LAUNCHER_AI_ENDPOINT");

pub const TUNNEL_SERVICE_USER_AGENT_ENV_VAR: &str = "TUNNEL_SERVICE_USER_AGENT";

pub fn get_default_user_agent() -> String {
    format!(
        "vscode-server-launcher/{}",
        LAUNCHER_VERSION.unwrap_or("dev")
    )
}

lazy_static! {
    pub static ref TUNNEL_SERVICE_USER_AGENT: String =
        match std::env::var(TUNNEL_SERVICE_USER_AGENT_ENV_VAR) {
            Ok(ua) if !ua.is_empty() => format!("{} {}", ua, get_default_user_agent()),
            _ => get_default_user_agent(),
        };
}
