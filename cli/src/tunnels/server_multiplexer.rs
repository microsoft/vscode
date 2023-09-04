/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::Arc;

use futures::future::join_all;

use crate::log;

use super::server_bridge::ServerBridge;

type Inner = Arc<std::sync::Mutex<Option<Vec<ServerBridgeRec>>>>;

struct ServerBridgeRec {
	id: u16,
	// bridge is removed when there's a write loop currently active
	bridge: Option<ServerBridge>,
	write_queue: Vec<Vec<u8>>,
}

/// The ServerMultiplexer manages multiple server bridges and allows writing
/// to them in a thread-safe way. It is copy, sync, and clone.
#[derive(Clone)]
pub struct ServerMultiplexer {
	inner: Inner,
}

impl ServerMultiplexer {
	pub fn new() -> Self {
		Self {
			inner: Arc::new(std::sync::Mutex::new(Some(Vec::new()))),
		}
	}

	/// Adds a new bridge to the multiplexer.
	pub fn register(&self, id: u16, bridge: ServerBridge) {
		let bridge_rec = ServerBridgeRec {
			id,
			bridge: Some(bridge),
			write_queue: vec![],
		};

		let mut lock = self.inner.lock().unwrap();
		match &mut *lock {
			Some(server_bridges) => (*server_bridges).push(bridge_rec),
			None => *lock = Some(vec![bridge_rec]),
		}
	}

	/// Removes a server bridge by ID.
	pub fn remove(&self, id: u16) {
		let mut lock = self.inner.lock().unwrap();
		if let Some(bridges) = &mut *lock {
			bridges.retain(|sb| sb.id != id);
		}
	}

	/// Handle an incoming server message. This is synchronous and uses a 'write loop'
	/// to ensure message order is preserved exactly, which is necessary for compression.
	/// Returns false if there was no server with the given bridge_id.
	pub fn write_message(&self, log: &log::Logger, bridge_id: u16, message: Vec<u8>) -> bool {
		let mut lock = self.inner.lock().unwrap();

		let bridges = match &mut *lock {
			Some(sb) => sb,
			None => return false,
		};

		let record = match bridges.iter_mut().find(|b| b.id == bridge_id) {
			Some(sb) => sb,
			None => return false,
		};

		record.write_queue.push(message);
		if let Some(bridge) = record.bridge.take() {
			let bridges_lock = self.inner.clone();
			let log = log.clone();
			tokio::spawn(write_loop(log, record.id, bridge, bridges_lock));
		}

		true
	}

	/// Disposes all running server bridges.
	pub async fn dispose(&self) {
		let bridges = {
			let mut lock = self.inner.lock().unwrap();
			lock.take()
		};

		let bridges = match bridges {
			Some(b) => b,
			None => return,
		};

		join_all(
			bridges
				.into_iter()
				.filter_map(|b| b.bridge)
				.map(|b| b.close()),
		)
		.await;
	}
}

/// Write loop started by `handle_server_message`. It takes the ServerBridge, and
/// runs until there's no more items in the 'write queue'. At that point, if the
/// record still exists in the bridges_lock (i.e. we haven't shut down), it'll
/// return the ServerBridge so that the next handle_server_message call starts
/// the loop again. Otherwise, it'll close the bridge.
async fn write_loop(log: log::Logger, id: u16, mut bridge: ServerBridge, bridges_lock: Inner) {
	let mut items_vec = vec![];
	loop {
		{
			let mut lock = bridges_lock.lock().unwrap();
			let server_bridges = match &mut *lock {
				Some(sb) => sb,
				None => break,
			};

			let bridge_rec = match server_bridges.iter_mut().find(|b| id == b.id) {
				Some(b) => b,
				None => break,
			};

			if bridge_rec.write_queue.is_empty() {
				bridge_rec.bridge = Some(bridge);
				return;
			}

			std::mem::swap(&mut bridge_rec.write_queue, &mut items_vec);
		}

		for item in items_vec.drain(..) {
			if let Err(e) = bridge.write(item).await {
				warning!(log, "Error writing to server: {:?}", e);
				break;
			}
		}
	}

	bridge.close().await.ok(); // got here from `break` above, meaning our record got cleared. Close the bridge if so
}
