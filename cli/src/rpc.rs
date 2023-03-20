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
use tokio::sync::{mpsc, oneshot};

use crate::util::errors::AnyError;

pub type SyncMethod = Arc<dyn Send + Sync + Fn(Option<u32>, &[u8]) -> Option<Vec<u8>>>;
pub type AsyncMethod =
	Arc<dyn Send + Sync + Fn(Option<u32>, &[u8]) -> BoxFuture<'static, Option<Vec<u8>>>>;

pub enum Method {
	Sync(SyncMethod),
	Async(AsyncMethod),
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

impl<S: Serialization, C: Send + Sync + 'static> RpcMethodBuilder<S, C> {
	/// Registers a synchronous rpc call that returns its result directly.
	pub fn register_sync<P, R, F>(&mut self, method_name: &'static str, callback: F)
	where
		P: DeserializeOwned,
		R: Serialize,
		F: Fn(P, &C) -> Result<R, AnyError> + Send + Sync + 'static,
	{
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

	/// Builds into a usable, sync rpc dispatcher.
	pub fn build(self, log: log::Logger) -> RpcDispatcher<S, C> {
		RpcDispatcher {
			log,
			context: self.context,
			calls: self.calls,
			serializer: self.serializer,
			methods: Arc::new(self.methods),
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
		let partial = match self.serializer.deserialize::<PartialIncoming>(body) {
			Ok(b) => b,
			Err(_err) => {
				warning!(self.log, "Failed to deserialize request, hex: {:X?}", body);
				return MaybeSync::Sync(None);
			}
		};
		let id = partial.id;

		if let Some(method_name) = partial.method {
			let method = self.methods.get(method_name.as_str());
			match method {
				Some(Method::Sync(callback)) => MaybeSync::Sync(callback(id, body)),
				Some(Method::Async(callback)) => MaybeSync::Future(callback(id, body)),
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

	pub fn context(&self) -> Arc<C> {
		self.context.clone()
	}
}

trait AssertIsSync: Sync {}
impl<S: Serialization, C: Send + Sync> AssertIsSync for RpcDispatcher<S, C> {}

/// Approximate shape that is used to determine what kind of data is incoming.
#[derive(Deserialize)]
struct PartialIncoming {
	pub id: Option<u32>,
	pub method: Option<String>,
	pub error: Option<ResponseError>,
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

pub enum MaybeSync {
	Future(BoxFuture<'static, Option<Vec<u8>>>),
	Sync(Option<Vec<u8>>),
}
