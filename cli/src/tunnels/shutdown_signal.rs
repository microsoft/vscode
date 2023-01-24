/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{fmt, time::Duration};

use sysinfo::{Pid, SystemExt};
use tokio::{sync::mpsc, time::sleep};

/// Describes the signal to manully stop the server
pub enum ShutdownSignal {
	CtrlC,
	ParentProcessKilled(Pid),
	ServiceStopped,
}

impl fmt::Display for ShutdownSignal {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			ShutdownSignal::CtrlC => write!(f, "Ctrl-C received"),
			ShutdownSignal::ParentProcessKilled(p) => {
				write!(f, "Parent process {} no longer exists", p)
			}
			ShutdownSignal::ServiceStopped => write!(f, "Service stopped"),
		}
	}
}

impl ShutdownSignal {
	/// Creates a receiver channel sent to once any of the signals are received.
	/// Note: does not handle ServiceStopped
	pub fn create_rx(signals: &[ShutdownSignal]) -> mpsc::UnboundedReceiver<ShutdownSignal> {
		let (tx, rx) = mpsc::unbounded_channel();
		for signal in signals {
			let tx = tx.clone();
			match signal {
				ShutdownSignal::CtrlC => {
					let ctrl_c = tokio::signal::ctrl_c();
					tokio::spawn(async move {
						ctrl_c.await.ok();
						tx.send(ShutdownSignal::CtrlC).ok();
					});
				}
				ShutdownSignal::ParentProcessKilled(pid) => {
					let pid = *pid;
					let tx = tx.clone();
					tokio::spawn(async move {
						let mut s = sysinfo::System::new();
						while s.refresh_process(pid) {
							sleep(Duration::from_millis(2000)).await;
						}
						tx.send(ShutdownSignal::ParentProcessKilled(pid)).ok();
					});
				}
				ShutdownSignal::ServiceStopped => {
					unreachable!("Cannot use ServiceStopped in ShutdownSignal::create_rx");
				}
			}
		}
		rx
	}
}
