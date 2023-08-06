/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashSet;

use tokio::sync::{mpsc, oneshot};

use crate::{
	constants::CONTROL_PORT,
	util::errors::{AnyError, CannotForwardControlPort, ServerHasClosed},
};

use super::dev_tunnels::ActiveTunnel;

pub enum PortForwardingRec {
	Forward(u16, oneshot::Sender<Result<String, AnyError>>),
	Unforward(u16, oneshot::Sender<Result<(), AnyError>>),
}

/// Provides a port forwarding service for connected clients. Clients can make
/// requests on it, which are (and *must be*) processed by calling the `.process()`
/// method on the forwarder.
pub struct PortForwardingProcessor {
	tx: mpsc::Sender<PortForwardingRec>,
	rx: mpsc::Receiver<PortForwardingRec>,
	forwarded: HashSet<u16>,
}

impl PortForwardingProcessor {
	pub fn new() -> Self {
		let (tx, rx) = mpsc::channel(8);
		Self {
			tx,
			rx,
			forwarded: HashSet::new(),
		}
	}

	/// Gets a handle that can be passed off to consumers of port forwarding.
	pub fn handle(&self) -> PortForwarding {
		PortForwarding {
			tx: self.tx.clone(),
		}
	}

	/// Receives port forwarding requests. Consumers MUST call `process()`
	/// with the received requests.
	pub async fn recv(&mut self) -> Option<PortForwardingRec> {
		self.rx.recv().await
	}

	/// Processes the incoming forwarding request.
	pub async fn process(&mut self, req: PortForwardingRec, tunnel: &mut ActiveTunnel) {
		match req {
			PortForwardingRec::Forward(port, tx) => {
				tx.send(self.process_forward(port, tunnel).await).ok();
			}
			PortForwardingRec::Unforward(port, tx) => {
				tx.send(self.process_unforward(port, tunnel).await).ok();
			}
		}
	}

	async fn process_unforward(
		&mut self,
		port: u16,
		tunnel: &mut ActiveTunnel,
	) -> Result<(), AnyError> {
		if port == CONTROL_PORT {
			return Err(CannotForwardControlPort().into());
		}

		tunnel.remove_port(port).await?;
		self.forwarded.remove(&port);
		Ok(())
	}

	async fn process_forward(
		&mut self,
		port: u16,
		tunnel: &mut ActiveTunnel,
	) -> Result<String, AnyError> {
		if port == CONTROL_PORT {
			return Err(CannotForwardControlPort().into());
		}

		if !self.forwarded.contains(&port) {
			tunnel.add_port_tcp(port).await?;
			self.forwarded.insert(port);
		}

		tunnel.get_port_uri(port)
	}
}

#[derive(Clone)]
pub struct PortForwarding {
	tx: mpsc::Sender<PortForwardingRec>,
}

impl PortForwarding {
	pub async fn forward(&self, port: u16) -> Result<String, AnyError> {
		let (tx, rx) = oneshot::channel();
		let req = PortForwardingRec::Forward(port, tx);

		if self.tx.send(req).await.is_err() {
			return Err(ServerHasClosed().into());
		}

		match rx.await {
			Ok(r) => r,
			Err(_) => Err(ServerHasClosed().into()),
		}
	}

	pub async fn unforward(&self, port: u16) -> Result<(), AnyError> {
		let (tx, rx) = oneshot::channel();
		let req = PortForwardingRec::Unforward(port, tx);

		if self.tx.send(req).await.is_err() {
			return Err(ServerHasClosed().into());
		}

		match rx.await {
			Ok(r) => r,
			Err(_) => Err(ServerHasClosed().into()),
		}
	}
}
