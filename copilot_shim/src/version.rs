/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fmt;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) struct CliVersion {
	pub(crate) major: u64,
	pub(crate) minor: u64,
	pub(crate) patch: u64,
}

impl fmt::Display for CliVersion {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(formatter, "{}.{}.{}", self.major, self.minor, self.patch)
	}
}

pub(crate) const MINIMUM_VERSION: CliVersion = CliVersion {
	major: 1,
	minor: 0,
	patch: 82,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SuccessfulVersion {
	Compatible(CliVersion),
	Old(CliVersion),
	Unparseable,
}

pub(crate) fn evaluate_successful_stdout(stdout: &[u8]) -> SuccessfulVersion {
	match first_version(stdout) {
		Some(version) if version < MINIMUM_VERSION => SuccessfulVersion::Old(version),
		Some(version) => SuccessfulVersion::Compatible(version),
		None => SuccessfulVersion::Unparseable,
	}
}

fn first_version(stdout: &[u8]) -> Option<CliVersion> {
	let mut index = 0;
	while index < stdout.len() {
		if !stdout[index].is_ascii_digit() || index > 0 && stdout[index - 1].is_ascii_digit() {
			index += 1;
			continue;
		}

		let first_dot = digit_end(stdout, index);
		if stdout.get(first_dot) != Some(&b'.') {
			index = first_dot;
			continue;
		}
		let minor_start = first_dot + 1;
		if !stdout.get(minor_start).is_some_and(u8::is_ascii_digit) {
			index = first_dot + 1;
			continue;
		}
		let second_dot = digit_end(stdout, minor_start);
		if stdout.get(second_dot) != Some(&b'.') {
			index = second_dot;
			continue;
		}
		let patch_start = second_dot + 1;
		if !stdout.get(patch_start).is_some_and(u8::is_ascii_digit) {
			index = patch_start;
			continue;
		}
		let patch_end = digit_end(stdout, patch_start);
		return Some(CliVersion {
			major: component(&stdout[index..first_dot])?,
			minor: component(&stdout[minor_start..second_dot])?,
			patch: component(&stdout[patch_start..patch_end])?,
		});
	}
	None
}

fn digit_end(bytes: &[u8], start: usize) -> usize {
	let mut end = start;
	while bytes.get(end).is_some_and(u8::is_ascii_digit) {
		end += 1;
	}
	end
}

fn component(bytes: &[u8]) -> Option<u64> {
	let mut value = 0_u64;
	for byte in bytes {
		value = value
			.checked_mul(10)?
			.checked_add(u64::from(*byte - b'0'))?;
	}
	Some(value)
}
