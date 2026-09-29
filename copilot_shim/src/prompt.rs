/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io::{self, BufRead, IsTerminal, Write};

pub(crate) const INSTALL_DOCUMENTATION_URL: &str =
	"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PromptKind<'a> {
	Install,
	Update {
		installed_version: &'a str,
		required_version: &'a str,
	},
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PromptResponse {
	Accepted,
	Declined,
}

pub(crate) fn prompt_with_io<R: BufRead, W: Write>(
	input: &mut R,
	output: &mut W,
	interactive: bool,
	kind: PromptKind<'_>,
) -> io::Result<PromptResponse> {
	match kind {
		PromptKind::Install => writeln!(output, "Installation instructions: {INSTALL_DOCUMENTATION_URL}")?,
		PromptKind::Update {
			installed_version,
			required_version,
		} => writeln!(
			output,
			"Installed GitHub Copilot CLI version {installed_version} is below the required version {required_version}."
		)?,
	}
	write!(
		output,
		"{}",
		match kind {
			PromptKind::Install => "Install GitHub Copilot CLI? [y/N] ",
			PromptKind::Update { .. } => "Update GitHub Copilot CLI? [y/N] ",
		}
	)?;
	output.flush()?;

	if !interactive {
		return Ok(PromptResponse::Declined);
	}

	let mut response = Vec::new();
	input.read_until(b'\n', &mut response)?;
	Ok(parse_response(&response))
}

pub(crate) fn parse_response(response: &[u8]) -> PromptResponse {
	match response
		.iter()
		.copied()
		.find(|byte| !byte.is_ascii_whitespace())
	{
		Some(b'y' | b'Y') => PromptResponse::Accepted,
		_ => PromptResponse::Declined,
	}
}

pub(crate) fn native_prompt(kind: PromptKind<'_>) -> io::Result<PromptResponse> {
	let stdin = io::stdin();
	let mut input = stdin.lock();
	let interactive = stdin.is_terminal();
	let stdout = io::stdout();
	let mut output = stdout.lock();
	prompt_with_io(&mut input, &mut output, interactive, kind)
}

#[cfg(any(unix, test))]
pub(crate) fn clear_terminal_with<W: Write>(output: &mut W, is_terminal: bool) -> io::Result<()> {
	if !is_terminal {
		return Ok(());
	}
	output.write_all(b"\x1b[2J\x1b[H")?;
	output.flush()
}

#[cfg(unix)]
pub(crate) fn native_clear_terminal() -> io::Result<()> {
	let stdout = io::stdout();
	let is_terminal = stdout.is_terminal();
	clear_terminal_with(&mut stdout.lock(), is_terminal)
}

#[cfg(windows)]
pub(crate) fn native_clear_terminal() -> io::Result<()> {
	use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
	use windows_sys::Win32::System::Console::{
		FillConsoleOutputAttribute, FillConsoleOutputCharacterW, GetConsoleScreenBufferInfo,
		GetStdHandle, SetConsoleCursorPosition, CONSOLE_SCREEN_BUFFER_INFO, COORD,
		STD_OUTPUT_HANDLE,
	};

	let stdout = io::stdout();
	if !stdout.is_terminal() {
		return Ok(());
	}

	unsafe {
		let handle = GetStdHandle(STD_OUTPUT_HANDLE);
		if handle == INVALID_HANDLE_VALUE || handle.is_null() {
			return Err(io::Error::last_os_error());
		}
		let mut information = CONSOLE_SCREEN_BUFFER_INFO::default();
		if GetConsoleScreenBufferInfo(handle, &mut information) == 0 {
			return Err(io::Error::last_os_error());
		}
		let origin = COORD { X: 0, Y: 0 };
		let cells = u32::from(information.dwSize.X as u16)
			.saturating_mul(u32::from(information.dwSize.Y as u16));
		let mut written = 0;
		if FillConsoleOutputCharacterW(handle, b' ' as u16, cells, origin, &mut written) == 0
			|| FillConsoleOutputAttribute(
				handle,
				information.wAttributes,
				cells,
				origin,
				&mut written,
			) == 0 || SetConsoleCursorPosition(handle, origin) == 0
		{
			return Err(io::Error::last_os_error());
		}
	}
	Ok(())
}
