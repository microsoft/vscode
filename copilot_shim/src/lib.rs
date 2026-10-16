/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

mod app;
mod candidate;
mod command;
mod identity;
mod install;
mod invocation;
mod legacy;
mod model;
mod runtime;
mod setup;
#[cfg(any(windows, test))]
mod version;

use std::ffi::OsString;

use install::HostTarget;
#[cfg(any(windows, test))]
pub(crate) use runtime::platform;
use runtime::NativeRuntime;

const SHIM_MARKER: &[u8] = b"VSCODE_COPILOT_RUST_SHIM_V1";

pub fn run(arguments: impl IntoIterator<Item = OsString>) -> i32 {
	retain_binary_marker();

	let runtime = NativeRuntime::default();
	let arguments = arguments.into_iter().collect();
	app::run(&runtime, arguments, HostTarget::current())
}

#[inline(never)]
fn retain_binary_marker() {
	std::hint::black_box(SHIM_MARKER);
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn marker_is_stable() {
		retain_binary_marker();

		let expected = ["VSCODE_COPILOT_", "RUST_SHIM_V1"].concat();
		assert_eq!(SHIM_MARKER, expected.as_bytes());
	}
}
