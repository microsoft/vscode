/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use async_trait::async_trait;
use std::{marker::PhantomData, sync::Arc};
use tokio::sync::{
	broadcast, mpsc,
	watch::{self, error::RecvError},
};

#[derive(Clone)]
pub struct Barrier<T>(watch::Receiver<Option<T>>)
where
	T: Clone;

impl<T> Barrier<T>
where
	T: Clone,
{
	/// Waits for the barrier to be closed, returning a value if one was sent.
	pub async fn wait(&mut self) -> Result<T, RecvError> {
		loop {
			self.0.changed().await?;

			if let Some(v) = self.0.borrow().clone() {
				return Ok(v);
			}
		}
	}

	/// Gets whether the barrier is currently open
	pub fn is_open(&self) -> bool {
		self.0.borrow().is_some()
	}
}

#[async_trait]
impl<T: Clone + Send + Sync> Receivable<T> for Barrier<T> {
	async fn recv_msg(&mut self) -> Option<T> {
		self.wait().await.ok()
	}
}

#[derive(Clone)]
pub struct BarrierOpener<T: Clone>(Arc<watch::Sender<Option<T>>>);

impl<T: Clone> BarrierOpener<T> {
	/// Opens the barrier.
	pub fn open(&self, value: T) {
		self.0.send_if_modified(|v| {
			if v.is_none() {
				*v = Some(value);
				true
			} else {
				false
			}
		});
	}
}

/// The Barrier is something that can be opened once from one side,
/// and is thereafter permanently closed. It can contain a value.
pub fn new_barrier<T>() -> (Barrier<T>, BarrierOpener<T>)
where
	T: Clone,
{
	let (closed_tx, closed_rx) = watch::channel(None);
	(Barrier(closed_rx), BarrierOpener(Arc::new(closed_tx)))
}

/// Type that can receive messages in an async way.
#[async_trait]
pub trait Receivable<T> {
	async fn recv_msg(&mut self) -> Option<T>;
}

// todo: ideally we would use an Arc in the broadcast::Receiver to avoid having
// to clone bytes everywhere, requires updating rpc consumers as well.
#[async_trait]
impl<T: Clone + Send> Receivable<T> for broadcast::Receiver<T> {
	async fn recv_msg(&mut self) -> Option<T> {
		loop {
			match self.recv().await {
				Ok(v) => return Some(v),
				Err(broadcast::error::RecvError::Lagged(_)) => continue,
				Err(broadcast::error::RecvError::Closed) => return None,
			}
		}
	}
}

#[async_trait]
impl<T: Send> Receivable<T> for mpsc::UnboundedReceiver<T> {
	async fn recv_msg(&mut self) -> Option<T> {
		self.recv().await
	}
}

#[async_trait]
impl<T: Send> Receivable<T> for () {
	async fn recv_msg(&mut self) -> Option<T> {
		futures::future::pending().await
	}
}

pub struct ConcatReceivable<T: Send, A: Receivable<T>, B: Receivable<T>> {
	left: Option<A>,
	right: B,
	_marker: PhantomData<T>,
}

impl<T: Send, A: Receivable<T>, B: Receivable<T>> ConcatReceivable<T, A, B> {
	pub fn new(left: A, right: B) -> Self {
		Self {
			left: Some(left),
			right,
			_marker: PhantomData,
		}
	}
}

#[async_trait]
impl<T: Send, A: Send + Receivable<T>, B: Send + Receivable<T>> Receivable<T>
	for ConcatReceivable<T, A, B>
{
	async fn recv_msg(&mut self) -> Option<T> {
		if let Some(left) = &mut self.left {
			match left.recv_msg().await {
				Some(v) => return Some(v),
				None => {
					self.left = None;
				}
			}
		}

		return self.right.recv_msg().await;
	}
}

pub struct MergedReceivable<T: Send, A: Receivable<T>, B: Receivable<T>> {
	left: Option<A>,
	right: Option<B>,
	_marker: PhantomData<T>,
}

impl<T: Send, A: Receivable<T>, B: Receivable<T>> MergedReceivable<T, A, B> {
	pub fn new(left: A, right: B) -> Self {
		Self {
			left: Some(left),
			right: Some(right),
			_marker: PhantomData,
		}
	}
}

#[async_trait]
impl<T: Send, A: Send + Receivable<T>, B: Send + Receivable<T>> Receivable<T>
	for MergedReceivable<T, A, B>
{
	async fn recv_msg(&mut self) -> Option<T> {
		loop {
			match (&mut self.left, &mut self.right) {
				(Some(left), Some(right)) => {
					tokio::select! {
						left = left.recv_msg() => match left {
							Some(v) => return Some(v),
							None => { self.left = None; continue; },
						},
						right = right.recv_msg() => match right {
							Some(v) => return Some(v),
							None => { self.right = None; continue; },
						},
					}
				}
				(Some(a), None) => break a.recv_msg().await,
				(None, Some(b)) => break b.recv_msg().await,
				(None, None) => break None,
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[tokio::test]
	async fn test_barrier_close_after_spawn() {
		let (mut barrier, opener) = new_barrier::<u32>();
		let (tx, rx) = tokio::sync::oneshot::channel::<u32>();

		tokio::spawn(async move {
			tx.send(barrier.wait().await.unwrap()).unwrap();
		});

		opener.open(42);

		assert!(rx.await.unwrap() == 42);
	}

	#[tokio::test]
	async fn test_barrier_close_before_spawn() {
		let (barrier, opener) = new_barrier::<u32>();
		let (tx1, rx1) = tokio::sync::oneshot::channel::<u32>();
		let (tx2, rx2) = tokio::sync::oneshot::channel::<u32>();

		opener.open(42);
		let mut b1 = barrier.clone();
		tokio::spawn(async move {
			tx1.send(b1.wait().await.unwrap()).unwrap();
		});
		let mut b2 = barrier.clone();
		tokio::spawn(async move {
			tx2.send(b2.wait().await.unwrap()).unwrap();
		});

		assert!(rx1.await.unwrap() == 42);
		assert!(rx2.await.unwrap() == 42);
	}
}
