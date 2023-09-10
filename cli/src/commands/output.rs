/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fmt::Display;

use std::io::{BufWriter, Write};

use super::args::OutputFormat;

pub struct Column {
	max_width: usize,
	heading: &'static str,
	data: Vec<String>,
}

impl Column {
	pub fn new(heading: &'static str) -> Self {
		Column {
			max_width: heading.len(),
			heading,
			data: vec![],
		}
	}

	pub fn add_row(&mut self, row: String) {
		self.max_width = std::cmp::max(self.max_width, row.len());
		self.data.push(row);
	}
}

impl OutputFormat {
	pub fn print_table(&self, table: OutputTable) -> Result<(), std::io::Error> {
		match *self {
			OutputFormat::Json => JsonTablePrinter().print(table, &mut std::io::stdout()),
			OutputFormat::Text => TextTablePrinter().print(table, &mut std::io::stdout()),
		}
	}
}

pub struct OutputTable {
	cols: Vec<Column>,
}

impl OutputTable {
	pub fn new(cols: Vec<Column>) -> Self {
		OutputTable { cols }
	}
}

trait TablePrinter {
	fn print(&self, table: OutputTable, out: &mut dyn std::io::Write)
		-> Result<(), std::io::Error>;
}

pub struct JsonTablePrinter();

impl TablePrinter for JsonTablePrinter {
	fn print(
		&self,
		table: OutputTable,
		out: &mut dyn std::io::Write,
	) -> Result<(), std::io::Error> {
		let mut bw = BufWriter::new(out);
		bw.write_all(b"[")?;

		if !table.cols.is_empty() {
			let data_len = table.cols[0].data.len();
			for i in 0..data_len {
				if i > 0 {
					bw.write_all(b",{")?;
				} else {
					bw.write_all(b"{")?;
				}
				for col in &table.cols {
					serde_json::to_writer(&mut bw, col.heading)?;
					bw.write_all(b":")?;
					serde_json::to_writer(&mut bw, &col.data[i])?;
				}
			}
		}

		bw.write_all(b"]")?;
		bw.flush()
	}
}

/// Type that prints the output as an ASCII, markdown-style table.
pub struct TextTablePrinter();

impl TablePrinter for TextTablePrinter {
	fn print(
		&self,
		table: OutputTable,
		out: &mut dyn std::io::Write,
	) -> Result<(), std::io::Error> {
		let mut bw = BufWriter::new(out);

		let sizes = table.cols.iter().map(|c| c.max_width).collect::<Vec<_>>();

		// print headers
		write_columns(&mut bw, table.cols.iter().map(|c| c.heading), &sizes)?;
		// print --- separators
		write_columns(
			&mut bw,
			table.cols.iter().map(|c| "-".repeat(c.max_width)),
			&sizes,
		)?;
		// print each column
		if !table.cols.is_empty() {
			let data_len = table.cols[0].data.len();
			for i in 0..data_len {
				write_columns(&mut bw, table.cols.iter().map(|c| &c.data[i]), &sizes)?;
			}
		}

		bw.flush()
	}
}

fn write_columns<T>(
	mut w: impl Write,
	cols: impl Iterator<Item = T>,
	sizes: &[usize],
) -> Result<(), std::io::Error>
where
	T: Display,
{
	w.write_all(b"|")?;
	for (i, col) in cols.enumerate() {
		write!(w, " {:width$} |", col, width = sizes[i])?;
	}
	w.write_all(b"\r\n")
}
