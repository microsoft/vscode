/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use serde::Serialize;
use tokio::sync::mpsc;

use crate::msgpack_rpc::MsgPackCaller;

use super::{
	protocol::{ClientRequestMethod, RefServerMessageParams, ToClientRequest},
	server_multiplexer::ServerMultiplexer,
};

pub struct CloseReason(pub String);

pub enum SocketSignal {
	/// Signals bytes to send to the socket.
	Send(Vec<u8>),
	/// Closes the socket (e.g. as a result of an error)
	CloseWith(CloseReason),
}

impl From<Vec<u8>> for SocketSignal {
	fn from(v: Vec<u8>) -> Self {
		SocketSignal::Send(v)
	}
}

impl SocketSignal {
	pub fn from_message<T>(msg: &T) -> Self
	where
		T: Serialize + ?Sized,
	{
		SocketSignal::Send(rmp_serde::to_vec_named(msg).unwrap())
	}
}

/// todo@connor4312: cleanup once everything is moved to rpc standard interfaces
#[allow(dead_code)]
pub enum ServerMessageDestination {
	Channel(mpsc::Sender<SocketSignal>),
	Rpc(MsgPackCaller),
}

/// Struct that handling sending or closing a connected server socket.
pub struct ServerMessageSink {
	id: u16,
	tx: Option<ServerMessageDestination>,
	multiplexer: ServerMultiplexer,
	flate: Option<FlateStream<CompressFlateAlgorithm>>,
}

impl ServerMessageSink {
	pub fn new_plain(
		multiplexer: ServerMultiplexer,
		id: u16,
		tx: ServerMessageDestination,
	) -> Self {
		Self {
			tx: Some(tx),
			id,
			multiplexer,
			flate: None,
		}
	}

	pub fn new_compressed(
		multiplexer: ServerMultiplexer,
		id: u16,
		tx: ServerMessageDestination,
	) -> Self {
		Self {
			tx: Some(tx),
			id,
			multiplexer,
			flate: Some(FlateStream::new(CompressFlateAlgorithm(
				flate2::Compress::new(flate2::Compression::new(2), false),
			))),
		}
	}

	pub async fn server_message(
		&mut self,
		body: &[u8],
	) -> Result<(), mpsc::error::SendError<SocketSignal>> {
		let id = self.id;
		let mut tx = self.tx.take().unwrap();
		let body = self.get_server_msg_content(body);
		let msg = RefServerMessageParams { i: id, body };

		let r = match &mut tx {
			ServerMessageDestination::Channel(tx) => {
				tx.send(SocketSignal::from_message(&ToClientRequest {
					id: None,
					params: ClientRequestMethod::servermsg(msg),
				}))
				.await
			}
			ServerMessageDestination::Rpc(caller) => {
				caller.notify("servermsg", msg);
				Ok(())
			}
		};

		self.tx = Some(tx);
		r
	}

	pub(crate) fn get_server_msg_content<'a: 'b, 'b>(&'a mut self, body: &'b [u8]) -> &'b [u8] {
		if let Some(flate) = &mut self.flate {
			if let Ok(compressed) = flate.process(body) {
				return compressed;
			}
		}

		body
	}
}

impl Drop for ServerMessageSink {
	fn drop(&mut self) {
		self.multiplexer.remove(self.id);
	}
}

pub struct ClientMessageDecoder {
	dec: Option<FlateStream<DecompressFlateAlgorithm>>,
}

impl ClientMessageDecoder {
	pub fn new_plain() -> Self {
		ClientMessageDecoder { dec: None }
	}

	pub fn new_compressed() -> Self {
		ClientMessageDecoder {
			dec: Some(FlateStream::new(DecompressFlateAlgorithm(
				flate2::Decompress::new(false),
			))),
		}
	}

	pub fn decode<'a: 'b, 'b>(&'a mut self, message: &'b [u8]) -> std::io::Result<&'b [u8]> {
		match &mut self.dec {
			Some(d) => d.process(message),
			None => Ok(message),
		}
	}
}

trait FlateAlgorithm {
	fn total_in(&self) -> u64;
	fn total_out(&self) -> u64;
	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
	) -> Result<flate2::Status, std::io::Error>;
}

struct DecompressFlateAlgorithm(flate2::Decompress);

impl FlateAlgorithm for DecompressFlateAlgorithm {
	fn total_in(&self) -> u64 {
		self.0.total_in()
	}

	fn total_out(&self) -> u64 {
		self.0.total_out()
	}

	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
	) -> Result<flate2::Status, std::io::Error> {
		self.0
			.decompress(contents, output, flate2::FlushDecompress::None)
			.map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
	}
}

struct CompressFlateAlgorithm(flate2::Compress);

impl FlateAlgorithm for CompressFlateAlgorithm {
	fn total_in(&self) -> u64 {
		self.0.total_in()
	}

	fn total_out(&self) -> u64 {
		self.0.total_out()
	}

	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
	) -> Result<flate2::Status, std::io::Error> {
		self.0
			.compress(contents, output, flate2::FlushCompress::Sync)
			.map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
	}
}

struct FlateStream<A>
where
	A: FlateAlgorithm,
{
	flate: A,
	output: Vec<u8>,
}

impl<A> FlateStream<A>
where
	A: FlateAlgorithm,
{
	pub fn new(alg: A) -> Self {
		Self {
			flate: alg,
			output: vec![0; 4096],
		}
	}

	pub fn process(&mut self, contents: &[u8]) -> std::io::Result<&[u8]> {
		let mut out_offset = 0;
		let mut in_offset = 0;
		loop {
			let in_before = self.flate.total_in();
			let out_before = self.flate.total_out();

			match self
				.flate
				.process(&contents[in_offset..], &mut self.output[out_offset..])
			{
				Ok(flate2::Status::Ok | flate2::Status::BufError) => {
					let processed_len = in_offset + (self.flate.total_in() - in_before) as usize;
					let output_len = out_offset + (self.flate.total_out() - out_before) as usize;
					if processed_len < contents.len() {
						// If we filled the output buffer but there's more data to compress,
						// extend the output buffer and keep compressing.
						out_offset = output_len;
						in_offset = processed_len;
						if output_len == self.output.len() {
							self.output.resize(self.output.len() * 2, 0);
						}
						continue;
					}

					return Ok(&self.output[..output_len]);
				}
				Ok(flate2::Status::StreamEnd) => {
					return Err(std::io::Error::new(
						std::io::ErrorKind::UnexpectedEof,
						"unexpected stream end",
					))
				}
				Err(e) => return Err(e),
			}
		}
	}
}

#[cfg(test)]
mod tests {
	// Note this useful idiom: importing names from outer (for mod tests) scope.
	use super::*;

	#[test]
	fn test_round_trips_compression() {
		let (tx, _) = mpsc::channel(1);
		let mut sink = ServerMessageSink::new_compressed(
			ServerMultiplexer::new(),
			0,
			ServerMessageDestination::Channel(tx),
		);
		let mut decompress = ClientMessageDecoder::new_compressed();

		// 3000 and 30000 test resizing the buffer
		for msg_len in [3, 30, 300, 3000, 30000] {
			let vals = (0..msg_len).map(|v| v as u8).collect::<Vec<u8>>();
			let compressed = sink.get_server_msg_content(&vals);
			assert_ne!(compressed, vals);
			let decompressed = decompress.decode(compressed).unwrap();
			assert_eq!(decompressed.len(), vals.len());
			assert_eq!(decompressed, vals);
		}
	}
}
