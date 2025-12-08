/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::wrap;
use dialoguer::{theme::ColorfulTheme, Confirm, Input, Select};
use indicatif::ProgressBar;
use std::fmt::Display;

use super::{errors::WrappedError, io::ReportCopyProgress};

/// Wrapper around indicatif::ProgressBar that implements ReportCopyProgress.
pub struct ProgressBarReporter {
	bar: ProgressBar,
	has_set_total: bool,
}

impl From<ProgressBar> for ProgressBarReporter {
	fn from(bar: ProgressBar) -> Self {
		ProgressBarReporter {
			bar,
			has_set_total: false,
		}
	}
}

impl ReportCopyProgress for ProgressBarReporter {
	fn report_progress(&mut self, bytes_so_far: u64, total_bytes: u64) {
		if !self.has_set_total {
			self.bar.set_length(total_bytes);
		}

		if bytes_so_far == total_bytes {
			self.bar.finish_and_clear();
		} else {
			self.bar.set_position(bytes_so_far);
		}
	}
}

pub fn prompt_yn(text: &str) -> Result<bool, WrappedError> {
	Confirm::with_theme(&ColorfulTheme::default())
		.with_prompt(text)
		.default(true)
		.interact()
		.map_err(|e| wrap(e, "Failed to read confirm input"))
}

pub fn prompt_options<T>(text: impl Into<String>, options: &[T]) -> Result<T, WrappedError>
where
	T: Display + Copy,
{
	let chosen = Select::with_theme(&ColorfulTheme::default())
		.with_prompt(text)
		.items(options)
		.default(0)
		.interact()
		.map_err(|e| wrap(e, "Failed to read select input"))?;

	Ok(options[chosen])
}

pub fn prompt_placeholder(question: &str, placeholder: &str) -> Result<String, WrappedError> {
	Input::with_theme(&ColorfulTheme::default())
		.with_prompt(question)
		.default(placeholder.to_string())
		.interact_text()
		.map_err(|e| wrap(e, "Failed to read confirm input"))
}
