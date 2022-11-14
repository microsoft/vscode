/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

pub mod code_server;
pub mod dev_tunnels;
pub mod legal;
pub mod paths;

mod socket_signal;
mod control_server;
mod name_generator;
mod port_forwarder;
mod protocol;
#[cfg_attr(unix, path = "tunnels/server_bridge_unix.rs")]
#[cfg_attr(windows, path = "tunnels/server_bridge_windows.rs")]
mod server_bridge;
mod service;
#[cfg(target_os = "windows")]
mod service_windows;

pub use control_server::serve;
pub use service::{
	create_service_manager, ServiceContainer, ServiceManager, SERVICE_LOG_FILE_NAME,
};
