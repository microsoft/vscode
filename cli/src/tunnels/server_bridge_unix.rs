/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::path::Path;

use tokio::{
	io::{AsyncReadExt, AsyncWriteExt},
	net::{unix::OwnedWriteHalf, UnixStream},
};

use crate::util::errors::{wrap, AnyError};

use super::socket_signal::{ClientMessageDecoder, ServerMessageSink};

pub struct ServerBridge {
	write: OwnedWriteHalf,
	decoder: ClientMessageDecoder,
}

pub async fn get_socket_rw_stream(path: &Path) -> Result<UnixStream, AnyError> {
	let s = UnixStream::connect(path).await.map_err(|e| {
		wrap(
			e,
			format!(
				"error connecting to vscode server socket in {}",
				path.display()
			),
		)
	})?;

	Ok(s)
}

const BUFFER_SIZE: usize = 65536;

impl ServerBridge {
	pub async fn new(
		path: &Path,
		index: u16,
		mut target: ServerMessageSink,
		decoder: ClientMessageDecoder,
	) -> Result<Self, AnyError> {
		let stream = get_socket_rw_stream(path).await?;
		let (mut read, write) = stream.into_split();

		tokio::spawn(async move {
			let mut read_buf = vec![0; BUFFER_SIZE];
			loop {
				match read.read(&mut read_buf).await {
					Err(_) => return,
					Ok(0) => {
						let _ = target.closed_server_bridge(index).await;
						return; // EOF
					}
					Ok(s) => {
						let send = target.server_message(index, &read_buf[..s]).await;
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
