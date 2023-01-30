/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io;

use core_foundation::base::TCFType;
use core_foundation::string::{CFString, CFStringRef};
use libc::c_int;

use crate::constants::TUNNEL_ACTIVITY_NAME;

extern "C" {
	pub fn IOPMAssertionCreateWithName(
		assertion_type: CFStringRef,
		assertion_level: u32,
		assertion_name: CFStringRef,
		assertion_id: &mut u32,
	) -> c_int;

	pub fn IOPMAssertionRelease(assertion_id: u32) -> c_int;
}

const NUM_ASSERTIONS: usize = 2;

const ASSERTIONS: [&str; NUM_ASSERTIONS] = ["PreventUserIdleSystemSleep", "PreventSystemSleep"];

struct Assertion(u32);

impl Assertion {
	pub fn make(typ: &CFString, name: &CFString) -> io::Result<Self> {
		let mut assertion_id = 0;
		let result = unsafe {
			IOPMAssertionCreateWithName(
				typ.as_concrete_TypeRef(),
				255,
				name.as_concrete_TypeRef(),
				&mut assertion_id,
			)
		};

		if result != 0 {
			Err(io::Error::last_os_error())
		} else {
			Ok(Self(assertion_id))
		}
	}
}

impl Drop for Assertion {
	fn drop(&mut self) {
		unsafe {
			IOPMAssertionRelease(self.0);
		}
	}
}

pub struct SleepInhibitor {
	_assertions: Vec<Assertion>,
}

impl SleepInhibitor {
	pub async fn new() -> io::Result<Self> {
		let mut assertions = Vec::with_capacity(NUM_ASSERTIONS);
		let assertion_name = CFString::from_static_string(TUNNEL_ACTIVITY_NAME);
		for typ in ASSERTIONS {
			assertions.push(Assertion::make(
				&CFString::from_static_string(typ),
				&assertion_name,
			)?);
		}

		Ok(Self {
			_assertions: assertions,
		})
	}
}
