/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	collections::HashMap,
	future,
	sync::{
		atomic::{AtomicU32, Ordering},
		Arc, Mutex,
	},
};

use crate::log;
use futures::{future::BoxFuture, Future, FutureExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::{
	io::{AsyncReadExt, AsyncWriteExt, DuplexStream, WriteHalf},
	sync::{mpsc, oneshot},
};

use crate::util::errors::AnyError;

pub type SyncMethod = Arc<dyn Send + Sync + Fn(Option<u32>, &[u8]) -> Option<Vec<u8>>>;
pub type AsyncMethod =
	Arc<dyn Send + Sync + Fn(Option<u32>, &[u8]) -> BoxFuture<'static, Option<Vec<u8>>>>;
pub type Duplex = Arc<
	dyn Send
		+ Sync
		+ Fn(Option<u32>, &[u8]) -> (Option<StreamDto>, BoxFuture<'static, Option<Vec<u8>>>),
>;

pub enum Method {
	Sync(SyncMethod),
	Async(AsyncMethod),
	Duplex(Duplex),
}

/// Serialization is given to the RpcBuilder and defines how data gets serialized
/// when callinth methods.
pub trait Serialization: Send + Sync + 'static {
	fn serialize(&self, value: impl Serialize) -> Vec<u8>;
	fn deserialize<P: DeserializeOwned>(&self, b: &[u8]) -> Result<P, AnyError>;
}

/// RPC is a basic, transport-agnostic builder for RPC methods. You can
/// register methods to it, then call `.build()` to get a "dispatcher" type.
pub struct RpcBuilder<S> {
	serializer: Arc<S>,
	methods: HashMap<&'static str, Method>,
	calls: Arc<Mutex<HashMap<u32, DispatchMethod>>>,
}

impl<S: Serialization> RpcBuilder<S> {
	/// Creates a new empty RPC builder.
	pub fn new(serializer: S) -> Self {
		Self {
			serializer: Arc::new(serializer),
			methods: HashMap::new(),
			calls: Arc::new(std::sync::Mutex::new(HashMap::new())),
		}
	}

	/// Creates a caller that will be connected to any eventual dispatchers,
	/// and that sends data to the "tx" channel.
	pub fn get_caller(&mut self, sender: mpsc::UnboundedSender<Vec<u8>>) -> RpcCaller<S> {
		RpcCaller {
			serializer: self.serializer.clone(),
			calls: self.calls.clone(),
			sender,
		}
	}

	/// Gets a method builder.
	pub fn methods<C: Send + Sync + 'static>(self, context: C) -> RpcMethodBuilder<S, C> {
		RpcMethodBuilder {
			context: Arc::new(context),
			serializer: self.serializer,
			methods: self.methods,
			calls: self.calls,
		}
	}
}

pub struct RpcMethodBuilder<S, C> {
	context: Arc<C>,
	serializer: Arc<S>,
	methods: HashMap<&'static str, Method>,
	calls: Arc<Mutex<HashMap<u32, DispatchMethod>>>,
}

#[derive(Serialize)]
struct DuplexStreamStarted {
	pub for_request_id: u32,
	pub stream_ids: Vec<u32>,
}

impl<S: Serialization, C: Send + Sync + 'static> RpcMethodBuilder<S, C> {
	/// Registers a synchronous rpc call that returns its result directly.
	pub fn register_sync<P, R, F>(&mut self, method_name: &'static str, callback: F)
	where
		P: DeserializeOwned,
		R: Serialize,
		F: Fn(P, &C) -> Result<R, AnyError> + Send + Sync + 'static,
	{
		if self.methods.contains_key(method_name) {
			panic!("Method already registered: {}", method_name);
		}

		let serial = self.serializer.clone();
		let context = self.context.clone();
		self.methods.insert(
			method_name,
			Method::Sync(Arc::new(move |id, body| {
				let param = match serial.deserialize::<RequestParams<P>>(body) {
					Ok(p) => p,
					Err(err) => {
						return id.map(|id| {
							serial.serialize(&ErrorResponse {
								id,
								error: ResponseError {
									code: 0,
									message: format!("{:?}", err),
								},
							})
						})
					}
				};

				match callback(param.params, &context) {
					Ok(result) => id.map(|id| serial.serialize(&SuccessResponse { id, result })),
					Err(err) => id.map(|id| {
						serial.serialize(&ErrorResponse {
							id,
							error: ResponseError {
								code: -1,
								message: format!("{:?}", err),
							},
						})
					}),
				}
			})),
		);
	}

	/// Registers an async rpc call that returns a Future.
	pub fn register_async<P, R, Fut, F>(&mut self, method_name: &'static str, callback: F)
	where
		P: DeserializeOwned + Send + 'static,
		R: Serialize + Send + Sync + 'static,
		Fut: Future<Output = Result<R, AnyError>> + Send,
		F: (Fn(P, Arc<C>) -> Fut) + Clone + Send + Sync + 'static,
	{
		let serial = self.serializer.clone();
		let context = self.context.clone();
		self.methods.insert(
			method_name,
			Method::Async(Arc::new(move |id, body| {
				let param = match serial.deserialize::<RequestParams<P>>(body) {
					Ok(p) => p,
					Err(err) => {
						return future::ready(id.map(|id| {
							serial.serialize(&ErrorResponse {
								id,
								error: ResponseError {
									code: 0,
									message: format!("{:?}", err),
								},
							})
						}))
						.boxed();
					}
				};

				let callback = callback.clone();
				let serial = serial.clone();
				let context = context.clone();
				let fut = async move {
					match callback(param.params, context).await {
						Ok(result) => {
							id.map(|id| serial.serialize(&SuccessResponse { id, result }))
						}
						Err(err) => id.map(|id| {
							serial.serialize(&ErrorResponse {
								id,
								error: ResponseError {
									code: -1,
									message: format!("{:?}", err),
								},
							})
						}),
					}
				};

				fut.boxed()
			})),
		);
	}

	/// Registers an async rpc call that returns a Future containing a duplex
	/// stream that should be handled by the client.
	pub fn register_duplex<P, R, Fut, F>(
		&mut self,
		method_name: &'static str,
		streams: usize,
		callback: F,
	) where
		P: DeserializeOwned + Send + 'static,
		R: Serialize + Send + Sync + 'static,
		Fut: Future<Output = Result<R, AnyError>> + Send,
		F: (Fn(Vec<DuplexStream>, P, Arc<C>) -> Fut) + Clone + Send + Sync + 'static,
	{
		let serial = self.serializer.clone();
		let context = self.context.clone();
		self.methods.insert(
			method_name,
			Method::Duplex(Arc::new(move |id, body| {
				let param = match serial.deserialize::<RequestParams<P>>(body) {
					Ok(p) => p,
					Err(err) => {
						return (
							None,
							future::ready(id.map(|id| {
								serial.serialize(&ErrorResponse {
									id,
									error: ResponseError {
										code: 0,
										message: format!("{:?}", err),
									},
								})
							}))
							.boxed(),
						);
					}
				};

				let callback = callback.clone();
				let serial = serial.clone();
				let context = context.clone();

				let mut dto = StreamDto {
					req_id: id.unwrap_or(0),
					streams: Vec::with_capacity(streams),
				};
				let mut servers = Vec::with_capacity(streams);

				for _ in 0..streams {
					let (client, server) = tokio::io::duplex(8192);
					servers.push(server);
					dto.streams.push((next_message_id(), client));
				}

				let fut = async move {
					match callback(servers, param.params, context).await {
						Ok(r) => id.map(|id| serial.serialize(&SuccessResponse { id, result: r })),
						Err(err) => id.map(|id| {
							serial.serialize(&ErrorResponse {
								id,
								error: ResponseError {
									code: -1,
									message: format!("{:?}", err),
								},
							})
						}),
					}
				};

				(Some(dto), fut.boxed())
			})),
		);
	}

	/// Builds into a usable, sync rpc dispatcher.
	pub fn build(mut self, log: log::Logger) -> RpcDispatcher<S, C> {
		let streams = Streams::default();

		let s1 = streams.clone();
		self.register_async(METHOD_STREAM_ENDED, move |m: StreamEndedParams, _| {
			let s1 = s1.clone();
			async move {
				s1.remove(m.stream).await;
				Ok(())
			}
		});

		let s2 = streams.clone();
		self.register_sync(METHOD_STREAM_DATA, move |m: StreamDataIncomingParams, _| {
			s2.write(m.stream, m.segment);
			Ok(())
		});

		RpcDispatcher {
			log,
			context: self.context,
			calls: self.calls,
			serializer: self.serializer,
			methods: Arc::new(self.methods),
			streams,
		}
	}
}

type DispatchMethod = Box<dyn Send + Sync + FnOnce(Outcome)>;

/// Dispatcher returned from a Builder that provides a transport-agnostic way to
/// deserialize and dispatch RPC calls. This structure may get more advanced as
/// time goes on...
#[derive(Clone)]
pub struct RpcCaller<S: Serialization> {
	serializer: Arc<S>,
	calls: Arc<Mutex<HashMap<u32, DispatchMethod>>>,
	sender: mpsc::UnboundedSender<Vec<u8>>,
}

impl<S: Serialization> RpcCaller<S> {
	pub fn serialize_notify<M, A>(serializer: &S, method: M, params: A) -> Vec<u8>
	where
		S: Serialization,
		M: AsRef<str> + serde::Serialize,
		A: Serialize,
	{
		serializer.serialize(&FullRequest {
			id: None,
			method,
			params,
		})
	}

	/// Enqueues an outbound call. Returns whether the message was enqueued.
	pub fn notify<M, A>(&self, method: M, params: A) -> bool
	where
		M: AsRef<str> + serde::Serialize,
		A: Serialize,
	{
		self.sender
			.send(Self::serialize_notify(&self.serializer, method, params))
			.is_ok()
	}

	/// Enqueues an outbound call, returning its result.
	pub fn call<M, A, R>(&self, method: M, params: A) -> oneshot::Receiver<Result<R, ResponseError>>
	where
		M: AsRef<str> + serde::Serialize,
		A: Serialize,
		R: DeserializeOwned + Send + 'static,
	{
		let (tx, rx) = oneshot::channel();
		let id = next_message_id();
		let body = self.serializer.serialize(&FullRequest {
			id: Some(id),
			method,
			params,
		});

		if self.sender.send(body).is_err() {
			drop(tx);
			return rx;
		}

		let serializer = self.serializer.clone();
		self.calls.lock().unwrap().insert(
			id,
			Box::new(move |body| {
				match body {
					Outcome::Error(e) => tx.send(Err(e)).ok(),
					Outcome::Success(r) => match serializer.deserialize::<SuccessResponse<R>>(&r) {
						Ok(r) => tx.send(Ok(r.result)).ok(),
						Err(err) => tx
							.send(Err(ResponseError {
								code: 0,
								message: err.to_string(),
							}))
							.ok(),
					},
				};
			}),
		);

		rx
	}
}

/// Dispatcher returned from a Builder that provides a transport-agnostic way to
/// deserialize and handle RPC calls. This structure may get more advanced as
/// time goes on...
#[derive(Clone)]
pub struct RpcDispatcher<S, C> {
	log: log::Logger,
	context: Arc<C>,
	serializer: Arc<S>,
	methods: Arc<HashMap<&'static str, Method>>,
	calls: Arc<Mutex<HashMap<u32, DispatchMethod>>>,
	streams: Streams,
}

static MESSAGE_ID_COUNTER: AtomicU32 = AtomicU32::new(0);
fn next_message_id() -> u32 {
	MESSAGE_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
}

impl<S: Serialization, C: Send + Sync> RpcDispatcher<S, C> {
	/// Runs the incoming request, returning the result of the call synchronously
	/// or in a future. (The caller can then decide whether to run the future
	/// sequentially in its receive loop, or not.)
	///
	/// The future or return result will be optional bytes that should be sent
	/// back to the socket.
	pub fn dispatch(&self, body: &[u8]) -> MaybeSync {
		match self.serializer.deserialize::<PartialIncoming>(body) {
			Ok(partial) => self.dispatch_with_partial(body, partial),
			Err(_err) => {
				warning!(self.log, "Failed to deserialize request, hex: {:X?}", body);
				MaybeSync::Sync(None)
			}
		}
	}

	/// Like dispatch, but allows passing an existing PartialIncoming.
	pub fn dispatch_with_partial(&self, body: &[u8], partial: PartialIncoming) -> MaybeSync {
		let id = partial.id;

		if let Some(method_name) = partial.method {
			let method = self.methods.get(method_name.as_str());
			match method {
				Some(Method::Sync(callback)) => MaybeSync::Sync(callback(id, body)),
				Some(Method::Async(callback)) => MaybeSync::Future(callback(id, body)),
				Some(Method::Duplex(callback)) => MaybeSync::Stream(callback(id, body)),
				None => MaybeSync::Sync(id.map(|id| {
					self.serializer.serialize(&ErrorResponse {
						id,
						error: ResponseError {
							code: -1,
							message: format!("Method not found: {}", method_name),
						},
					})
				})),
			}
		} else if let Some(err) = partial.error {
			if let Some(cb) = self.calls.lock().unwrap().remove(&id.unwrap()) {
				cb(Outcome::Error(err));
			}
			MaybeSync::Sync(None)
		} else {
			if let Some(cb) = self.calls.lock().unwrap().remove(&id.unwrap()) {
				cb(Outcome::Success(body.to_vec()));
			}
			MaybeSync::Sync(None)
		}
	}

	/// Registers a stream call returned from dispatch().
	pub async fn register_stream(
		&self,
		write_tx: mpsc::Sender<impl 'static + From<Vec<u8>> + Send>,
		dto: StreamDto,
	) {
		let r = write_tx
			.send(
				self.serializer
					.serialize(&FullRequest {
						id: None,
						method: METHOD_STREAMS_STARTED,
						params: DuplexStreamStarted {
							stream_ids: dto.streams.iter().map(|(id, _)| *id).collect(),
							for_request_id: dto.req_id,
						},
					})
					.into(),
			)
			.await;

		if r.is_err() {
			return;
		}

		for (stream_id, duplex) in dto.streams {
			let (mut read, write) = tokio::io::split(duplex);
			self.streams.insert(stream_id, write);

			let write_tx = write_tx.clone();
			let serial = self.serializer.clone();
			tokio::spawn(async move {
				let mut buf = vec![0; 4096];
				loop {
					match read.read(&mut buf).await {
						Ok(0) | Err(_) => break,
						Ok(n) => {
							let r = write_tx
								.send(
									serial
										.serialize(&FullRequest {
											id: None,
											method: METHOD_STREAM_DATA,
											params: StreamDataParams {
												segment: &buf[..n],
												stream: stream_id,
											},
										})
										.into(),
								)
								.await;

							if r.is_err() {
								return;
							}
						}
					}
				}

				let _ = write_tx
					.send(
						serial
							.serialize(&FullRequest {
								id: None,
								method: METHOD_STREAM_ENDED,
								params: StreamEndedParams { stream: stream_id },
							})
							.into(),
					)
					.await;
			});
		}
	}

	pub fn context(&self) -> Arc<C> {
		self.context.clone()
	}
}

struct StreamRec {
	write: Option<WriteHalf<DuplexStream>>,
	q: Vec<Vec<u8>>,
}

#[derive(Clone, Default)]
struct Streams {
	map: Arc<std::sync::Mutex<HashMap<u32, StreamRec>>>,
}

impl Streams {
	pub async fn remove(&self, id: u32) {
		let stream = self.map.lock().unwrap().remove(&id);
		if let Some(s) = stream {
			// if there's no 'write' right now, it'll shut down in the write_loop
			if let Some(mut w) = s.write {
				let _ = w.shutdown().await;
			}
		}
	}

	pub fn write(&self, id: u32, buf: Vec<u8>) {
		let mut map = self.map.lock().unwrap();
		if let Some(s) = map.get_mut(&id) {
			s.q.push(buf);

			if let Some(w) = s.write.take() {
				tokio::spawn(write_loop(id, w, self.map.clone()));
			}
		}
	}

	pub fn insert(&self, id: u32, stream: WriteHalf<DuplexStream>) {
		self.map.lock().unwrap().insert(
			id,
			StreamRec {
				write: Some(stream),
				q: Vec::new(),
			},
		);
	}
}

/// Write loop started by `Streams.write`. It takes the WriteHalf, and
/// runs until there's no more items in the 'write queue'. At that point, if the
/// record still exists in the `streams` (i.e. we haven't shut down), it'll
/// return the WriteHalf so that the next `write` call starts
/// the loop again. Otherwise, it'll shut down the WriteHalf.
///
/// This is the equivalent of the same write_loop in the server_multiplexer.
/// I couldn't figure out a nice way to abstract it without introducing
/// performance overhead...
async fn write_loop(
	id: u32,
	mut w: WriteHalf<DuplexStream>,
	streams: Arc<std::sync::Mutex<HashMap<u32, StreamRec>>>,
) {
	let mut items_vec = vec![];
	loop {
		{
			let mut lock = streams.lock().unwrap();
			let stream_rec = match lock.get_mut(&id) {
				Some(b) => b,
				None => break,
			};

			if stream_rec.q.is_empty() {
				stream_rec.write = Some(w);
				return;
			}

			std::mem::swap(&mut stream_rec.q, &mut items_vec);
		}

		for item in items_vec.drain(..) {
			if w.write_all(&item).await.is_err() {
				break;
			}
		}
	}

	let _ = w.shutdown().await; // got here from `break` above, meaning our record got cleared. Close the bridge if so
}

const METHOD_STREAMS_STARTED: &str = "streams_started";
const METHOD_STREAM_DATA: &str = "stream_data";
const METHOD_STREAM_ENDED: &str = "stream_ended";

trait AssertIsSync: Sync {}
impl<S: Serialization, C: Send + Sync> AssertIsSync for RpcDispatcher<S, C> {}

/// Approximate shape that is used to determine what kind of data is incoming.
#[derive(Deserialize, Debug)]
pub struct PartialIncoming {
	pub id: Option<u32>,
	pub method: Option<String>,
	pub error: Option<ResponseError>,
}

#[derive(Deserialize)]
struct StreamDataIncomingParams {
	#[serde(with = "serde_bytes")]
	pub segment: Vec<u8>,
	pub stream: u32,
}

#[derive(Serialize, Deserialize)]
struct StreamDataParams<'a> {
	#[serde(with = "serde_bytes")]
	pub segment: &'a [u8],
	pub stream: u32,
}

#[derive(Serialize, Deserialize)]
struct StreamEndedParams {
	pub stream: u32,
}

#[derive(Serialize)]
pub struct FullRequest<M: AsRef<str>, P> {
	pub id: Option<u32>,
	pub method: M,
	pub params: P,
}

#[derive(Deserialize)]
struct RequestParams<P> {
	pub params: P,
}

#[derive(Serialize, Deserialize)]
struct SuccessResponse<T> {
	pub id: u32,
	pub result: T,
}

#[derive(Serialize, Deserialize)]
struct ErrorResponse {
	pub id: u32,
	pub error: ResponseError,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ResponseError {
	pub code: i32,
	pub message: String,
}

enum Outcome {
	Success(Vec<u8>),
	Error(ResponseError),
}

pub struct StreamDto {
	req_id: u32,
	streams: Vec<(u32, DuplexStream)>,
}

pub enum MaybeSync {
	Stream((Option<StreamDto>, BoxFuture<'static, Option<Vec<u8>>>)),
	Future(BoxFuture<'static, Option<Vec<u8>>>),
	Sync(Option<Vec<u8>>),
}
