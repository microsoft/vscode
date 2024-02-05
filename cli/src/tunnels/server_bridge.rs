/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use super::socket_signal::{ClientMessageDecoder, ServerMessageSink};
use crate::{
	async_pipe::{get_socket_rw_stream, socket_stream_split, AsyncPipeWriteHalf},
	util::errors::AnyError,
};
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct ServerBridge {
	write: AsyncPipeWriteHalf,
	decoder: ClientMessageDecoder,
}

const BUFFER_SIZE: usize = 65536;

impl ServerBridge {
	pub async fn new(
		path: &Path,
		mut target: ServerMessageSink,
		decoder: ClientMessageDecoder,
	) -> Result<Self, AnyError> {
		let stream = get_socket_rw_stream(path).await?;
		let (mut read, write) = socket_stream_split(stream);

		tokio::spawn(async move {
			let mut read_buf = vec![0; BUFFER_SIZE];
			loop {
				match read.read(&mut read_buf).await {
					Err(_) => return,
					Ok(0) => {
						let _ = target.server_closed().await;
						return; // EOF
					}
					Ok(s) => {
						let send = target.server_message(&read_buf[..s]).await;
						if send.is_err() {
							return;
						}
					}
				}
			}
		});

		Ok(ServerBridge { write, decoder })
	}

	pub async fn write(&mut self, b: Vec<u8>) -> std::io::Result<()> {
		let dec = self.decoder.decode(&b)?;
		if !dec.is_empty() {
			self.write.write_all(dec).await?;
		}
		Ok(())
	}

	pub async fn close(mut self) -> std::io::Result<()> {
		self.write.shutdown().await?;
		Ok(())
	}
}
