/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Console output helpers: styled text, paging, and structured display.

use std::io::Write;
use std::net::IpAddr;
use std::process::{Command, Stdio};
use std::time::Duration;

use console::{style, Style, Term};

use crate::constants;

// ---- Styles -----------------------------------------------------------------

/// Predefined styles for consistent CLI output.
pub struct Styles;

impl Styles {
	/// Bold text for headings / titles.
	pub fn title() -> Style {
		Style::new().bold()
	}

	/// Dim text for field labels.
	pub fn label() -> Style {
		Style::new().dim()
	}

	/// Cyan text for URIs and identifiers.
	pub fn uri() -> Style {
		Style::new().cyan()
	}

	/// Green + bold for success / active indicators.
	pub fn success() -> Style {
		Style::new().green().bold()
	}

	/// Yellow + bold for warnings / attention-needed indicators.
	pub fn warning() -> Style {
		Style::new().yellow().bold()
	}

	/// Red + bold for error indicators.
	pub fn error() -> Style {
		Style::new().red().bold()
	}

	/// Dim text for inactive / secondary information.
	pub fn muted() -> Style {
		Style::new().dim()
	}
}

// ---- Pager ------------------------------------------------------------------

/// Outputs `text` through a pager when stdout is a terminal and the
/// content is taller than the terminal window.
///
/// Resolution order:
/// 1. `$PAGER` environment variable (any platform)
/// 2. `less -R` on Unix
/// 3. Built-in interactive pager (works everywhere, including Windows)
///
/// When stdout is not a terminal (e.g. piped), the text is written
/// directly without paging.
pub fn print_paged(text: &str) {
	let term = Term::stdout();
	if !term.is_term() {
		print!("{text}");
		return;
	}

	let (term_height, _) = term.size();
	let term_height = term_height as usize;
	let line_count = text.lines().count();
	if line_count <= term_height.saturating_sub(1) {
		print!("{text}");
		return;
	}

	// Prefer $PAGER if explicitly set.
	if let Ok(pager) = std::env::var("PAGER") {
		if !pager.is_empty() && try_external_pager(&pager, text) {
			return;
		}
	}

	// On Unix, try `less -R` before falling back to built-in.
	#[cfg(not(windows))]
	if try_external_pager("less -R", text) {
		return;
	}

	builtin_pager(&term, text, term_height);
}

/// Attempts to spawn an external pager. Returns `true` if successful.
fn try_external_pager(pager: &str, text: &str) -> bool {
	let mut parts = pager.split_whitespace();
	let program = match parts.next() {
		Some(p) => p,
		None => return false,
	};
	let pager_args: Vec<&str> = parts.collect();

	match Command::new(program)
		.args(&pager_args)
		.stdin(Stdio::piped())
		.spawn()
	{
		Ok(mut child) => {
			if let Some(mut stdin) = child.stdin.take() {
				let _ = stdin.write_all(text.as_bytes());
			}
			let _ = child.wait();
			true
		}
		Err(_) => false,
	}
}

/// Built-in interactive pager with scroll support.
///
/// Controls:
/// - **↓** / **j** / **Enter** — scroll down one line
/// - **↑** / **k** — scroll up one line
/// - **Page Down** / **Space** / **f** — scroll down one page
/// - **Page Up** / **b** — scroll up one page
/// - **Home** / **g** — jump to top
/// - **End** / **G** — jump to bottom
/// - **q** / **Escape** / **Ctrl+C** — quit
fn builtin_pager(term: &Term, text: &str, term_height: usize) {
	let lines: Vec<&str> = text.lines().collect();
	let total = lines.len();
	let page = term_height.saturating_sub(1); // reserve one line for the status bar
	let mut offset: usize = 0;

	// Switch to the alternate screen buffer so quitting restores the
	// original terminal content (like `less` does).
	let _ = term.write_str("\x1b[?1049h");

	// Draw the initial screen.
	draw_page(term, &lines, offset, page);
	draw_status_bar(term, offset, total, page);

	loop {
		let key = read_pager_key(term);
		let new_offset = match key {
			// Down one line
			PagerKey::Down => offset.saturating_add(1),
			// Up one line
			PagerKey::Up => offset.saturating_sub(1),
			// Page down
			PagerKey::PageDown => offset.saturating_add(page),
			// Page up
			PagerKey::PageUp => offset.saturating_sub(page),
			// Home
			PagerKey::Home => 0,
			// End
			PagerKey::End => total.saturating_sub(page),
			// Quit
			PagerKey::Quit => {
				break;
			}
			PagerKey::Other => offset,
		};

		// Clamp to valid range.
		let max_offset = total.saturating_sub(page);
		let new_offset = new_offset.min(max_offset);

		if new_offset != offset {
			offset = new_offset;
			// Redraw: clear the page area and status bar, then repaint.
			let _ = term.clear_last_lines(page + 1);
			draw_page(term, &lines, offset, page);
			draw_status_bar(term, offset, total, page);
		}
	}

	// Leave the alternate screen buffer, restoring prior content.
	let _ = term.write_str("\x1b[?1049l");
}

/// Writes `page` lines starting from `offset`.
fn draw_page(term: &Term, lines: &[&str], offset: usize, page: usize) {
	let end = (offset + page).min(lines.len());
	for line in &lines[offset..end] {
		let _ = term.write_line(line);
	}
	// Pad with empty lines if at the end.
	for _ in (end - offset)..page {
		let _ = term.write_line("");
	}
}

/// Draws the status bar at the bottom showing scroll position.
fn draw_status_bar(term: &Term, offset: usize, total: usize, page: usize) {
	let end = (offset + page).min(total);
	let pct = (end * 100).checked_div(total).unwrap_or(100);
	let bar = format!(
		" lines {}-{} of {} ({pct}%)  ↑↓ scroll  PgUp/PgDn page  q quit ",
		offset + 1,
		end,
		total,
	);
	let _ = term.write_str(&format!("{}", Style::new().reverse().apply_to(bar)));
}

// ---- Key reading ------------------------------------------------------------

enum PagerKey {
	Up,
	Down,
	PageUp,
	PageDown,
	Home,
	End,
	Quit,
	Other,
}

/// Reads a single key press and maps it to a pager action.
///
/// On Windows, uses `ReadConsoleInputW` directly because the `console`
/// crate does not map `VK_PRIOR` (Page Up) or `VK_NEXT` (Page Down).
#[cfg(not(windows))]
fn read_pager_key(term: &Term) -> PagerKey {
	use console::Key;
	match term.read_key() {
		Ok(Key::ArrowDown) | Ok(Key::Char('j')) | Ok(Key::Enter) => PagerKey::Down,
		Ok(Key::ArrowUp) | Ok(Key::Char('k')) => PagerKey::Up,
		Ok(Key::PageDown) | Ok(Key::Char(' ')) | Ok(Key::Char('f')) => PagerKey::PageDown,
		Ok(Key::PageUp) | Ok(Key::Char('b')) => PagerKey::PageUp,
		Ok(Key::Home) | Ok(Key::Char('g')) => PagerKey::Home,
		Ok(Key::End) | Ok(Key::Char('G')) => PagerKey::End,
		Ok(Key::Escape) | Ok(Key::Char('q')) | Ok(Key::Char('Q')) | Ok(Key::CtrlC) => {
			PagerKey::Quit
		}
		_ => PagerKey::Other,
	}
}

#[cfg(windows)]
fn read_pager_key(_term: &Term) -> PagerKey {
	use windows_sys::Win32::System::Console::{
		GetStdHandle, ReadConsoleInputW, INPUT_RECORD, KEY_EVENT, STD_INPUT_HANDLE,
	};
	use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
		VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_NEXT, VK_PRIOR, VK_RETURN, VK_UP,
	};

	loop {
		let mut record: INPUT_RECORD = unsafe { std::mem::zeroed() };
		let mut count: u32 = 0;

		let ok = unsafe {
			ReadConsoleInputW(GetStdHandle(STD_INPUT_HANDLE), &mut record, 1, &mut count)
		};
		if ok == 0 || count == 0 {
			return PagerKey::Other;
		}

		// Only handle key-down events.
		if record.EventType as u32 != KEY_EVENT {
			continue;
		}
		let key_event = unsafe { record.Event.KeyEvent };
		if key_event.bKeyDown == 0 {
			continue;
		}

		let vk = key_event.wVirtualKeyCode;
		let ch = unsafe { key_event.uChar.UnicodeChar };

		// Map virtual key codes first (handles keys with no unicode char).
		return match vk {
			VK_UP => PagerKey::Up,
			VK_DOWN => PagerKey::Down,
			VK_PRIOR => PagerKey::PageUp,
			VK_NEXT => PagerKey::PageDown,
			VK_HOME => PagerKey::Home,
			VK_END => PagerKey::End,
			VK_ESCAPE => PagerKey::Quit,
			VK_RETURN => PagerKey::Down,
			_ => {
				// Fall through to character matching.
				if let Some(c) = char::from_u32(ch as u32) {
					match c {
						'j' => PagerKey::Down,
						'k' => PagerKey::Up,
						' ' | 'f' => PagerKey::PageDown,
						'b' => PagerKey::PageUp,
						'g' => PagerKey::Home,
						'G' => PagerKey::End,
						'q' | 'Q' => PagerKey::Quit,
						'\x03' => PagerKey::Quit, // Ctrl+C
						_ => PagerKey::Other,
					}
				} else {
					PagerKey::Other
				}
			}
		};
	}
}

// ---- Server banner ----------------------------------------------------------

/// Prints a styled startup header line:
///
/// ```text
///   Code Agent Host vX.Y.Z  ready in 123ms
/// ```
pub fn print_banner_header(title: &str, elapsed: Duration) {
	let version = constants::VSCODE_CLI_VERSION.unwrap_or("dev");
	let elapsed_ms = elapsed.as_millis();

	println!();
	println!(
		"  {} {}  {}",
		style(title).cyan().bold(),
		style(format!("v{version}")).dim(),
		style(format!("ready in {elapsed_ms}ms")).dim(),
	);
	println!();
}

/// Minimum label width so values align across banner lines.
const BANNER_LABEL_WIDTH: usize = 9;

/// Prints a single `➜  Label:   value` line inside a banner.
pub fn print_banner_line(label: &str, value: &str) {
	println!(
		"  {}  {} {}",
		style("➜").green().bold(),
		style(format!(
			"{label}:{:>pad$}",
			"",
			pad = BANNER_LABEL_WIDTH.saturating_sub(label.len() + 1)
		))
		.bold(),
		style(value).cyan(),
	);
}

/// Prints a dimmed `➜  Label:   hint` line inside a banner.
pub fn print_banner_line_dim(label: &str, hint: &str) {
	println!(
		"  {}  {} {}",
		style("➜").green().bold(),
		style(format!(
			"{label}:{:>pad$}",
			"",
			pad = BANNER_LABEL_WIDTH.saturating_sub(label.len() + 1)
		))
		.bold(),
		style(hint).dim(),
	);
}

/// Prints a trailing blank line to close the banner.
pub fn print_banner_footer() {
	println!();
}

/// Prints the Local / Network lines for a WebSocket server.
///
/// When `listen_ip` is loopback, shows `use --host to expose`.
/// When it is unspecified (`0.0.0.0` / `::`), enumerates all routable
/// IPv4 interfaces. Otherwise shows the single bound address.
pub fn print_network_lines(port: u16, listen_ip: IpAddr, token_suffix: &str) {
	print_banner_line("Local", &format!("ws://localhost:{port}{token_suffix}"));

	if listen_ip.is_loopback() {
		print_banner_line_dim("Network", "use --host to expose");
	} else if listen_ip.is_unspecified() {
		if let Ok(ifas) = local_ip_address::list_afinet_netifas() {
			for (_, addr) in &ifas {
				if addr.is_loopback() || addr.is_ipv6() {
					continue;
				}
				print_banner_line("Network", &format!("ws://{addr}:{port}{token_suffix}"));
			}
		}
	} else {
		print_banner_line("Network", &format!("ws://{listen_ip}:{port}{token_suffix}"));
	}
}
