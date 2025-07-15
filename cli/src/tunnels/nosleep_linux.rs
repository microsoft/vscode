/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use zbus::{dbus_proxy, Connection};

use crate::{
	constants::APPLICATION_NAME,
	util::errors::{wrap, AnyError},
};

/// An basically undocumented API, but seems widely implemented, and is what
/// browsers use for sleep inhibition. The downside is that it also *may*
/// disable the screensaver. A much better and more granular API is available
/// on `org.freedesktop.login1.Manager`, but this requires administrative
/// permission to request inhibition, which is not possible here.
///
/// See https://source.chromium.org/chromium/chromium/src/+/main:services/device/wake_lock/power_save_blocker/power_save_blocker_linux.cc;l=54;drc=2e85357a8b76996981cc6f783853a49df2cedc3a
#[dbus_proxy(
	interface = "org.freedesktop.PowerManagement.Inhibit",
	gen_blocking = false,
	default_service = "org.freedesktop.PowerManagement.Inhibit",
	default_path = "/org/freedesktop/PowerManagement/Inhibit"
)]
trait PMInhibitor {
	#[dbus_proxy(name = "Inhibit")]
	fn inhibit(&self, what: &str, why: &str) -> zbus::Result<u32>;
}

/// A slightly better documented version which seems commonly used.
#[dbus_proxy(
	interface = "org.freedesktop.ScreenSaver",
	gen_blocking = false,
	default_service = "org.freedesktop.ScreenSaver",
	default_path = "/org/freedesktop/ScreenSaver"
)]
trait ScreenSaver {
	#[dbus_proxy(name = "Inhibit")]
	fn inhibit(&self, what: &str, why: &str) -> zbus::Result<u32>;
}

pub struct SleepInhibitor {
	_connection: Connection, // Inhibition is released when the connection is closed
}

impl SleepInhibitor {
	pub async fn new() -> Result<Self, AnyError> {
		let connection = Connection::session()
			.await
			.map_err(|e| wrap(e, "error creating dbus session"))?;

		macro_rules! try_inhibit {
			($proxy:ident) => {
				match $proxy::new(&connection).await {
					Ok(proxy) => proxy.inhibit(APPLICATION_NAME, "running tunnel").await,
					Err(e) => Err(e),
				}
			};
		}

		if let Err(e1) = try_inhibit!(PMInhibitorProxy) {
			if let Err(e2) = try_inhibit!(ScreenSaverProxy) {
				return Err(wrap(
					e2,
					format!(
						"error requesting sleep inhibition, pminhibitor gave {e1}, screensaver gave"
					),
				)
				.into());
			}
		}

		Ok(SleepInhibitor {
			_connection: connection,
		})
	}
}
