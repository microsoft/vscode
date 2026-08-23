/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Opt-in idle-timeout lifecycle for a standalone `code agent host`
//! supervisor (`--idle-timeout <seconds>`).
//!
//! The state machine here (`wait_for_idle_timeout`) is intentionally
//! decoupled from real elapsed time: it's driven entirely by an
//! [`ActivityEvent`] stream and an injectable [`IdleSleeper`] seam, so
//! its pause/reset/fire transitions can be verified deterministically in
//! tests without depending on (or asserting against) real sleeps. This
//! crate's `tokio` dependency doesn't enable the `test-util` feature (no
//! paused/mocked clock), so a real-timer-based test would otherwise have
//! to either wait out real durations or race against them, which is
//! exactly what this seam avoids.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::sync::mpsc;

/// One client-connection lifecycle event, as reported by an
/// [`ActivityTracker`]/[`ClientGuard`] pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityEvent {
	Connected,
	Disconnected,
}

/// Cloneable handle connection-accepting code uses to report activity.
/// Call [`ActivityTracker::client_connected`] exactly once per accepted
/// connection and hold the returned [`ClientGuard`] alive for exactly
/// that connection's lifetime (e.g. move it into the task/future that
/// serves the connection); dropping the guard reports the disconnect.
#[derive(Clone)]
pub struct ActivityTracker {
	tx: mpsc::UnboundedSender<ActivityEvent>,
}

impl ActivityTracker {
	/// Reports a new connection and returns a guard that reports its
	/// disconnect once dropped.
	pub fn client_connected(&self) -> ClientGuard {
		// If the receiver has already been dropped (e.g. the idle-timeout
		// race already resolved and its receiver went away), there's
		// nothing left that needs to know about activity; the resulting
		// error is intentionally ignored rather than propagated.
		let _ = self.tx.send(ActivityEvent::Connected);
		ClientGuard {
			tx: self.tx.clone(),
		}
	}
}

/// RAII guard reporting a [`ActivityEvent::Disconnected`] when dropped.
/// Must be held for exactly the connected client's lifetime.
pub struct ClientGuard {
	tx: mpsc::UnboundedSender<ActivityEvent>,
}

impl Drop for ClientGuard {
	fn drop(&mut self) {
		let _ = self.tx.send(ActivityEvent::Disconnected);
	}
}

/// Builds a connected [`ActivityTracker`]/receiver pair. An unbounded
/// channel is used deliberately: every connect/disconnect becomes an
/// ordered, queued message, so (unlike an atomic counter paired with a
/// `Notify`) no transition can ever be "missed" by a waiter that hadn't
/// re-subscribed yet.
pub fn new_activity_channel() -> (ActivityTracker, mpsc::UnboundedReceiver<ActivityEvent>) {
	let (tx, rx) = mpsc::unbounded_channel();
	(ActivityTracker { tx }, rx)
}

/// Wraps an accepted connection's transport so its [`ClientGuard`] lives
/// exactly as long as that transport does.
///
/// The guard is deliberately attached to the *stream* rather than held by
/// the task awaiting `serve_connection_with_upgrades`. That future
/// resolves as soon as an HTTP connection is upgraded — it hands the
/// transport off to `hyper::upgrade::on` and returns — so a guard held by
/// that task reports a disconnect the instant a WebSocket *starts*,
/// making a long-lived, actively-used connection invisible to the idle
/// timer. Since the resulting `hyper::upgrade::Upgraded` still owns this
/// wrapper, keeping the guard here means it survives the whole WebSocket
/// session and drops only when the transport is finally dropped.
///
/// `guard` is an `Option` so callers can wrap unconditionally, keeping a
/// single concrete stream type whether or not idle-timeout is enabled.
pub struct GuardedStream<S> {
	inner: S,
	_guard: Option<ClientGuard>,
}

impl<S> GuardedStream<S> {
	pub fn new(inner: S, guard: Option<ClientGuard>) -> Self {
		Self {
			inner,
			_guard: guard,
		}
	}
}

impl<S: AsyncRead + Unpin> AsyncRead for GuardedStream<S> {
	fn poll_read(
		mut self: Pin<&mut Self>,
		cx: &mut Context<'_>,
		buf: &mut ReadBuf<'_>,
	) -> Poll<std::io::Result<()>> {
		Pin::new(&mut self.inner).poll_read(cx, buf)
	}
}

impl<S: AsyncWrite + Unpin> AsyncWrite for GuardedStream<S> {
	fn poll_write(
		mut self: Pin<&mut Self>,
		cx: &mut Context<'_>,
		buf: &[u8],
	) -> Poll<std::io::Result<usize>> {
		Pin::new(&mut self.inner).poll_write(cx, buf)
	}

	fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
		Pin::new(&mut self.inner).poll_flush(cx)
	}

	fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
		Pin::new(&mut self.inner).poll_shutdown(cx)
	}

	fn poll_write_vectored(
		mut self: Pin<&mut Self>,
		cx: &mut Context<'_>,
		bufs: &[std::io::IoSlice<'_>],
	) -> Poll<std::io::Result<usize>> {
		Pin::new(&mut self.inner).poll_write_vectored(cx, bufs)
	}

	fn is_write_vectored(&self) -> bool {
		self.inner.is_write_vectored()
	}
}

/// Injectable timer seam so [`wait_for_idle_timeout`] can be driven
/// deterministically in tests. The production implementation
/// ([`TokioIdleSleeper`]) simply wraps [`tokio::time::sleep`].
pub trait IdleSleeper: Send + Sync {
	/// Returns a future that resolves once `duration` has elapsed,
	/// starting from whenever the returned future is first polled
	/// (matching [`tokio::time::sleep`]'s contract).
	fn sleep(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send>>;
}

/// Production [`IdleSleeper`] backed by the real Tokio timer.
pub struct TokioIdleSleeper;

impl IdleSleeper for TokioIdleSleeper {
	fn sleep(&self, duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send>> {
		Box::pin(tokio::time::sleep(duration))
	}
}

/// Resolves once `idle_timeout` has elapsed while zero clients are
/// connected.
///
/// Semantics (matching the `--idle-timeout` contract):
/// - The timer conceptually starts as soon as this future starts being
///   polled (callers should await it starting right when the supervisor
///   becomes ready to accept connections).
/// - It is cancelled/paused for as long as at least one
///   [`ActivityEvent::Connected`] is outstanding (no matching
///   `Disconnected` yet).
/// - It restarts from the full `idle_timeout` duration — not a resumed
///   partial countdown — the moment the *last* connected client
///   disconnects.
///
/// Never returns while at least one client is connected. If `events`
/// closes (every [`ActivityTracker`] clone dropped) while clients are
/// still marked connected, that should never happen in production (the
/// serving loop itself always keeps one tracker clone alive), but is
/// handled by simply never firing rather than guessing — the caller's
/// own shutdown path takes over in that case regardless.
pub async fn wait_for_idle_timeout(
	idle_timeout: Duration,
	mut events: mpsc::UnboundedReceiver<ActivityEvent>,
	sleeper: &dyn IdleSleeper,
) {
	let mut active_clients: u64 = 0;

	loop {
		if active_clients == 0 {
			tokio::select! {
				_ = sleeper.sleep(idle_timeout) => return,
				event = events.recv() => match event {
					Some(ActivityEvent::Connected) => active_clients += 1,
					Some(ActivityEvent::Disconnected) => {
						// Spurious/duplicate disconnect while already at
						// zero; ignore rather than underflow.
					}
					None => std::future::pending::<()>().await,
				},
			}
		} else {
			match events.recv().await {
				Some(ActivityEvent::Connected) => active_clients += 1,
				Some(ActivityEvent::Disconnected) => {
					active_clients = active_clients.saturating_sub(1);
				}
				None => std::future::pending::<()>().await,
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::sync::atomic::{AtomicUsize, Ordering};

	/// A scripted [`IdleSleeper`] whose N-th call (0-indexed) resolves
	/// immediately if `script[N]` is `true`, or never resolves if
	/// `false`. Panics if called more times than scripted, so tests can
	/// assert an exact call count (e.g. "never re-armed a second time
	/// while a client stayed connected").
	struct ScriptedSleeper {
		calls: AtomicUsize,
		script: Vec<bool>,
	}

	impl ScriptedSleeper {
		fn new(script: Vec<bool>) -> Self {
			Self {
				calls: AtomicUsize::new(0),
				script,
			}
		}
	}

	impl IdleSleeper for ScriptedSleeper {
		fn sleep(&self, _duration: Duration) -> Pin<Box<dyn Future<Output = ()> + Send>> {
			let i = self.calls.fetch_add(1, Ordering::SeqCst);
			match self.script.get(i) {
				Some(true) => Box::pin(std::future::ready(())),
				Some(false) => Box::pin(std::future::pending()),
				None => panic!("sleeper.sleep() called more times than scripted ({i} calls)"),
			}
		}
	}

	#[tokio::test]
	async fn fires_after_idle_timeout_when_never_connected() {
		let (_tracker, rx) = new_activity_channel();
		let sleeper = ScriptedSleeper::new(vec![true]);

		// The scripted sleeper resolves on its very first poll
		// regardless of the requested duration, so this returns without
		// any real waiting.
		wait_for_idle_timeout(Duration::from_secs(3600), rx, &sleeper).await;
	}

	#[tokio::test]
	async fn paused_while_connected_then_resets_and_fires_after_disconnect() {
		let (tracker, rx) = new_activity_channel();
		// 1st call (armed before the already-queued `Connected` event is
		// drained): never resolves. 2nd call (armed fresh after the
		// client disconnects): resolves immediately.
		let sleeper = ScriptedSleeper::new(vec![false, true]);

		// Queue the connect before the state machine starts polling, to
		// prove the initial idle-arm gets cancelled by a pending
		// connection rather than "started before anyone connected".
		let guard = tracker.client_connected();

		let mut task = tokio::spawn(async move {
			wait_for_idle_timeout(Duration::from_secs(3600), rx, &sleeper).await;
		});

		// While connected, the future must not resolve. A short bounded
		// wait is used only to prove "hasn't finished yet", not as the
		// actual pass condition (the scripted sleeper never depends on
		// real elapsed time either way).
		let still_running = tokio::time::timeout(Duration::from_millis(50), &mut task).await;
		assert!(
			still_running.is_err(),
			"idle timeout must not fire while a client is connected"
		);

		drop(guard);

		// Disconnecting resets the timer; the 2nd scripted call resolves
		// immediately, so this completes without any real waiting.
		task.await.unwrap();
	}

	#[tokio::test]
	async fn never_fires_while_a_single_client_stays_connected() {
		let (tracker, rx) = new_activity_channel();
		// Only the very first arm (before the queued `Connected` event
		// is drained) is expected; a 2nd call would mean the timer was
		// spuriously re-armed while still connected, which must panic.
		let sleeper = ScriptedSleeper::new(vec![false]);

		let guard = tracker.client_connected();
		let mut task = tokio::spawn(async move {
			wait_for_idle_timeout(Duration::from_secs(3600), rx, &sleeper).await;
		});

		let still_running = tokio::time::timeout(Duration::from_millis(50), &mut task).await;
		assert!(
			still_running.is_err(),
			"idle timeout must not fire while a client is connected"
		);

		// Stop before dropping `guard` so the scripted sleeper is never
		// asked for a 2nd call by this test.
		task.abort();
		drop(guard);
	}

	#[tokio::test]
	async fn disconnect_while_still_zero_active_is_ignored_without_underflow() {
		let (tracker, rx) = new_activity_channel();
		// 1st call happens while the queued Connected/Disconnected pair
		// is still being drained (must stay pending so that draining is
		// deterministic rather than racing `select!` against an
		// already-ready sleep future); 2nd call, after both are
		// drained and `active_clients` is back to zero, resolves
		// immediately.
		let sleeper = ScriptedSleeper::new(vec![false, true]);

		// Manufacture a connect immediately followed by a disconnect
		// with no observer in between, by letting the guard fall out of
		// scope right away; both events land in the channel back to
		// back.
		{
			let _extra_guard = tracker.client_connected();
		}

		// The channel now has [Connected, Disconnected] queued followed
		// by nothing; the state machine should drain both, land back at
		// zero, and then let the scripted (immediately ready) sleeper
		// fire — never underflowing `active_clients` or hanging despite
		// the transient connect.
		wait_for_idle_timeout(Duration::from_secs(3600), rx, &sleeper).await;
	}
}
