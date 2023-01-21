/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io;

use const_format::concatcp;
use core_foundation::base::TCFType;
use core_foundation::string::{CFString, CFStringRef};
use libc::c_int;

use crate::constants::APPLICATION_NAME;

extern "C" {
	pub fn IOPMAssertionCreateWithName(
		assertion_type: CFStringRef,
		assertion_level: u32,
		assertion_name: CFStringRef,
		assertion_id: &mut u32,
	) -> c_int;

	pub fn IOPMAssertionRelease(assertion_id: u32) -> c_int;
}

pub struct SleepInhibitor {
	assertion_id: u32,
}

impl SleepInhibitor {
	pub async fn new() -> io::Result<Self> {
		let mut assertion_id = 0;
		let assertion_type = CFString::from_static_string("PreventSystemSleep");
		let assertion_name =
			CFString::from_static_string(concatcp!(APPLICATION_NAME, " running tunnel"));
		let result = unsafe {
			IOPMAssertionCreateWithName(
				assertion_type.as_concrete_TypeRef(),
				255,
				assertion_name.as_concrete_TypeRef(),
				&mut assertion_id,
			)
		};

		if result != 0 {
			return Err(io::Error::last_os_error());
		}

		Ok(Self { assertion_id })
	}
}

impl Drop for SleepInhibitor {
	fn drop(&mut self) {
		unsafe {
			IOPMAssertionRelease(self.assertion_id);
		}
	}
}
