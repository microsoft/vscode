/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	collections::HashMap,
	ops::{Index, IndexMut},
	sync::{Arc, Mutex},
};

use tokio::{
	pin,
	sync::{mpsc, watch},
};

use crate::{
	async_pipe::{socket_stream_split, AsyncPipe},
	json_rpc::{new_json_rpc, start_json_rpc},
	log,
	singleton::SingletonServer,
	util::{errors::CodeError, sync::Barrier},
};

use super::{
	dev_tunnels::ActiveTunnel,
	protocol::{
		self,
		forward_singleton::{PortList, SetPortsResponse},
		PortPrivacy, PortProtocol,
	},
	shutdown_signal::ShutdownSignal,
};

#[derive(Default, Clone)]
struct PortCount {
	public: u32,
	private: u32,
}

impl Index<PortPrivacy> for PortCount {
	type Output = u32;

	fn index(&self, privacy: PortPrivacy) -> &Self::Output {
		match privacy {
			PortPrivacy::Public => &self.public,
			PortPrivacy::Private => &self.private,
		}
	}
}

impl IndexMut<PortPrivacy> for PortCount {
	fn index_mut(&mut self, privacy: PortPrivacy) -> &mut Self::Output {
		match privacy {
			PortPrivacy::Public => &mut self.public,
			PortPrivacy::Private => &mut self.private,
		}
	}
}

impl PortCount {
	fn is_empty(&self) -> bool {
		self.public == 0 && self.private == 0
	}

	fn primary_privacy(&self) -> PortPrivacy {
		if self.public > 0 {
			PortPrivacy::Public
		} else {
			PortPrivacy::Private
		}
	}
}
#[derive(Clone)]
struct PortMapRec {
	count: PortCount,
	protocol: PortProtocol,
}

type PortMap = HashMap<u16, PortMapRec>;

/// The PortForwardingHandle is given out to multiple consumers to allow
/// them to set_ports that they want to be forwarded.
struct PortForwardingSender {
	/// Todo: when `SyncUnsafeCell` is no longer nightly, we can use it here with
	/// the following comment:
	///
	/// SyncUnsafeCell is used and safe here because PortForwardingSender is used
	/// exclusively in synchronous dispatch *and* we create a new sender in the
	/// context for each connection, in `serve_singleton_rpc`.
	///
	/// If PortForwardingSender is ever used in a different context, this should
	/// be refactored, e.g. to use locks or `&mut self` in set_ports`
	///
	/// see https://doc.rust-lang.org/stable/std/cell/struct.SyncUnsafeCell.html
	current: Mutex<PortList>,
	sender: Arc<Mutex<watch::Sender<PortMap>>>,
}

impl PortForwardingSender {
	pub fn set_ports(&self, ports: PortList) {
		let mut current = self.current.lock().unwrap();
		self.sender.lock().unwrap().send_modify(|v| {
			for p in current.iter() {
				if !ports.contains(p) {
					let n = v.get_mut(&p.number).expect("expected port in map");
					n.count[p.privacy] -= 1;
					if n.count.is_empty() {
						v.remove(&p.number);
					}
				}
			}

			for p in ports.iter() {
				if !current.contains(p) {
					match v.get_mut(&p.number) {
						Some(n) => {
							n.count[p.privacy] += 1;
							n.protocol = p.protocol;
						}
						None => {
							let mut count = PortCount::default();
							count[p.privacy] += 1;
							v.insert(
								p.number,
								PortMapRec {
									count,
									protocol: p.protocol,
								},
							);
						}
					};
				}
			}

			current.splice(.., ports);
		});
	}
}

impl Clone for PortForwardingSender {
	fn clone(&self) -> Self {
		Self {
			current: Mutex::new(vec![]),
			sender: self.sender.clone(),
		}
	}
}

impl Drop for PortForwardingSender {
	fn drop(&mut self) {
		self.set_ports(vec![]);
	}
}

struct PortForwardingReceiver {
	receiver: watch::Receiver<PortMap>,
}

impl PortForwardingReceiver {
	pub fn new() -> (PortForwardingSender, Self) {
		let (sender, receiver) = watch::channel(HashMap::new());
		let handle = PortForwardingSender {
			current: Mutex::new(vec![]),
			sender: Arc::new(Mutex::new(sender)),
		};

		let tracker = Self { receiver };

		(handle, tracker)
	}

	/// Applies all changes from PortForwardingHandles to the tunnel.
	pub async fn apply_to(&mut self, log: log::Logger, tunnel: Arc<ActiveTunnel>) {
		let mut current: PortMap = HashMap::new();
		while self.receiver.changed().await.is_ok() {
			let next = self.receiver.borrow().clone();

			for (port, rec) in current.iter() {
				let privacy = rec.count.primary_privacy();
				if !matches!(next.get(port), Some(n) if n.count.primary_privacy() == privacy) {
					match tunnel.remove_port(*port).await {
						Ok(_) => info!(
							log,
							"stopped forwarding {} port {} at {:?}", rec.protocol, *port, privacy
						),
						Err(e) => error!(
							log,
							"failed to stop forwarding {} port {}: {}", rec.protocol, port, e
						),
					}
				}
			}

			for (port, rec) in next.iter() {
				let privacy = rec.count.primary_privacy();
				if !matches!(current.get(port), Some(n) if n.count.primary_privacy() == privacy) {
					match tunnel.add_port_tcp(*port, privacy, rec.protocol).await {
						Ok(_) => info!(
							log,
							"forwarding {} port {} at {:?}", rec.protocol, port, privacy
						),
						Err(e) => error!(
							log,
							"failed to forward {} port {}: {}", rec.protocol, port, e
						),
					}
				}
			}

			current = next;
		}
	}
}

pub struct SingletonClientArgs {
	pub log: log::Logger,
	pub stream: AsyncPipe,
	pub shutdown: Barrier<ShutdownSignal>,
	pub port_requests: watch::Receiver<PortList>,
}

#[derive(Clone)]
struct SingletonServerContext {
	log: log::Logger,
	handle: PortForwardingSender,
	tunnel: Arc<ActiveTunnel>,
}

/// Serves a client singleton for port forwarding.
pub async fn client(args: SingletonClientArgs) -> Result<(), std::io::Error> {
	let mut rpc = new_json_rpc();
	let (msg_tx, msg_rx) = mpsc::unbounded_channel();
	let SingletonClientArgs {
		log,
		shutdown,
		stream,
		mut port_requests,
	} = args;

	debug!(
		log,
		"An existing port forwarding process is running on this machine, connecting to it..."
	);

	let caller = rpc.get_caller(msg_tx);
	let rpc = rpc.methods(()).build(log.clone());
	let (read, write) = socket_stream_split(stream);

	let serve = start_json_rpc(rpc, read, write, msg_rx, shutdown);
	let forward = async move {
		while port_requests.changed().await.is_ok() {
			let ports = port_requests.borrow().clone();
			let r = caller
				.call::<_, _, protocol::forward_singleton::SetPortsResponse>(
					protocol::forward_singleton::METHOD_SET_PORTS,
					protocol::forward_singleton::SetPortsParams { ports },
				)
				.await
				.unwrap();

			match r {
				Err(e) => error!(log, "failed to set ports: {:?}", e),
				Ok(r) => print_forwarding_addr(&r),
			};
		}
	};

	tokio::select! {
		r = serve => r.map(|_| ()),
		_ = forward => Ok(()),
	}
}

/// Serves a port-forwarding singleton.
pub async fn server(
	log: log::Logger,
	tunnel: ActiveTunnel,
	server: SingletonServer,
	mut port_requests: watch::Receiver<PortList>,
	shutdown_rx: Barrier<ShutdownSignal>,
) -> Result<(), CodeError> {
	let tunnel = Arc::new(tunnel);
	let (forward_tx, mut forward_rx) = PortForwardingReceiver::new();

	let forward_own_tunnel = tunnel.clone();
	let forward_own_tx = forward_tx.clone();
	let forward_own = async move {
		while port_requests.changed().await.is_ok() {
			forward_own_tx.set_ports(port_requests.borrow().clone());
			print_forwarding_addr(&SetPortsResponse {
				port_format: forward_own_tunnel.get_port_format().ok(),
			});
		}
	};

	tokio::select! {
		_ = forward_own => Ok(()),
		_ = forward_rx.apply_to(log.clone(), tunnel.clone()) => Ok(()),
		r = serve_singleton_rpc(server, log, tunnel, forward_tx, shutdown_rx) => r,
	}
}

async fn serve_singleton_rpc(
	mut server: SingletonServer,
	log: log::Logger,
	tunnel: Arc<ActiveTunnel>,
	forward_tx: PortForwardingSender,
	shutdown_rx: Barrier<ShutdownSignal>,
) -> Result<(), CodeError> {
	let mut own_shutdown = shutdown_rx.clone();
	let shutdown_fut = own_shutdown.wait();
	pin!(shutdown_fut);

	loop {
		let cnx = tokio::select! {
			c = server.accept() => c?,
			_ = &mut shutdown_fut => return Ok(()),
		};

		let (read, write) = socket_stream_split(cnx);
		let shutdown_rx = shutdown_rx.clone();

		let handle = forward_tx.clone();
		let log = log.clone();
		let tunnel = tunnel.clone();
		tokio::spawn(async move {
			// we make an rpc for the connection instead of re-using a dispatcher
			// so that we can have the "handle" drop when the connection drops.
			let rpc = new_json_rpc();
			let mut rpc = rpc.methods(SingletonServerContext {
				log: log.clone(),
				handle,
				tunnel,
			});

			rpc.register_sync(
				protocol::forward_singleton::METHOD_SET_PORTS,
				|p: protocol::forward_singleton::SetPortsParams, ctx| {
					info!(ctx.log, "client setting ports to {:?}", p.ports);
					ctx.handle.set_ports(p.ports);
					Ok(SetPortsResponse {
						port_format: ctx.tunnel.get_port_format().ok(),
					})
				},
			);

			let _ = start_json_rpc(rpc.build(log), read, write, (), shutdown_rx).await;
		});
	}
}

fn print_forwarding_addr(r: &SetPortsResponse) {
	eprintln!("{}\n", serde_json::to_string(r).unwrap());
}
