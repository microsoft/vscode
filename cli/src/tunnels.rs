/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

pub mod code_server;
pub mod dev_tunnels;
pub mod legal;
pub mod local_forwarding;
pub mod paths;
pub mod protocol;
pub mod shutdown_signal;
pub mod singleton_client;
pub mod singleton_server;

pub mod agent_host;
pub mod agent_host_registry;
#[cfg(windows)]
mod agent_host_registry_acl_windows;
mod challenge;
mod control_server;
pub mod idle_timeout;
pub(crate) mod machine_status;
mod nosleep;
#[cfg(target_os = "linux")]
mod nosleep_linux;
#[cfg(target_os = "macos")]
mod nosleep_macos;
#[cfg(target_os = "windows")]
mod nosleep_windows;
mod port_forwarder;
mod server_bridge;
mod server_multiplexer;
mod service;
#[cfg(target_os = "linux")]
mod service_linux;
#[cfg(target_os = "macos")]
mod service_macos;
#[cfg(target_os = "windows")]
mod service_windows;
mod socket_signal;
pub mod user_data_path;
mod wsl_detect;

pub use control_server::{
	ready_active_agent_host, serve, serve_stream, AuthRequired, Next, ServeStreamParams,
	SharedActiveAgentHost,
};
pub use nosleep::SleepInhibitor;
pub use service::{
	create_service_manager, ServiceContainer, ServiceManager, SERVICE_LOG_FILE_NAME,
};
