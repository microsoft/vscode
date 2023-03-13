/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use tokio::{
	io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
	sync::mpsc,
};

use crate::{
	rpc::{self, MaybeSync, Serialization},
	util::errors::InvalidRpcDataError,
};
use std::io;

#[derive(Clone)]
pub struct JsonRpcSerializer {}

impl Serialization for JsonRpcSerializer {
	fn serialize(&self, value: impl serde::Serialize) -> Vec<u8> {
		let mut v = serde_json::to_vec(&value).unwrap();
		v.push(b'\n');
		v
	}

	fn deserialize<P: serde::de::DeserializeOwned>(
		&self,
		b: &[u8],
	) -> Result<P, crate::util::errors::AnyError> {
		serde_json::from_slice(b).map_err(|e| InvalidRpcDataError(e.to_string()).into())
	}
}

/// Creates a new RPC Builder that serializes to JSON.
#[allow(dead_code)]
pub fn new_json_rpc() -> rpc::RpcBuilder<JsonRpcSerializer> {
	rpc::RpcBuilder::new(JsonRpcSerializer {})
}

#[allow(dead_code)]
pub async fn start_json_rpc<C: Send + Sync + 'static, S>(
	dispatcher: rpc::RpcDispatcher<JsonRpcSerializer, C>,
	read: impl AsyncRead + Unpin,
	mut write: impl AsyncWrite + Unpin,
	mut msg_rx: mpsc::UnboundedReceiver<Vec<u8>>,
	mut shutdown_rx: mpsc::UnboundedReceiver<S>,
) -> io::Result<Option<S>> {
	let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Vec<u8>>();
	let mut read = BufReader::new(read);

	let mut read_buf = String::new();

	loop {
		tokio::select! {
			r = shutdown_rx.recv() => return Ok(r),
			Some(w) = write_rx.recv() => {
				write.write_all(&w).await?;
			},
			Some(w) = msg_rx.recv() => {
				write.write_all(&w).await?;
			},
			n = read.read_line(&mut read_buf) => {
				let r = match n {
					Ok(0) => return Ok(None),
					Ok(n) =>  dispatcher.dispatch(read_buf[..n].as_bytes()),
					Err(e) => return Err(e)
				};

				match r {
					MaybeSync::Sync(Some(v)) => {
						write_tx.send(v).ok();
					},
					MaybeSync::Sync(None) => continue,
					MaybeSync::Future(fut) => {
						let write_tx = write_tx.clone();
						tokio::spawn(async move {
							if let Some(v) = fut.await {
								write_tx.send(v).ok();
							}
						});
					}
				}
			}
		}
	}
}
