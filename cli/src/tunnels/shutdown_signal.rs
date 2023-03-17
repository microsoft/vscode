/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use futures::{stream::FuturesUnordered, StreamExt};
use std::fmt;
use sysinfo::Pid;

use crate::util::{
	machine::wait_until_process_exits,
	sync::{new_barrier, Barrier, Receivable},
};

/// Describes the signal to manully stop the server
#[derive(Copy, Clone)]
pub enum ShutdownSignal {
	CtrlC,
	ParentProcessKilled(Pid),
	ServiceStopped,
	RpcShutdownRequested,
	RpcRestartRequested,
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
			ShutdownSignal::RpcRestartRequested => {
				write!(f, "RPC client requested a tunnel restart")
			}
		}
	}
}

pub enum ShutdownRequest {
	CtrlC,
	ParentProcessKilled(Pid),
	Derived(Box<dyn Receivable<ShutdownSignal> + Send>),
}

impl ShutdownRequest {
	async fn wait(self) -> Option<ShutdownSignal> {
		match self {
			ShutdownRequest::CtrlC => {
				let ctrl_c = tokio::signal::ctrl_c();
				ctrl_c.await.ok();
				Some(ShutdownSignal::CtrlC)
			}
			ShutdownRequest::ParentProcessKilled(pid) => {
				wait_until_process_exits(pid, 2000).await;
				Some(ShutdownSignal::ParentProcessKilled(pid))
			}
			ShutdownRequest::Derived(mut rx) => rx.recv_msg().await,
		}
	}
	/// Creates a receiver channel sent to once any of the signals are received.
	/// Note: does not handle ServiceStopped
	pub fn create_rx(
		signals: impl IntoIterator<Item = ShutdownRequest>,
	) -> Barrier<ShutdownSignal> {
		let (barrier, opener) = new_barrier();
		let futures = signals
			.into_iter()
			.map(|s| s.wait())
			.collect::<FuturesUnordered<_>>();

		tokio::spawn(async move {
			if let Some(s) = futures.filter_map(futures::future::ready).next().await {
				opener.open(s);
			}
		});

		barrier
	}
}
