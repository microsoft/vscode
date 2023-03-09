/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{constants::APPLICATION_NAME, util::errors::CodeError};
use std::path::{Path, PathBuf};
use uuid::Uuid;

cfg_if::cfg_if! {
	if #[cfg(unix)] {
		pub type AsyncPipe = tokio::net::UnixStream;
		pub type AsyncPipeWriteHalf = tokio::net::unix::OwnedWriteHalf;
		pub type AsyncPipeReadHalf = tokio::net::unix::OwnedReadHalf;

		pub async fn get_socket_rw_stream(path: &Path) -> Result<AsyncPipe, CodeError> {
			tokio::net::UnixStream::connect(path)
				.await
				.map_err(CodeError::AsyncPipeFailed)
		}

		pub async fn listen_socket_rw_stream(path: &Path) -> Result<AsyncPipeListener, CodeError> {
			tokio::net::UnixListener::bind(path)
				.map(AsyncPipeListener)
				.map_err(CodeError::AsyncListenerFailed)
		}

		pub struct AsyncPipeListener(tokio::net::UnixListener);

		impl AsyncPipeListener {
			pub async fn accept(& self) -> Result<AsyncPipe, CodeError> {
				self.0.accept().await.map_err(CodeError::AsyncListenerFailed).map(|(s, _)| s)
			}
		}
	} else {
		pub type AsyncPipe = tokio::net::windows::named_pipe::NamedPipeClient;
		pub type AsyncPipeWriteHalf =
			tokio::io::WriteHalf<tokio::net::windows::named_pipe::NamedPipeClient>;
		pub type AsyncPipeReadHalf = tokio::io::ReadHalf<tokio::net::windows::named_pipe::NamedPipeClient>;

		pub async fn get_socket_rw_stream(path: &Path) -> Result<AsyncPipe, CodeError> {
			use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
			// Tokio says we can need to try in a loop. Do so.
			// https://docs.rs/tokio/latest/tokio/net/windows/named_pipe/struct.NamedPipeClient.html
			let client = loop {
				match ClientOptions::new().open(path) {
					Ok(client) => break client,
					// ERROR_PIPE_BUSY https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-
					Err(e) if e.raw_os_error() == Some(231) => sleep(Duration::from_millis(100)).await,
					Err(e) => return CodeError::AsyncPipeFailed(e),
				}
			};

			Ok(client)
		}

		pub async fn listen_socket_rw_stream(path: &Path) -> Result<AsyncPipeListener, CodeError> {
			// todo https://docs.rs/tokio/latest/tokio/net/windows/named_pipe/struct.NamedPipeServer.html
		}
	}
}

pub fn socket_stream_split(pipe: AsyncPipe) -> (AsyncPipeReadHalf, AsyncPipeWriteHalf) {
	cfg_if::cfg_if! {
		if #[cfg(unix)] { pipe.into_split() } else { tokio::io::split(pipe) }
	}
}

/// Gets a random name for a pipe/socket on the paltform
pub fn get_socket_name() -> PathBuf {
	cfg_if::cfg_if! {
		if #[cfg(unix)] {
			std::env::temp_dir().join(format!("{}-{}", APPLICATION_NAME, Uuid::new_v4()))
		} else {
			PathBuf::from(format!(r"\\.\pipe\{}-{}", APPLICATION_NAME, Uuid::new_v4()))
		}
	}
}
