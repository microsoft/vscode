/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use tokio::{
	io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
	pin,
	sync::mpsc,
};

use crate::{
	rpc::{self, MaybeSync, Serialization},
	util::{
		errors::InvalidRpcDataError,
		sync::{Barrier, Receivable},
	},
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
pub async fn start_json_rpc<C: Send + Sync + 'static, S: Clone>(
	dispatcher: rpc::RpcDispatcher<JsonRpcSerializer, C>,
	read: impl AsyncRead + Unpin,
	mut write: impl AsyncWrite + Unpin,
	mut msg_rx: impl Receivable<Vec<u8>>,
	mut shutdown_rx: Barrier<S>,
) -> io::Result<Option<S>> {
	let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(8);
	let mut read = BufReader::new(read);

	let mut read_buf = String::new();
	let shutdown_fut = shutdown_rx.wait();
	pin!(shutdown_fut);

	loop {
		tokio::select! {
			r = &mut shutdown_fut => return Ok(r.ok()),
			Some(w) = write_rx.recv() => {
				write.write_all(&w).await?;
			},
			Some(w) = msg_rx.recv_msg() => {
				write.write_all(&w).await?;
			},
			n = read.read_line(&mut read_buf) => {
				let r = match n {
					Ok(0) => return Ok(None),
					Ok(n) => dispatcher.dispatch(read_buf[..n].as_bytes()),
					Err(e) => return Err(e)
				};

				read_buf.truncate(0);

				match r {
					MaybeSync::Sync(Some(v)) => {
						write.write_all(&v).await?;
					},
					MaybeSync::Sync(None) => continue,
					MaybeSync::Future(fut) => {
						let write_tx = write_tx.clone();
						tokio::spawn(async move {
							if let Some(v) = fut.await {
								let _ = write_tx.send(v).await;
							}
						});
					},
					MaybeSync::Stream((dto, fut)) => {
						if let Some(dto) = dto {
							dispatcher.register_stream(write_tx.clone(), dto).await;
						}
						let write_tx = write_tx.clone();
						tokio::spawn(async move {
							if let Some(v) = fut.await {
								let _ = write_tx.send(v).await;
							}
						});
					}
				}
			}
		}
	}
}
