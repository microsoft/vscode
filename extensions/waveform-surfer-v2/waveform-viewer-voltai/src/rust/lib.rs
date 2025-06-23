// src/rust/lib.rs
// Main entry point for the Rust WASM module

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Cursor};
use std::sync::{Mutex, OnceLock};

// Generate bindings from WIT interface
wit_bindgen::generate!({
    world: "surfer-parser",
    path: "../../wit/surfer.wit",
});

mod vcd_parser;
mod file_reader;
mod signal_cache;

use crate::vcd_parser::VcdParser;
use crate::file_reader::WasmFileReader;
use crate::signal_cache::SignalCache;

// Global state for the parser
static PARSER_STATE: OnceLock<Mutex<Option<ParserState>>> = OnceLock::new();

struct ParserState {
    file_reader: WasmFileReader,
    signal_cache: SignalCache,
    hierarchy: Vec<HierarchyNode>,
    metadata: Option<FileMetadata>,
    current_format: String,
}

impl ParserState {
    fn new(file_size: u64) -> Self {
        Self {
            file_reader: WasmFileReader::new(file_size),
            signal_cache: SignalCache::new(),
            hierarchy: Vec::new(),
            metadata: None,
            current_format: String::new(),
        }
    }
}

// Implementation of the WIT world interface
struct SurferParserImpl;

impl Guest for SurferParserImpl {
    fn parse_file(file_size: u64, format_hint: Option<String>) -> ParseResult {
        // Initialize global state
        let state = ParserState::new(file_size);
        let state_mutex = Mutex::new(Some(state));

        if PARSER_STATE.set(state_mutex).is_err() {
            return ParseResult::Err(ParseError::Unknown);
        }

        // Determine file format
        let format = match format_hint {
            Some(hint) => hint,
            None => detect_file_format(),
        };

        log_message("info".to_string(), format!("Parsing file with format: {}", format));

        // Parse based on format
        match format.as_str() {
            "vcd" => parse_vcd_file(file_size),
            "fst" => {
                log_message("warn".to_string(), "FST format not yet implemented".to_string());
                ParseResult::Err(ParseError::UnsupportedVersion)
            },
            "ghw" => {
                log_message("warn".to_string(), "GHW format not yet implemented".to_string());
                ParseResult::Err(ParseError::UnsupportedVersion)
            },
            "fsdb" => {
                log_message("warn".to_string(), "FSDB format not yet implemented".to_string());
                ParseResult::Err(ParseError::UnsupportedVersion)
            },
            _ => ParseResult::Err(ParseError::InvalidFormat),
        }
    }

    fn get_hierarchy_children(parent_id: Option<u32>) -> Vec<HierarchyNode> {
        let parser_state = PARSER_STATE.get().unwrap();
        let state_guard = parser_state.lock().unwrap();

        if let Some(state) = state_guard.as_ref() {
            state.hierarchy
                .iter()
                .filter(|node| node.parent_id == parent_id)
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }

    fn get_signal_data(signal_ids: Vec<u32>, time_start: Option<u64>, time_end: Option<u64>) {
        let parser_state = PARSER_STATE.get().unwrap();
        let state_guard = parser_state.lock().unwrap();

        if let Some(state) = state_guard.as_ref() {
            for signal_id in signal_ids {
                if let Some(transitions) = state.signal_cache.get_signal_data(signal_id, time_start, time_end) {
                    let signal_data = SignalData {
                        signal_id,
                        transitions,
                        min_time: time_start.unwrap_or(0),
                        max_time: time_end.unwrap_or(u64::MAX),
                    };

                    // Send data in chunks to avoid memory issues
                    signal_data_chunk(signal_data, 0, 1);
                }
            }
        }
    }

    fn get_signal_value_at_time(signal_id: u32, time: u64) -> Option<String> {
        let parser_state = PARSER_STATE.get().unwrap();
        let state_guard = parser_state.lock().unwrap();

        if let Some(state) = state_guard.as_ref() {
            state.signal_cache.get_value_at_time(signal_id, time)
        } else {
            None
        }
    }

    fn get_time_range() -> Option<Timerange> {
        let parser_state = PARSER_STATE.get().unwrap();
        let state_guard = parser_state.lock().unwrap();

        if let Some(state) = state_guard.as_ref() {
            state.metadata.as_ref().map(|meta| meta.time_range.clone())
        } else {
            None
        }
    }

    fn cleanup() {
        if let Some(parser_state) = PARSER_STATE.get() {
            let mut state_guard = parser_state.lock().unwrap();
            *state_guard = None;
        }
        log_message("info".to_string(), "Parser cleanup completed".to_string());
    }
}

// Helper functions
fn detect_file_format() -> String {
    // Read first few bytes to detect format
    let header = fs_read(0, 16);

    if header.starts_with(b"$version") {
        "vcd".to_string()
    } else if header.starts_with(b"FST") {
        "fst".to_string()
    } else if header.starts_with(b"GHDL") {
        "ghw".to_string()
    } else {
        // Default to VCD for now
        "vcd".to_string()
    }
}

fn parse_vcd_file(file_size: u64) -> ParseResult {
    let parser_state = PARSER_STATE.get().unwrap();
    let mut state_guard = parser_state.lock().unwrap();

    if let Some(ref mut state) = state_guard.as_mut() {
        let mut vcd_parser = VcdParser::new();

        progress_update(0.0, "Starting VCD parsing...".to_string());

        match vcd_parser.parse(&mut state.file_reader) {
            Ok(metadata) => {
                // Store metadata
                state.metadata = Some(metadata.clone());
                state.current_format = "vcd".to_string();

                // Send metadata to TypeScript
                metadata_ready(metadata.clone());

                // Extract hierarchy and send nodes
                let hierarchy = vcd_parser.get_hierarchy();
                for node in &hierarchy {
                    hierarchy_node_discovered(node.clone());
                }
                state.hierarchy = hierarchy;

                // Cache signal data
                state.signal_cache = vcd_parser.into_signal_cache();

                progress_update(100.0, "VCD parsing completed".to_string());
                ParseResult::Ok(metadata)
            },
            Err(e) => {
                log_message("error".to_string(), format!("VCD parsing failed: {:?}", e));
                ParseResult::Err(ParseError::CorruptedData)
            }
        }
    } else {
        ParseResult::Err(ParseError::Unknown)
    }
}

// Export the implementation
export!(SurferParserImpl);