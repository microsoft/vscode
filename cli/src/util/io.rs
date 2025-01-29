/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::{
	fs::File,
	io::{self, BufRead, Seek},
	task::Poll,
	time::Duration,
};

use tokio::{
	io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
	sync::mpsc,
	time::sleep,
};

use super::ring_buffer::RingBuffer;

pub trait ReportCopyProgress {
	fn report_progress(&mut self, bytes_so_far: u64, total_bytes: u64);
}

/// Type that doesn't emit anything for download progress.
pub struct SilentCopyProgress();

impl ReportCopyProgress for SilentCopyProgress {
	fn report_progress(&mut self, _bytes_so_far: u64, _total_bytes: u64) {}
}

/// Copies from the reader to the writer, reporting progress to the provided
/// reporter every so often.
pub async fn copy_async_progress<T, R, W>(
	mut reporter: T,
	reader: &mut R,
	writer: &mut W,
	total_bytes: u64,
) -> io::Result<u64>
where
	R: AsyncRead + Unpin,
	W: AsyncWrite + Unpin,
	T: ReportCopyProgress,
{
	let mut buf = vec![0; 8 * 1024];
	let mut bytes_so_far = 0;
	let mut bytes_last_reported = 0;
	let report_granularity = std::cmp::min(total_bytes / 10, 2 * 1024 * 1024);

	reporter.report_progress(0, total_bytes);

	loop {
		let read_buf = match reader.read(&mut buf).await {
			Ok(0) => break,
			Ok(n) => &buf[..n],
			Err(e) => return Err(e),
		};

		writer.write_all(read_buf).await?;

		bytes_so_far += read_buf.len() as u64;
		if bytes_so_far - bytes_last_reported > report_granularity {
			bytes_last_reported = bytes_so_far;
			reporter.report_progress(bytes_so_far, total_bytes);
		}
	}

	reporter.report_progress(bytes_so_far, total_bytes);

	Ok(bytes_so_far)
}

/// Helper used when converting Future interfaces to poll-based interfaces.
/// Stores excess data that can be reused on future polls.
#[derive(Default)]
pub(crate) struct ReadBuffer(Option<(Vec<u8>, usize)>);

impl ReadBuffer {
	/// Removes any data stored in the read buffer
	pub fn take_data(&mut self) -> Option<(Vec<u8>, usize)> {
		self.0.take()
	}

	/// Writes as many bytes as possible to the readbuf, stashing any extra.
	pub fn put_data(
		&mut self,
		target: &mut tokio::io::ReadBuf<'_>,
		bytes: Vec<u8>,
		start: usize,
	) -> Poll<std::io::Result<()>> {
		if bytes.is_empty() {
			self.0 = None;
			// should not return Ok(), since if nothing is written to the target
			// it signals EOF. Instead wait for more data from the source.
			return Poll::Pending;
		}

		if target.remaining() >= bytes.len() - start {
			target.put_slice(&bytes[start..]);
			self.0 = None;
		} else {
			let end = start + target.remaining();
			target.put_slice(&bytes[start..end]);
			self.0 = Some((bytes, end));
		}

		Poll::Ready(Ok(()))
	}
}

#[derive(Debug)]
pub enum TailEvent {
	/// A new line was read from the file. The line includes its trailing newline character.
	Line(String),
	/// The file appears to have been rewritten (size shrunk)
	Reset,
	/// An error was encountered with the file.
	Err(io::Error),
}

/// Simple, naive implementation of `tail -f -n <n> <path>`. Uses polling, so
/// it's not the fastest, but simple and working for easy cases.
pub fn tailf(file: File, n: usize) -> mpsc::UnboundedReceiver<TailEvent> {
	let (tx, rx) = mpsc::unbounded_channel();
	let mut last_len = match file.metadata() {
		Ok(m) => m.len(),
		Err(e) => {
			tx.send(TailEvent::Err(e)).ok();
			return rx;
		}
	};

	let mut reader = io::BufReader::new(file);
	let mut pos = 0;

	// Read the initial "n" lines back from the request. initial_lines
	// is a small ring buffer.
	let mut initial_lines = RingBuffer::new(n);
	loop {
		let mut line = String::new();
		let bytes_read = match reader.read_line(&mut line) {
			Ok(0) => break,
			Ok(n) => n,
			Err(e) => {
				tx.send(TailEvent::Err(e)).ok();
				return rx;
			}
		};

		if !line.ends_with('\n') {
			// EOF
			break;
		}

		pos += bytes_read as u64;
		initial_lines.push(line);
	}

	for line in initial_lines.into_iter() {
		tx.send(TailEvent::Line(line)).ok();
	}

	// now spawn the poll process to keep reading new lines
	tokio::spawn(async move {
		let poll_interval = Duration::from_millis(500);

		loop {
			tokio::select! {
				_ = sleep(poll_interval) => {},
				_ = tx.closed() => return
			}

			match reader.get_ref().metadata() {
				Err(e) => {
					tx.send(TailEvent::Err(e)).ok();
					return;
				}
				Ok(m) => {
					if m.len() == last_len {
						continue;
					}

					if m.len() < last_len {
						tx.send(TailEvent::Reset).ok();
						pos = 0;
					}

					last_len = m.len();
				}
			}

			if let Err(e) = reader.seek(io::SeekFrom::Start(pos)) {
				tx.send(TailEvent::Err(e)).ok();
				return;
			}

			loop {
				let mut line = String::new();
				let n = match reader.read_line(&mut line) {
					Ok(0) => break,
					Ok(n) => n,
					Err(e) => {
						tx.send(TailEvent::Err(e)).ok();
						return;
					}
				};

				if n == 0 || !line.ends_with('\n') {
					break;
				}

				pos += n as u64;
				if tx.send(TailEvent::Line(line)).is_err() {
					return;
				}
			}
		}
	});

	rx
}

#[cfg(test)]
mod tests {
	use rand::Rng;
	use std::{fs::OpenOptions, io::Write};

	use super::*;

	#[tokio::test]
	async fn test_tailf_empty() {
		let dir = tempfile::tempdir().unwrap();
		let file_path = dir.path().join("tmp");

		let read_file = OpenOptions::new()
			.write(true)
			.read(true)
			.create(true)
			.open(&file_path)
			.unwrap();

		let mut rx = tailf(read_file, 32);
		assert!(rx.try_recv().is_err());

		let mut append_file = OpenOptions::new().append(true).open(&file_path).unwrap();
		writeln!(&mut append_file, "some line").unwrap();

		let recv = rx.recv().await;
		if let Some(TailEvent::Line(l)) = recv {
			assert_eq!("some line\n".to_string(), l);
		} else {
			unreachable!("expect a line event, got {:?}", recv)
		}

		write!(&mut append_file, "partial ").unwrap();
		writeln!(&mut append_file, "line").unwrap();

		let recv = rx.recv().await;
		if let Some(TailEvent::Line(l)) = recv {
			assert_eq!("partial line\n".to_string(), l);
		} else {
			unreachable!("expect a line event, got {:?}", recv)
		}
	}

	#[tokio::test]
	async fn test_tailf_resets() {
		let dir = tempfile::tempdir().unwrap();
		let file_path = dir.path().join("tmp");

		let mut read_file = OpenOptions::new()
			.write(true)
			.read(true)
			.create(true)
			.open(&file_path)
			.unwrap();

		writeln!(&mut read_file, "some existing content").unwrap();
		let mut rx = tailf(read_file, 0);
		assert!(rx.try_recv().is_err());

		let mut append_file = File::create(&file_path).unwrap(); // truncates
		writeln!(&mut append_file, "some line").unwrap();

		let recv = rx.recv().await;
		if let Some(TailEvent::Reset) = recv {
			// ok
		} else {
			unreachable!("expect a reset event, got {:?}", recv)
		}

		let recv = rx.recv().await;
		if let Some(TailEvent::Line(l)) = recv {
			assert_eq!("some line\n".to_string(), l);
		} else {
			unreachable!("expect a line event, got {:?}", recv)
		}
	}

	#[tokio::test]
	async fn test_tailf_with_data() {
		let dir = tempfile::tempdir().unwrap();
		let file_path = dir.path().join("tmp");

		let mut read_file = OpenOptions::new()
			.write(true)
			.read(true)
			.create(true)
			.open(&file_path)
			.unwrap();
		let mut rng = rand::thread_rng();

		let mut written = vec![];
		let base_line = "Elit ipsum cillum ex cillum. Adipisicing consequat cupidatat do proident ut in sunt Lorem ipsum tempor. Eiusmod ipsum Lorem labore exercitation sunt pariatur excepteur fugiat cillum velit cillum enim. Nisi Lorem cupidatat ad enim velit officia eiusmod esse tempor aliquip. Deserunt pariatur tempor in duis culpa esse sit nulla irure ullamco ipsum voluptate non laboris. Occaecat officia nulla officia mollit do aliquip reprehenderit ad incididunt.";
		for i in 0..100 {
			let line = format!("{}: {}", i, &base_line[..rng.gen_range(0..base_line.len())]);
			writeln!(&mut read_file, "{line}").unwrap();
			written.push(line);
		}
		write!(&mut read_file, "partial line").unwrap();
		read_file.seek(io::SeekFrom::Start(0)).unwrap();

		let last_n = 32;
		let mut rx = tailf(read_file, last_n);
		for i in 0..last_n {
			let recv = rx.try_recv().unwrap();
			if let TailEvent::Line(l) = recv {
				let mut expected = written[written.len() - last_n + i].to_string();
				expected.push('\n');
				assert_eq!(expected, l);
			} else {
				unreachable!("expect a line event, got {:?}", recv)
			}
		}

		assert!(rx.try_recv().is_err());

		let mut append_file = OpenOptions::new().append(true).open(&file_path).unwrap();
		writeln!(append_file, " is now complete").unwrap();

		let recv = rx.recv().await;
		if let Some(TailEvent::Line(l)) = recv {
			assert_eq!("partial line is now complete\n".to_string(), l);
		} else {
			unreachable!("expect a line event, got {:?}", recv)
		}
	}
}
