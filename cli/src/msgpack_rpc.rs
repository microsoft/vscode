/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use bytes::Buf;
use serde::de::DeserializeOwned;
use tokio::{
	io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
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
use std::io::{self, Cursor, ErrorKind};

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

/// Creates a new RPC Builder that serializes to msgpack.
pub fn new_msgpack_rpc() -> rpc::RpcBuilder<MsgPackSerializer> {
	rpc::RpcBuilder::new(MsgPackSerializer {})
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
	let mut decoder = MsgPackCodec::new();
	let mut decoder_buf = bytes::BytesMut::new();

	let shutdown_fut = shutdown_rx.wait();
	pin!(shutdown_fut);

	loop {
		tokio::select! {
			r = read.read_buf(&mut decoder_buf) => {
				r?;

				while let Some(frame) = decoder.decode(&mut decoder_buf)? {
					match dispatcher.dispatch_with_partial(&frame.vec, frame.obj) {
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

/// Reader that reads msgpack object messages in a cancellation-safe way using Tokio's codecs.
///
/// rmp_serde does not support async reads, and does not plan to. But we know every
/// type in protocol is some kind of object, so by asking to deserialize the
/// requested object from a reader (repeatedly, if incomplete) we can
/// accomplish streaming.
pub struct MsgPackCodec<T> {
	_marker: std::marker::PhantomData<T>,
}

impl<T> MsgPackCodec<T> {
	pub fn new() -> Self {
		Self {
			_marker: std::marker::PhantomData,
		}
	}
}

pub struct MsgPackDecoded<T> {
	pub obj: T,
	pub vec: Vec<u8>,
}

impl<T: DeserializeOwned> tokio_util::codec::Decoder for MsgPackCodec<T> {
	type Item = MsgPackDecoded<T>;
	type Error = io::Error;

	fn decode(&mut self, src: &mut bytes::BytesMut) -> Result<Option<Self::Item>, Self::Error> {
		let bytes_ref = src.as_ref();
		let mut cursor = Cursor::new(bytes_ref);

		match rmp_serde::decode::from_read::<_, T>(&mut cursor) {
			Err(
				rmp_serde::decode::Error::InvalidDataRead(e)
				| rmp_serde::decode::Error::InvalidMarkerRead(e),
			) if e.kind() == ErrorKind::UnexpectedEof => {
				src.reserve(1024);
				Ok(None)
			}
			Err(e) => Err(std::io::Error::new(
				std::io::ErrorKind::InvalidData,
				e.to_string(),
			)),
			Ok(obj) => {
				let len = cursor.position() as usize;
				let vec = src[..len].to_vec();
				src.advance(len);
				Ok(Some(MsgPackDecoded { obj, vec }))
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde::{Deserialize, Serialize};

	use super::*;

	#[derive(Serialize, Deserialize, PartialEq, Eq, Debug)]
	pub struct Msg {
		pub x: i32,
	}

	#[test]
	fn test_protocol() {
		let mut c = MsgPackCodec::<Msg>::new();
		let mut buf = bytes::BytesMut::new();

		assert!(c.decode(&mut buf).unwrap().is_none());

		buf.extend_from_slice(rmp_serde::to_vec_named(&Msg { x: 1 }).unwrap().as_slice());
		buf.extend_from_slice(rmp_serde::to_vec_named(&Msg { x: 2 }).unwrap().as_slice());

		assert_eq!(
			c.decode(&mut buf).unwrap().expect("expected msg1").obj,
			Msg { x: 1 }
		);
		assert_eq!(
			c.decode(&mut buf).unwrap().expect("expected msg1").obj,
			Msg { x: 2 }
		);
	}
}
