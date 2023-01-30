/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{path::Path, time::Duration};

use tokio::{
	io::{self, Interest},
	net::windows::named_pipe::{ClientOptions, NamedPipeClient},
	sync::mpsc,
	time::sleep,
};

use crate::util::errors::{wrap, AnyError};

use super::socket_signal::{ClientMessageDecoder, ServerMessageSink};

pub struct ServerBridge {
	write_tx: mpsc::Sender<Vec<u8>>,
	decoder: ClientMessageDecoder,
}

const BUFFER_SIZE: usize = 65536;

pub async fn get_socket_rw_stream(path: &Path) -> Result<NamedPipeClient, AnyError> {
	// Tokio says we can need to try in a loop. Do so.
	// https://docs.rs/tokio/latest/tokio/net/windows/named_pipe/struct.NamedPipeClient.html
	let client = loop {
		match ClientOptions::new().open(path) {
			Ok(client) => break client,
			// ERROR_PIPE_BUSY https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-
			Err(e) if e.raw_os_error() == Some(231) => sleep(Duration::from_millis(100)).await,
			Err(e) => {
				return Err(AnyError::WrappedError(wrap(
					e,
					format!(
						"error connecting to vscode server socket in {}",
						path.display()
					),
				)))
			}
		}
	};

	Ok(client)
}

impl ServerBridge {
	pub async fn new(
		path: &Path,
		mut target: ServerMessageSink,
		decoder: ClientMessageDecoder,
	) -> Result<Self, AnyError> {
		let client = get_socket_rw_stream(path).await?;
		let (write_tx, mut write_rx) = mpsc::channel(4);
		tokio::spawn(async move {
			let mut read_buf = vec![0; BUFFER_SIZE];
			let mut pending_recv: Option<Vec<u8>> = None;

			// See https://docs.rs/tokio/1.17.0/tokio/net/windows/named_pipe/struct.NamedPipeClient.html#method.ready
			// With additional complications. If there's nothing queued to write, we wait for the
			// pipe to be readable, or for something to come in. If there is something to
			// write, wait until the pipe is either readable or writable.
			loop {
				let ready_result = if pending_recv.is_none() {
					tokio::select! {
					  msg = write_rx.recv() => match msg {
						Some(msg) => {
						  pending_recv = Some(msg);
						  client.ready(Interest::READABLE | Interest::WRITABLE).await
						},
						None => return
					  },
					  r = client.ready(Interest::READABLE) => r,
					}
				} else {
					client.ready(Interest::READABLE | Interest::WRITABLE).await
				};

				let ready = match ready_result {
					Ok(r) => r,
					Err(_) => return,
				};

				if ready.is_readable() {
					match client.try_read(&mut read_buf) {
						Ok(0) => return, // EOF
						Ok(s) => {
							let send = target.server_message(&read_buf[..s]).await;
							if send.is_err() {
								return;
							}
						}
						Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
							continue;
						}
						Err(_) => return,
					}
				}

				if let Some(msg) = &pending_recv {
					if ready.is_writable() {
						match client.try_write(msg) {
							Ok(n) if n == msg.len() => pending_recv = None,
							Ok(n) => pending_recv = Some(msg[n..].to_vec()),
							Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
								continue;
							}
							Err(_) => return,
						}
					}
				}
			}
		});

		Ok(ServerBridge { write_tx, decoder })
	}

	pub async fn write(&mut self, b: Vec<u8>) -> std::io::Result<()> {
		let dec = self.decoder.decode(&b)?;
		if !dec.is_empty() {
			self.write_tx.send(dec.to_vec()).await.ok();
		}
		Ok(())
	}

	pub async fn close(self) -> std::io::Result<()> {
		drop(self.write_tx);
		Ok(())
	}
}
