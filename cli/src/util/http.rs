/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::{
	constants::get_default_user_agent,
	log,
	util::errors::{self, WrappedError},
};
use async_trait::async_trait;
use core::panic;
use futures::stream::TryStreamExt;
use hyper::{
	header::{HeaderName, CONTENT_LENGTH},
	http::HeaderValue,
	HeaderMap, StatusCode,
};
use serde::de::DeserializeOwned;
use std::{io, pin::Pin, str::FromStr, sync::Arc, task::Poll};
use tokio::{
	fs,
	io::{AsyncRead, AsyncReadExt},
	sync::mpsc,
};
use tokio_util::compat::FuturesAsyncReadCompatExt;

use super::{
	errors::{wrap, AnyError, StatusError},
	io::{copy_async_progress, ReadBuffer, ReportCopyProgress},
};

pub async fn download_into_file<T>(
	filename: &std::path::Path,
	progress: T,
	mut res: SimpleResponse,
) -> Result<fs::File, WrappedError>
where
	T: ReportCopyProgress,
{
	let mut file = fs::File::create(filename)
		.await
		.map_err(|e| errors::wrap(e, "failed to create file"))?;

	let content_length = res
		.headers
		.get(CONTENT_LENGTH)
		.and_then(|h| h.to_str().ok())
		.and_then(|s| s.parse::<u64>().ok())
		.unwrap_or(0);

	copy_async_progress(progress, &mut res.read, &mut file, content_length)
		.await
		.map_err(|e| errors::wrap(e, "failed to download file"))?;

	Ok(file)
}

pub struct SimpleResponse {
	pub status_code: StatusCode,
	pub headers: HeaderMap,
	pub read: Pin<Box<dyn Send + AsyncRead + 'static>>,
	pub url: Option<url::Url>,
}

impl SimpleResponse {
	pub fn url_path_basename(&self) -> Option<String> {
		self.url.as_ref().and_then(|u| {
			u.path_segments()
				.and_then(|s| s.last().map(|s| s.to_owned()))
		})
	}
}

impl SimpleResponse {
	pub fn generic_error(url: &str) -> Self {
		let (_, rx) = mpsc::unbounded_channel();
		SimpleResponse {
			url: url::Url::parse(url).ok(),
			status_code: StatusCode::INTERNAL_SERVER_ERROR,
			headers: HeaderMap::new(),
			read: Box::pin(DelegatedReader::new(rx)),
		}
	}

	/// Converts the response into a StatusError
	pub async fn into_err(mut self) -> StatusError {
		let mut body = String::new();
		self.read.read_to_string(&mut body).await.ok();

		StatusError {
			url: self
				.url
				.map(|u| u.to_string())
				.unwrap_or_else(|| "<invalid url>".to_owned()),
			status_code: self.status_code.as_u16(),
			body,
		}
	}

	/// Deserializes the response body as JSON
	pub async fn json<T: DeserializeOwned>(&mut self) -> Result<T, AnyError> {
		let mut buf = vec![];

		// ideally serde would deserialize a stream, but it does not appear that
		// is supported. reqwest itself reads and decodes separately like we do here:
		self.read
			.read_to_end(&mut buf)
			.await
			.map_err(|e| wrap(e, "error reading response"))?;

		let t = serde_json::from_slice(&buf)
			.map_err(|e| wrap(e, format!("error decoding json from {:?}", self.url)))?;

		Ok(t)
	}
}

/// *Very* simple HTTP implementation. In most cases, this will just delegate to
/// the request library on the server (i.e. `reqwest`) but it can also be used
/// to make update/download requests on the client rather than the server,
/// similar to SSH's `remote.SSH.localServerDownload` setting.
#[async_trait]
pub trait SimpleHttp {
	async fn make_request(
		&self,
		method: &'static str,
		url: String,
	) -> Result<SimpleResponse, AnyError>;
}

pub type BoxedHttp = Arc<dyn SimpleHttp + Send + Sync + 'static>;

// Implementation of SimpleHttp that uses a reqwest client.
#[derive(Clone)]
pub struct ReqwestSimpleHttp {
	client: reqwest::Client,
}

impl ReqwestSimpleHttp {
	pub fn new() -> Self {
		Self {
			client: reqwest::ClientBuilder::new()
				.user_agent(get_default_user_agent())
				.build()
				.unwrap(),
		}
	}

	pub fn with_client(client: reqwest::Client) -> Self {
		Self { client }
	}
}

impl Default for ReqwestSimpleHttp {
	fn default() -> Self {
		Self::new()
	}
}

#[async_trait]
impl SimpleHttp for ReqwestSimpleHttp {
	async fn make_request(
		&self,
		method: &'static str,
		url: String,
	) -> Result<SimpleResponse, AnyError> {
		let res = self
			.client
			.request(reqwest::Method::try_from(method).unwrap(), &url)
			.send()
			.await?;

		Ok(SimpleResponse {
			status_code: res.status(),
			headers: res.headers().clone(),
			url: Some(res.url().clone()),
			read: Box::pin(
				res.bytes_stream()
					.map_err(|e| futures::io::Error::new(futures::io::ErrorKind::Other, e))
					.into_async_read()
					.compat(),
			),
		})
	}
}

enum DelegatedHttpEvent {
	InitResponse {
		status_code: u16,
		headers: Vec<(String, String)>,
	},
	Body(Vec<u8>),
	End,
}

// Handle for a delegated request that allows manually issuing and response.
pub struct DelegatedHttpRequest {
	pub method: &'static str,
	pub url: String,
	ch: mpsc::UnboundedSender<DelegatedHttpEvent>,
}

impl DelegatedHttpRequest {
	pub fn initial_response(&self, status_code: u16, headers: Vec<(String, String)>) {
		self.ch
			.send(DelegatedHttpEvent::InitResponse {
				status_code,
				headers,
			})
			.ok();
	}

	pub fn body(&self, chunk: Vec<u8>) {
		self.ch.send(DelegatedHttpEvent::Body(chunk)).ok();
	}

	pub fn end(self) {}
}

impl Drop for DelegatedHttpRequest {
	fn drop(&mut self) {
		self.ch.send(DelegatedHttpEvent::End).ok();
	}
}

/// Implementation of SimpleHttp that allows manually controlling responses.
#[derive(Clone)]
pub struct DelegatedSimpleHttp {
	start_request: mpsc::Sender<DelegatedHttpRequest>,
	log: log::Logger,
}

impl DelegatedSimpleHttp {
	pub fn new(log: log::Logger) -> (Self, mpsc::Receiver<DelegatedHttpRequest>) {
		let (tx, rx) = mpsc::channel(4);
		(
			DelegatedSimpleHttp {
				log,
				start_request: tx,
			},
			rx,
		)
	}
}

#[async_trait]
impl SimpleHttp for DelegatedSimpleHttp {
	async fn make_request(
		&self,
		method: &'static str,
		url: String,
	) -> Result<SimpleResponse, AnyError> {
		trace!(self.log, "making delegated request to {}", url);
		let (tx, mut rx) = mpsc::unbounded_channel();
		let sent = self
			.start_request
			.send(DelegatedHttpRequest {
				method,
				url: url.clone(),
				ch: tx,
			})
			.await;

		if sent.is_err() {
			return Ok(SimpleResponse::generic_error(&url)); // sender shut down
		}

		match rx.recv().await {
			Some(DelegatedHttpEvent::InitResponse {
				status_code,
				headers,
			}) => {
				trace!(
					self.log,
					"delegated request to {} resulted in status = {}",
					url,
					status_code
				);
				let mut headers_map = HeaderMap::with_capacity(headers.len());
				for (k, v) in &headers {
					if let (Ok(key), Ok(value)) = (
						HeaderName::from_str(&k.to_lowercase()),
						HeaderValue::from_str(v),
					) {
						headers_map.insert(key, value);
					}
				}

				Ok(SimpleResponse {
					url: url::Url::parse(&url).ok(),
					status_code: StatusCode::from_u16(status_code)
						.unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
					headers: headers_map,
					read: Box::pin(DelegatedReader::new(rx)),
				})
			}
			Some(DelegatedHttpEvent::End) => Ok(SimpleResponse::generic_error(&url)),
			Some(_) => panic!("expected initresponse as first message from delegated http"),
			None => Ok(SimpleResponse::generic_error(&url)), // sender shut down
		}
	}
}

struct DelegatedReader {
	receiver: mpsc::UnboundedReceiver<DelegatedHttpEvent>,
	readbuf: ReadBuffer,
}

impl DelegatedReader {
	pub fn new(rx: mpsc::UnboundedReceiver<DelegatedHttpEvent>) -> Self {
		DelegatedReader {
			readbuf: ReadBuffer::default(),
			receiver: rx,
		}
	}
}

impl AsyncRead for DelegatedReader {
	fn poll_read(
		mut self: Pin<&mut Self>,
		cx: &mut std::task::Context<'_>,
		buf: &mut tokio::io::ReadBuf<'_>,
	) -> std::task::Poll<std::io::Result<()>> {
		if let Some((v, s)) = self.readbuf.take_data() {
			return self.readbuf.put_data(buf, v, s);
		}

		match self.receiver.poll_recv(cx) {
			Poll::Ready(Some(DelegatedHttpEvent::Body(msg))) => self.readbuf.put_data(buf, msg, 0),
			Poll::Ready(Some(_)) => Poll::Ready(Ok(())), // EOF
			Poll::Ready(None) => {
				Poll::Ready(Err(io::Error::new(io::ErrorKind::UnexpectedEof, "EOF")))
			}
			Poll::Pending => Poll::Pending,
		}
	}
}

/// Simple http implementation that falls back to delegated http if
/// making a direct reqwest fails.
pub struct FallbackSimpleHttp {
	native: ReqwestSimpleHttp,
	delegated: DelegatedSimpleHttp,
}

impl FallbackSimpleHttp {
	pub fn new(native: ReqwestSimpleHttp, delegated: DelegatedSimpleHttp) -> Self {
		FallbackSimpleHttp { native, delegated }
	}

	pub fn native(&self) -> ReqwestSimpleHttp {
		self.native.clone()
	}

	pub fn delegated(&self) -> DelegatedSimpleHttp {
		self.delegated.clone()
	}
}

#[async_trait]
impl SimpleHttp for FallbackSimpleHttp {
	async fn make_request(
		&self,
		method: &'static str,
		url: String,
	) -> Result<SimpleResponse, AnyError> {
		let r1 = self.native.make_request(method, url.clone()).await;
		if let Ok(res) = r1 {
			if !res.status_code.is_server_error() {
				return Ok(res);
			}
		}

		self.delegated.make_request(method, url).await
	}
}
