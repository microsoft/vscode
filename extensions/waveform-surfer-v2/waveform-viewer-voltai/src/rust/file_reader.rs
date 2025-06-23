// src/rust/file_reader.rs
// WASM-compatible file reader

use std::io::{BufRead, BufReader, Read};
use crate::fs_read;

pub struct WasmFileReader {
    file_size: u64,
    position: u64,
    buffer: Vec<u8>,
    buffer_pos: usize,
    buffer_size: usize,
}

impl WasmFileReader {
    pub fn new(file_size: u64) -> Self {
        Self {
            file_size,
            position: 0,
            buffer: vec![0; 8192], // 8KB buffer
            buffer_pos: 0,
            buffer_size: 0,
        }
    }

    fn fill_buffer(&mut self) -> std::io::Result<()> {
        if self.position >= self.file_size {
            self.buffer_size = 0;
            return Ok(());
        }

        let read_size = std::cmp::min(self.buffer.len() as u64, self.file_size - self.position) as u32;
        let data = fs_read(self.position, read_size);

        if data.is_empty() {
            self.buffer_size = 0;
        } else {
            self.buffer_size = data.len();
            self.buffer[..self.buffer_size].copy_from_slice(&data);
            self.position += self.buffer_size as u64;
        }

        self.buffer_pos = 0;
        Ok(())
    }
}

impl Read for WasmFileReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.buffer_pos >= self.buffer_size {
            self.fill_buffer()?;
            if self.buffer_size == 0 {
                return Ok(0); // EOF
            }
        }

        let available = self.buffer_size - self.buffer_pos;
        let to_copy = std::cmp::min(buf.len(), available);

        buf[..to_copy].copy_from_slice(&self.buffer[self.buffer_pos..self.buffer_pos + to_copy]);
        self.buffer_pos += to_copy;

        Ok(to_copy)
    }
}

impl BufRead for WasmFileReader {
    fn fill_buf(&mut self) -> std::io::Result<&[u8]> {
        if self.buffer_pos >= self.buffer_size {
            self.fill_buffer()?;
        }
        Ok(&self.buffer[self.buffer_pos..self.buffer_size])
    }

    fn consume(&mut self, amt: usize) {
        self.buffer_pos = std::cmp::min(self.buffer_pos + amt, self.buffer_size);
    }
}