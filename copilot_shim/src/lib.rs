/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

mod app;
mod candidate;
mod command;
mod identity;
mod install;
mod legacy;
mod model;
mod runtime;
mod version;

use std::ffi::OsString;

use install::HostTarget;
#[cfg(any(windows, test))]
pub(crate) use runtime::platform;
use runtime::NativeRuntime;

const SHIM_MARKER: &[u8] = b"VSCODE_COPILOT_RUST_SHIM_V1";

pub fn run(arguments: impl IntoIterator<Item = OsString>) -> i32 {
	retain_binary_marker();

	let runtime = NativeRuntime;
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
	use runtime::TestRuntime;

	#[test]
	fn marker_is_stable() {
		retain_binary_marker();

		let expected = ["VSCODE_COPILOT_", "RUST_SHIM_V1"].concat();
		assert_eq!(SHIM_MARKER, expected.as_bytes());
	}

	#[test]
	fn runtime_seam_accepts_a_test_adapter() {
		let result = app::run(
			&TestRuntime::default(),
			vec![OsString::from("--example")],
			HostTarget::current(),
		);

		assert_eq!(result, 1);
	}

	#[test]
	fn application_results_map_to_exit_codes() {
		assert_eq!(
			[
				app::ApplicationExit::Code(0).code(),
				app::ApplicationExit::Code(17).code(),
			],
			[0, 17]
		);
	}
}
