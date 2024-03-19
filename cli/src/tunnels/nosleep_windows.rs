/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io;

use winapi::{
	ctypes::c_void,
	um::{
		handleapi::CloseHandle,
		minwinbase::REASON_CONTEXT,
		winbase::{PowerClearRequest, PowerCreateRequest, PowerSetRequest},
		winnt::{
			PowerRequestSystemRequired, POWER_REQUEST_CONTEXT_SIMPLE_STRING,
			POWER_REQUEST_CONTEXT_VERSION, POWER_REQUEST_TYPE,
		},
	},
};

use crate::constants::TUNNEL_ACTIVITY_NAME;

struct Request(*mut c_void);

impl Request {
	pub fn new() -> io::Result<Self> {
		let mut reason: Vec<u16> = TUNNEL_ACTIVITY_NAME.encode_utf16().chain([0u16]).collect();
		let mut context = REASON_CONTEXT {
			Version: POWER_REQUEST_CONTEXT_VERSION,
			Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
			Reason: unsafe { std::mem::zeroed() },
		};
		unsafe { *context.Reason.SimpleReasonString_mut() = reason.as_mut_ptr() };

		let request = unsafe { PowerCreateRequest(&mut context) };
		if request.is_null() {
			return Err(io::Error::last_os_error());
		}

		Ok(Self(request))
	}

	pub fn set(&self, request_type: POWER_REQUEST_TYPE) -> io::Result<()> {
		let result = unsafe { PowerSetRequest(self.0, request_type) };
		if result == 0 {
			return Err(io::Error::last_os_error());
		}

		Ok(())
	}
}

impl Drop for Request {
	fn drop(&mut self) {
		unsafe {
			CloseHandle(self.0);
		}
	}
}

pub struct SleepInhibitor {
	request: Request,
}

impl SleepInhibitor {
	pub async fn new() -> io::Result<Self> {
		let request = Request::new()?;
		request.set(PowerRequestSystemRequired)?;
		Ok(Self { request })
	}
}

impl Drop for SleepInhibitor {
	fn drop(&mut self) {
		unsafe {
			PowerClearRequest(self.request.0, PowerRequestSystemRequired);
		}
	}
}
