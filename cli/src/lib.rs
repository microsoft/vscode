/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// todo: we should reduce the exported surface area over time as things are
// moved into a common CLI
pub mod auth;
pub mod constants;
#[macro_use]
pub mod log;
pub mod commands;
pub mod desktop;
pub mod options;
pub mod self_update;
pub mod state;
pub mod tunnels;
pub mod update_service;
pub mod util;

mod async_pipe;
mod download_cache;
mod json_rpc;
mod msgpack_rpc;
mod rpc;
mod singleton;
