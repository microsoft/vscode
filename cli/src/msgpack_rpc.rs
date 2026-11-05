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
use std::io::{self, ErrorKind};

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
/// rmp_serde does not support async reads, and does not plan to. Instead, the
/// end of each message is found by scanning msgpack value headers as bytes
/// arrive, skipping string and binary payloads by their declared lengths. The
/// message is only deserialized once it is fully buffered, so large payloads
/// that arrive over many reads are not re-parsed on every read.
pub struct MsgPackCodec<T> {
	scanner: MsgPackFrameScanner,
	_marker: std::marker::PhantomData<T>,
}

impl<T> MsgPackCodec<T> {
	pub fn new() -> Self {
		Self {
			scanner: MsgPackFrameScanner::default(),
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
		let Some(len) = self.scanner.scan(src)? else {
			src.reserve(1024);
			return Ok(None);
		};

		let obj = rmp_serde::from_slice::<T>(&src[..len])
			.map_err(|e| io::Error::new(ErrorKind::InvalidData, e.to_string()))?;
		let vec = src[..len].to_vec();
		src.advance(len);
		Ok(Some(MsgPackDecoded { obj, vec }))
	}
}

/// Maximum nesting depth of arrays and maps in a message.
const MAX_NESTING_DEPTH: usize = 1024;

/// Finds the end of the first msgpack value in a buffer without deserializing
/// it. State is kept between calls so that each header is scanned only once
/// while a message arrives over multiple reads.
#[derive(Default)]
struct MsgPackFrameScanner {
	/// Offset of the next value header to scan.
	offset: usize,
	/// Number of values remaining in each array or map being scanned.
	remaining: Vec<u64>,
}

impl MsgPackFrameScanner {
	/// Returns the length of the first msgpack value in `buf` once it is fully
	/// buffered. Until a length is returned, each call must pass a buffer that
	/// starts with the bytes passed to the previous call.
	fn scan(&mut self, buf: &[u8]) -> io::Result<Option<usize>> {
		loop {
			let Some(header) = MsgPackValueHeader::read(&buf[self.offset..])? else {
				return Ok(None);
			};
			let end = self.offset as u64 + header.len as u64 + header.payload_len;
			if end > buf.len() as u64 {
				return Ok(None);
			}
			self.offset = end as usize;

			if header.children > 0 {
				if self.remaining.len() >= MAX_NESTING_DEPTH {
					return Err(io::Error::new(
						ErrorKind::InvalidData,
						"msgpack message is nested too deeply",
					));
				}
				self.remaining.push(header.children);
				continue;
			}

			// The value is complete, which may complete the arrays and maps containing it.
			loop {
				match self.remaining.last_mut() {
					None => {
						let len = self.offset;
						self.offset = 0;
						return Ok(Some(len));
					}
					Some(remaining) => {
						*remaining -= 1;
						if *remaining > 0 {
							break;
						}
						self.remaining.pop();
					}
				}
			}
		}
	}
}

/// Header of a msgpack value: its marker and any length or extension type bytes.
struct MsgPackValueHeader {
	/// Length of the header in bytes.
	len: usize,
	/// Length of the data following the header, excluding nested values.
	payload_len: u64,
	/// Number of nested values following the header, for arrays and maps.
	children: u64,
}

impl MsgPackValueHeader {
	/// Reads the header at the start of `buf`, or returns `None` if it is incomplete.
	fn read(buf: &[u8]) -> io::Result<Option<Self>> {
		let Some(&marker) = buf.first() else {
			return Ok(None);
		};

		// Reads the big-endian size of `n` bytes that follows the marker.
		let size = |n: usize| {
			buf.get(1..=n)
				.map(|b| b.iter().fold(0u64, |size, &b| (size << 8) | u64::from(b)))
		};

		// (header length, payload length, nested values)
		let header = match marker {
			// positive and negative fixint, nil, false, true
			0x00..=0x7f | 0xe0..=0xff | 0xc0 | 0xc2 | 0xc3 => Some((1, 0, 0)),
			// fixmap, fixarray, fixstr
			0x80..=0x8f => Some((1, 0, 2 * u64::from(marker & 0x0f))),
			0x90..=0x9f => Some((1, 0, u64::from(marker & 0x0f))),
			0xa0..=0xbf => Some((1, u64::from(marker & 0x1f), 0)),
			// int8/16/32/64, uint8/16/32/64, float32/64
			0xcc | 0xd0 => Some((1, 1, 0)),
			0xcd | 0xd1 => Some((1, 2, 0)),
			0xca | 0xce | 0xd2 => Some((1, 4, 0)),
			0xcb | 0xcf | 0xd3 => Some((1, 8, 0)),
			// fixext1/2/4/8/16, including the extension type byte
			0xd4 => Some((1, 2, 0)),
			0xd5 => Some((1, 3, 0)),
			0xd6 => Some((1, 5, 0)),
			0xd7 => Some((1, 9, 0)),
			0xd8 => Some((1, 17, 0)),
			// bin8/16/32, str8/16/32
			0xc4 | 0xd9 => size(1).map(|s| (2, s, 0)),
			0xc5 | 0xda => size(2).map(|s| (3, s, 0)),
			0xc6 | 0xdb => size(4).map(|s| (5, s, 0)),
			// ext8/16/32, including the extension type byte
			0xc7 => size(1).map(|s| (3, s, 0)),
			0xc8 => size(2).map(|s| (4, s, 0)),
			0xc9 => size(4).map(|s| (6, s, 0)),
			// array16/32, map16/32
			0xdc => size(2).map(|s| (3, 0, s)),
			0xdd => size(4).map(|s| (5, 0, s)),
			0xde => size(2).map(|s| (3, 0, 2 * s)),
			0xdf => size(4).map(|s| (5, 0, 2 * s)),
			0xc1 => {
				return Err(io::Error::new(
					ErrorKind::InvalidData,
					"invalid msgpack marker 0xc1",
				))
			}
		};

		Ok(header.map(|(len, payload_len, children)| Self {
			len,
			payload_len,
			children,
		}))
	}
}

#[cfg(test)]
mod tests {
	use serde::{Deserialize, Serialize};

	use super::*;

	#[derive(Serialize, Deserialize, PartialEq, Eq, Debug, Clone)]
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

	#[test]
	fn test_decodes_messages_split_at_every_byte() {
		#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
		struct Payload {
			text: String,
			long_text: String,
			#[serde(with = "serde_bytes")]
			data: Vec<u8>,
			numbers: Vec<i64>,
			floats: (f32, f64),
			flags: std::collections::BTreeMap<String, Option<bool>>,
			nested: Vec<Msg>,
		}

		let payload = Payload {
			text: "stream_data".to_string(),
			long_text: "a".repeat(300),
			data: vec![7; 70_000],
			numbers: vec![
				0,
				127,
				128,
				256,
				65_536,
				-1,
				-33,
				-129,
				-32_769,
				i64::MIN,
				i64::MAX,
			],
			floats: (1.5, -2.25),
			flags: [("a".to_string(), Some(true)), ("b".to_string(), None)].into(),
			nested: vec![Msg { x: 1 }, Msg { x: -2 }],
		};
		let frame = rmp_serde::to_vec_named(&payload).unwrap();

		let mut codec = MsgPackCodec::<Payload>::new();
		let mut buf = bytes::BytesMut::new();
		let mut decoded = Vec::new();
		for (i, b) in frame.iter().chain(frame.iter()).enumerate() {
			buf.extend_from_slice(&[*b]);
			while let Some(d) = codec.decode(&mut buf).unwrap() {
				decoded.push((i + 1, d.obj, d.vec));
			}
		}

		assert_eq!(
			decoded,
			vec![
				(frame.len(), payload.clone(), frame.clone()),
				(frame.len() * 2, payload, frame),
			]
		);
	}

	#[test]
	fn test_scans_extension_and_large_container_headers() {
		let value = [
			&[0xdd, 0, 0, 0, 3][..],               // array32 with 3 values:
			&[0xd4, 1, 0xff],                      // fixext1
			&[0xc7, 2, 5, 0xaa, 0xbb],             // ext8 with 2 data bytes
			&[0xdf, 0, 0, 0, 1, 0xc0, 0xde, 0, 0], // map32 with nil => empty map16
		]
		.concat();

		let mut scanner = MsgPackFrameScanner::default();
		let results: Vec<_> = (1..=value.len())
			.map(|n| scanner.scan(&value[..n]).unwrap())
			.collect();

		let mut expected = vec![None; value.len() - 1];
		expected.push(Some(value.len()));
		assert_eq!(results, expected);
	}

	#[test]
	fn test_rejects_invalid_messages() {
		let decode = |bytes: &[u8]| {
			MsgPackCodec::<Msg>::new()
				.decode(&mut bytes::BytesMut::from(bytes))
				.map(|d| d.is_some())
				.map_err(|e| e.kind())
		};

		assert_eq!(
			[
				decode(&[0x81, 0xc1]),
				decode(&vec![0x91; MAX_NESTING_DEPTH + 1]),
				decode(&[0x81, 0xa1, b'y', 0x01]),
			],
			[
				Err(ErrorKind::InvalidData),
				Err(ErrorKind::InvalidData),
				Err(ErrorKind::InvalidData),
			]
		);
	}
}
