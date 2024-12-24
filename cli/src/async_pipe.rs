/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{constants::APPLICATION_NAME, util::errors::CodeError};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::TcpListener;
use uuid::Uuid;

// todo: we could probably abstract this into some crate, if one doesn't already exist

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
				.map_err(CodeError::AsyncPipeListenerFailed)
		}

		pub struct AsyncPipeListener(tokio::net::UnixListener);

		impl AsyncPipeListener {
			pub async fn accept(&mut self) -> Result<AsyncPipe, CodeError> {
				self.0.accept().await.map_err(CodeError::AsyncPipeListenerFailed).map(|(s, _)| s)
			}
		}

		pub fn socket_stream_split(pipe: AsyncPipe) -> (AsyncPipeReadHalf, AsyncPipeWriteHalf) {
			pipe.into_split()
		}
	} else {
		use tokio::{time::sleep, io::ReadBuf};
		use tokio::net::windows::named_pipe::{ClientOptions, ServerOptions, NamedPipeClient, NamedPipeServer};
		use std::{time::Duration, io};
		use pin_project::pin_project;

		#[pin_project(project = AsyncPipeProj)]
		pub enum AsyncPipe {
			PipeClient(#[pin] NamedPipeClient),
			PipeServer(#[pin] NamedPipeServer),
		}

		impl AsyncRead for AsyncPipe {
			fn poll_read(
				self: Pin<&mut Self>,
				cx: &mut Context<'_>,
				buf: &mut ReadBuf<'_>,
			) -> Poll<io::Result<()>> {
				match self.project() {
					AsyncPipeProj::PipeClient(c) => c.poll_read(cx, buf),
					AsyncPipeProj::PipeServer(c) => c.poll_read(cx, buf),
				}
			}
		}

		impl AsyncWrite for AsyncPipe {
			fn poll_write(
				self: Pin<&mut Self>,
				cx: &mut Context<'_>,
				buf: &[u8],
			) -> Poll<io::Result<usize>> {
				match self.project() {
					AsyncPipeProj::PipeClient(c) => c.poll_write(cx, buf),
					AsyncPipeProj::PipeServer(c) => c.poll_write(cx, buf),
				}
			}

			fn poll_write_vectored(
				self: Pin<&mut Self>,
				cx: &mut Context<'_>,
				bufs: &[io::IoSlice<'_>],
			) -> Poll<Result<usize, io::Error>> {
				match self.project() {
					AsyncPipeProj::PipeClient(c) => c.poll_write_vectored(cx, bufs),
					AsyncPipeProj::PipeServer(c) => c.poll_write_vectored(cx, bufs),
				}
			}

			fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
				match self.project() {
					AsyncPipeProj::PipeClient(c) => c.poll_flush(cx),
					AsyncPipeProj::PipeServer(c) => c.poll_flush(cx),
				}
			}

			fn is_write_vectored(&self) -> bool {
				match self {
					AsyncPipe::PipeClient(c) => c.is_write_vectored(),
					AsyncPipe::PipeServer(c) => c.is_write_vectored(),
				}
			}

			fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), io::Error>> {
				match self.project() {
					AsyncPipeProj::PipeClient(c) => c.poll_shutdown(cx),
					AsyncPipeProj::PipeServer(c) => c.poll_shutdown(cx),
				}
			}
		}

		pub type AsyncPipeWriteHalf = tokio::io::WriteHalf<AsyncPipe>;
		pub type AsyncPipeReadHalf = tokio::io::ReadHalf<AsyncPipe>;

		pub async fn get_socket_rw_stream(path: &Path) -> Result<AsyncPipe, CodeError> {
			// Tokio says we can need to try in a loop. Do so.
			// https://docs.rs/tokio/latest/tokio/net/windows/named_pipe/struct.NamedPipeClient.html
			let client = loop {
				match ClientOptions::new().open(path) {
					Ok(client) => break client,
					// ERROR_PIPE_BUSY https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-
					Err(e) if e.raw_os_error() == Some(231) => sleep(Duration::from_millis(100)).await,
					Err(e) => return Err(CodeError::AsyncPipeFailed(e)),
				}
			};

			Ok(AsyncPipe::PipeClient(client))
		}

		pub struct AsyncPipeListener {
			path: PathBuf,
			server: NamedPipeServer
		}

		impl AsyncPipeListener {
			pub async fn accept(&mut self) -> Result<AsyncPipe, CodeError> {
				// see https://docs.rs/tokio/latest/tokio/net/windows/named_pipe/struct.NamedPipeServer.html
				// this is a bit weird in that the server becomes the client once
				// they get a connection, and we create a new client.

				self.server
					.connect()
					.await
					.map_err(CodeError::AsyncPipeListenerFailed)?;

				// Construct the next server to be connected before sending the one
				// we already have of onto a task. This ensures that the server
				// isn't closed (after it's done in the task) before a new one is
				// available. Otherwise the client might error with
				// `io::ErrorKind::NotFound`.
				let next_server = ServerOptions::new()
					.create(&self.path)
					.map_err(CodeError::AsyncPipeListenerFailed)?;


				Ok(AsyncPipe::PipeServer(std::mem::replace(&mut self.server, next_server)))
			}
		}

		pub async fn listen_socket_rw_stream(path: &Path) -> Result<AsyncPipeListener, CodeError> {
			let server = ServerOptions::new()
					.first_pipe_instance(true)
					.create(path)
					.map_err(CodeError::AsyncPipeListenerFailed)?;

			Ok(AsyncPipeListener { path: path.to_owned(), server })
		}

		pub fn socket_stream_split(pipe: AsyncPipe) -> (AsyncPipeReadHalf, AsyncPipeWriteHalf) {
			tokio::io::split(pipe)
		}
	}
}

impl AsyncPipeListener {
	pub fn into_pollable(self) -> PollableAsyncListener {
		PollableAsyncListener {
			listener: Some(self),
			write_fut: tokio_util::sync::ReusableBoxFuture::new(make_accept_fut(None)),
		}
	}
}

pub struct PollableAsyncListener {
	listener: Option<AsyncPipeListener>,
	write_fut: tokio_util::sync::ReusableBoxFuture<
		'static,
		(AsyncPipeListener, Result<AsyncPipe, CodeError>),
	>,
}

async fn make_accept_fut(
	data: Option<AsyncPipeListener>,
) -> (AsyncPipeListener, Result<AsyncPipe, CodeError>) {
	match data {
		Some(mut l) => {
			let c = l.accept().await;
			(l, c)
		}
		None => unreachable!("this future should not be pollable in this state"),
	}
}

impl hyper::server::accept::Accept for PollableAsyncListener {
	type Conn = AsyncPipe;
	type Error = CodeError;

	fn poll_accept(
		mut self: Pin<&mut Self>,
		cx: &mut Context<'_>,
	) -> Poll<Option<Result<Self::Conn, Self::Error>>> {
		if let Some(l) = self.listener.take() {
			self.write_fut.set(make_accept_fut(Some(l)))
		}

		match self.write_fut.poll(cx) {
			Poll::Ready((l, cnx)) => {
				self.listener = Some(l);
				Poll::Ready(Some(cnx))
			}
			Poll::Pending => Poll::Pending,
		}
	}
}

/// Gets a random name for a pipe/socket on the platform
pub fn get_socket_name() -> PathBuf {
	cfg_if::cfg_if! {
		if #[cfg(unix)] {
			std::env::temp_dir().join(format!("{}-{}", APPLICATION_NAME, Uuid::new_v4()))
		} else {
			PathBuf::from(format!(r"\\.\pipe\{}-{}", APPLICATION_NAME, Uuid::new_v4()))
		}
	}
}

pub type AcceptedRW = (
	Box<dyn AsyncRead + Send + Unpin>,
	Box<dyn AsyncWrite + Send + Unpin>,
);

#[async_trait]
pub trait AsyncRWAccepter {
	async fn accept_rw(&mut self) -> Result<AcceptedRW, CodeError>;
}

#[async_trait]
impl AsyncRWAccepter for AsyncPipeListener {
	async fn accept_rw(&mut self) -> Result<AcceptedRW, CodeError> {
		let pipe = self.accept().await?;
		let (read, write) = socket_stream_split(pipe);
		Ok((Box::new(read), Box::new(write)))
	}
}

#[async_trait]
impl AsyncRWAccepter for TcpListener {
	async fn accept_rw(&mut self) -> Result<AcceptedRW, CodeError> {
		let (stream, _) = self
			.accept()
			.await
			.map_err(CodeError::AsyncPipeListenerFailed)?;
		let (read, write) = tokio::io::split(stream);
		Ok((Box::new(read), Box::new(write)))
	}
}
