/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io::{self, BufRead, IsTerminal, Write};

pub(crate) const INSTALL_DOCUMENTATION_URL: &str =
	"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PromptResponse {
	Accepted,
	Declined,
}

/// Offers to install GitHub Copilot CLI and reads the answer. The default answer is No.
pub(crate) fn prompt_with_io<R: BufRead, W: Write>(
	input: &mut R,
	output: &mut W,
) -> io::Result<PromptResponse> {
	writeln!(
		output,
		"Installation instructions: {INSTALL_DOCUMENTATION_URL}"
	)?;
	write!(output, "Install GitHub Copilot CLI? [y/N] ")?;
	output.flush()?;

	let mut response = Vec::new();
	input.read_until(b'\n', &mut response)?;
	Ok(parse_response(&response))
}

/// Accepts an answer that starts with `y`, including the full-width `y` that an East Asian IME types in full-width mode.
/// Leading whitespace, including the ideographic space, is ignored.
pub(crate) fn parse_response(response: &[u8]) -> PromptResponse {
	match String::from_utf8_lossy(response)
		.chars()
		.find(|character| !character.is_whitespace())
	{
		Some('y' | 'Y' | '\u{FF59}' | '\u{FF39}') => PromptResponse::Accepted,
		_ => PromptResponse::Declined,
	}
}

pub(crate) fn native_can_prompt() -> bool {
	io::stdin().is_terminal() && io::stderr().is_terminal()
}

/// Shows the prompt on stderr, so it stays visible, and out of the output, when stdout is redirected. Callers check
/// [`native_can_prompt`] first.
pub(crate) fn native_prompt() -> io::Result<PromptResponse> {
	prompt_with_io(&mut io::stdin().lock(), &mut io::stderr().lock())
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
