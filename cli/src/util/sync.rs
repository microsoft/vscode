/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use tokio::sync::watch::{
	self,
	error::{RecvError, SendError},
};

#[derive(Clone)]
pub struct Barrier<T>(watch::Receiver<Option<T>>)
where
	T: Copy;

impl<T> Barrier<T>
where
	T: Copy,
{
	/// Waits for the barrier to be closed, returning a value if one was sent.
	pub async fn wait(&mut self) -> Result<T, RecvError> {
		loop {
			self.0.changed().await?;

			if let Some(v) = *(self.0.borrow()) {
				return Ok(v);
			}
		}
	}
}

pub struct BarrierOpener<T>(watch::Sender<Option<T>>);

impl<T> BarrierOpener<T> {
	/// Closes the barrier.
	pub fn open(self, value: T) -> Result<(), SendError<Option<T>>> {
		self.0.send(Some(value))
	}
}

/// The Barrier is something that can be opened once from one side,
/// and is thereafter permanently closed. It can contain a value.
pub fn new_barrier<T>() -> (Barrier<T>, BarrierOpener<T>)
where
	T: Copy,
{
	let (closed_tx, closed_rx) = watch::channel(None);
	(Barrier(closed_rx), BarrierOpener(closed_tx))
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

		opener.open(42).unwrap();

		assert!(rx.await.unwrap() == 42);
	}

	#[tokio::test]
	async fn test_barrier_close_before_spawn() {
		let (barrier, opener) = new_barrier::<u32>();
		let (tx1, rx1) = tokio::sync::oneshot::channel::<u32>();
		let (tx2, rx2) = tokio::sync::oneshot::channel::<u32>();

		opener.open(42).unwrap();
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
