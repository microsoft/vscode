/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use bytes::Buf;
use tokio::{
	io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
	pin,
	sync::mpsc,
};
use tokio_util::codec::Decoder;

use crate::{
	rpc::{self, MaybeSync, Serialization},
	util::{
		errors::{AnyError, InvalidRpcDataError},
		sync::{Barrier, Receivable},
	},
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

#[derive(Copy, Clone)]
pub struct LengthPrefixedMsgPackSerializer {}

impl Serialization for LengthPrefixedMsgPackSerializer {
	fn serialize(&self, value: impl serde::Serialize) -> Vec<u8> {
		let vec = rmp_serde::to_vec_named(&value).expect("expected to serialize");

		let mut vec2 = Vec::with_capacity(vec.len() + U32_SIZE);
		vec2.extend_from_slice(&u32::to_be_bytes(vec.len() as u32));
		vec2.extend_from_slice(&vec);
		vec2
	}

	fn deserialize<P: serde::de::DeserializeOwned>(&self, b: &[u8]) -> Result<P, AnyError> {
		rmp_serde::from_slice(b).map_err(|e| InvalidRpcDataError(e.to_string()).into())
	}
}

pub type MsgPackCaller = rpc::RpcCaller<MsgPackSerializer>;

/// Creates a new RPC Builder that serializes to msgpack.
pub fn new_msgpack_rpc() -> rpc::RpcBuilder<MsgPackSerializer> {
	rpc::RpcBuilder::new(MsgPackSerializer {})
}

/// Creates a new RPC Builder that serializes to length-prefixed msgpack (for the CLI talking to itself).
pub fn new_length_prefixed_msgpack_rpc() -> rpc::RpcBuilder<LengthPrefixedMsgPackSerializer> {
	rpc::RpcBuilder::new(LengthPrefixedMsgPackSerializer {})
}

/// Starting processing msgpack rpc over the given i/o. It's recommended that
/// the reader be passed in as a BufReader for efficiency.
pub async fn start_msgpack_rpc<
	C: Send + Sync + 'static,
	X: Clone,
	S: Send + Sync + Serialization,
	Read: AsyncRead + Unpin,
	Write: AsyncWrite + Unpin,
>(
	dispatcher: rpc::RpcDispatcher<S, C>,
	mut read: Read,
	mut write: Write,
	mut msg_rx: impl Receivable<Vec<u8>>,
	mut shutdown_rx: Barrier<X>,
) -> io::Result<(Option<X>, Read, Write)> {
	let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(8);
	let mut decoder = U32PrefixedCodec {};
	let mut decoder_buf = bytes::BytesMut::new();

	let shutdown_fut = shutdown_rx.wait();
	pin!(shutdown_fut);

	loop {
		tokio::select! {
			r = read.read_buf(&mut decoder_buf) => {
				r?;

				while let Some(frame) = decoder.decode(&mut decoder_buf)? {
					match dispatcher.dispatch(&frame) {
						MaybeSync::Sync(Some(v)) => {
							let _ = write_tx.send(v).await;
						},
						MaybeSync::Sync(None) => continue,
						MaybeSync::Future(fut) => {
							let write_tx = write_tx.clone();
							tokio::spawn(async move {
								if let Some(v) = fut.await {
									let _ = write_tx.send(v).await;
								}
							});
						}
						MaybeSync::Stream((stream, fut)) => {
							if let Some(stream) = stream {
								dispatcher.register_stream(write_tx.clone(), stream).await;
							}
							let write_tx = write_tx.clone();
							tokio::spawn(async move {
								if let Some(v) = fut.await {
									let _ = write_tx.send(v).await;
								}
							});
						}
					}
				};
			},
			Some(m) = write_rx.recv() => {
				write.write_all(&m).await?;
			},
			Some(m) = msg_rx.recv_msg() => {
				write.write_all(&m).await?;
			},
			r = &mut shutdown_fut => return Ok((r.ok(), read, write)),
		}

		write.flush().await?;
	}
}

/// Reader that reads length-prefixed msgpack messages in a cancellation-safe
/// way using Tokio's codecs.
pub struct U32PrefixedCodec {}

const U32_SIZE: usize = 4;

impl tokio_util::codec::Decoder for U32PrefixedCodec {
	type Item = Vec<u8>;
	type Error = io::Error;

	fn decode(&mut self, src: &mut bytes::BytesMut) -> Result<Option<Self::Item>, Self::Error> {
		if src.len() < 4 {
			src.reserve(U32_SIZE - src.len());
			return Ok(None);
		}

		let mut be_bytes = [0; U32_SIZE];
		be_bytes.copy_from_slice(&src[..U32_SIZE]);
		let required_len = U32_SIZE + (u32::from_be_bytes(be_bytes) as usize);
		if src.len() < required_len {
			src.reserve(required_len - src.len());
			return Ok(None);
		}

		let msg = src[U32_SIZE..required_len].to_vec();
		src.advance(required_len);
		Ok(Some(msg))
	}
}
