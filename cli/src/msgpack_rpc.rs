/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use tokio::{
	io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
	sync::mpsc,
};

use crate::{
	rpc::{self, MaybeSync, Serialization},
	util::errors::{AnyError, InvalidRpcDataError},
};
use std::io;

#[derive(Copy, Clone)]
pub struct MsgPackSerializer {}

impl Serialization for MsgPackSerializer {
	fn serialize(&self, value: impl serde::Serialize) -> Vec<u8> {
		rmp_serde::to_vec_named(&value).expect("expected to serialize")
	}

	fn deserialize<P: serde::de::DeserializeOwned>(&self, b: &[u8]) -> Result<P, AnyError> {
		rmp_serde::from_slice(b).map_err(|e| InvalidRpcDataError(e.to_string()).into())
	}
}

pub type MsgPackCaller = rpc::RpcCaller<MsgPackSerializer>;

/// Creates a new RPC Builder that serializes to JSON.
pub fn new_msgpack_rpc() -> rpc::RpcBuilder<MsgPackSerializer> {
	rpc::RpcBuilder::new(MsgPackSerializer {})
}

#[allow(clippy::read_zero_byte_vec)] // false positive
pub async fn start_msgpack_rpc<C: Send + Sync + 'static, S>(
	dispatcher: rpc::RpcDispatcher<MsgPackSerializer, C>,
	read: impl AsyncRead + Unpin,
	mut write: impl AsyncWrite + Unpin,
	mut msg_rx: mpsc::UnboundedReceiver<Vec<u8>>,
	mut shutdown_rx: mpsc::UnboundedReceiver<S>,
) -> io::Result<Option<S>> {
	let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Vec<u8>>();
	let mut read = BufReader::new(read);
	let mut decode_buf = vec![];

	loop {
		tokio::select! {
			u = read.read_u32() => {
				let msg_length = u? as usize;
				decode_buf.resize(msg_length, 0);
				tokio::select! {
					r = read.read_exact(&mut decode_buf) => match dispatcher.dispatch(&decode_buf[..r?]) {
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
					},
					r = shutdown_rx.recv() => return Ok(r),
				};
			},
			Some(m) = write_rx.recv() => {
				write.write_all(&m).await?;
			},
			Some(m) = msg_rx.recv() => {
				write.write_all(&m).await?;
			},
			r = shutdown_rx.recv() => return Ok(r),
		}

		write.flush().await?;
	}
}
