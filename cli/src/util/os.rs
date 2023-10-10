/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(windows)]
pub fn os_release() -> Result<String, std::io::Error> {
	// The windows API *had* nice GetVersionEx/A APIs, but these were deprecated
	// in Winodws 8 and there's no newer win API to get version numbers. So
	// instead read the registry.

	use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

	let key = RegKey::predef(HKEY_LOCAL_MACHINE)
		.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")?;

	let major: u32 = key.get_value("CurrentMajorVersionNumber")?;
	let minor: u32 = key.get_value("CurrentMinorVersionNumber")?;
	let build: String = key.get_value("CurrentBuild")?;

	Ok(format!("{}.{}.{}", major, minor, build))
}

#[cfg(unix)]
pub fn os_release() -> Result<String, std::io::Error> {
	use std::{ffi::CStr, mem};

	unsafe {
		let mut ret = mem::MaybeUninit::zeroed();

		if libc::uname(ret.as_mut_ptr()) != 0 {
			return Err(std::io::Error::last_os_error());
		}

		let ret = ret.assume_init();
		let c_str: &CStr = CStr::from_ptr(ret.release.as_ptr());
		Ok(c_str.to_string_lossy().into_owned())
	}
}
