/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fmt;
use sysinfo::Pid;

use crate::util::{
	machine::wait_until_process_exits,
	sync::{new_barrier, Barrier},
};

/// Describes the signal to manully stop the server
#[derive(Copy, Clone)]
pub enum ShutdownSignal {
	CtrlC,
	ParentProcessKilled(Pid),
	ServiceStopped,
	RpcShutdownRequested,
}

impl fmt::Display for ShutdownSignal {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			ShutdownSignal::CtrlC => write!(f, "Ctrl-C received"),
			ShutdownSignal::ParentProcessKilled(p) => {
				write!(f, "Parent process {} no longer exists", p)
			}
			ShutdownSignal::ServiceStopped => write!(f, "Service stopped"),
			ShutdownSignal::RpcShutdownRequested => write!(f, "RPC client requested shutdown"),
		}
	}
}

pub enum ShutdownRequest {
	CtrlC,
	ParentProcessKilled(Pid),
	RpcShutdownRequested(Barrier<()>),
}

impl ShutdownRequest {
	/// Creates a receiver channel sent to once any of the signals are received.
	/// Note: does not handle ServiceStopped
	pub fn create_rx(
		signals: impl IntoIterator<Item = ShutdownRequest>,
	) -> Barrier<ShutdownSignal> {
		let (barrier, opener) = new_barrier();
		for signal in signals.into_iter() {
			let opener = opener.clone();
			match signal {
				ShutdownRequest::CtrlC => {
					let ctrl_c = tokio::signal::ctrl_c();
					tokio::spawn(async move {
						ctrl_c.await.ok();
						opener.open(ShutdownSignal::CtrlC)
					});
				}
				ShutdownRequest::ParentProcessKilled(pid) => {
					tokio::spawn(async move {
						wait_until_process_exits(pid, 2000).await;
						opener.open(ShutdownSignal::ParentProcessKilled(pid))
					});
				}
				ShutdownRequest::RpcShutdownRequested(mut rx) => {
					tokio::spawn(async move {
						let _ = rx.wait().await;
						opener.open(ShutdownSignal::RpcShutdownRequested)
					});
				}
			}
		}

		barrier
	}
}
