// src/rust/vcd_parser.rs
// VCD file parser implementation

use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use vcd::{Parser, Command, TimescaleUnit, Value, ScopeType, VarType};

use crate::{FileMetadata, HierarchyNode, SignalCache, Timerange};

pub struct VcdParser {
    hierarchy: Vec<HierarchyNode>,
    signal_cache: SignalCache,
    metadata: Option<FileMetadata>,
    current_scope_stack: Vec<u32>,
    next_node_id: u32,
}

impl VcdParser {
    pub fn new() -> Self {
        Self {
            hierarchy: Vec::new(),
            signal_cache: SignalCache::new(),
            metadata: None,
            current_scope_stack: Vec::new(),
            next_node_id: 0,
        }
    }

    pub fn parse<R: BufRead>(&mut self, reader: R) -> Result<FileMetadata, Box<dyn std::error::Error>> {
        let mut parser = Parser::new(reader);
        let mut variables = HashMap::new();
        let mut timescale = TimescaleUnit::NS;
        let mut version = String::new();
        let mut date = String::new();

        // Parse header
        loop {
            match parser.parse_command()? {
                Some(Command::Timescale(ts)) => {
                    timescale = ts;
                },
                Some(Command::Version(v)) => {
                    version = v;
                },
                Some(Command::Date(d)) => {
                    date = d;
                },
                Some(Command::ScopeBegin(scope_type, name)) => {
                    let scope_id = self.next_node_id;
                    self.next_node_id += 1;

                    let scope_node = HierarchyNode {
                        id: scope_id,
                        name: name.clone(),
                        node_type: "scope".to_string(),
                        parent_id: self.current_scope_stack.last().copied(),
                        children: Vec::new(),
                        signal_info: None,
                    };

                    self.hierarchy.push(scope_node);
                    self.current_scope_stack.push(scope_id);
                },
                Some(Command::ScopeEnd) => {
                    self.current_scope_stack.pop();
                },
                Some(Command::Var(var_type, size, code, name)) => {
                    let signal_id = self.next_node_id;
                    self.next_node_id += 1;

                    let signal_node = HierarchyNode {
                        id: signal_id,
                        name: name.clone(),
                        node_type: "signal".to_string(),
                        parent_id: self.current_scope_stack.last().copied(),
                        children: Vec::new(),
                        signal_info: Some(crate::SignalInfo {
                            id: signal_id,
                            name: name.clone(),
                            width: size,
                            signal_type: format!("{:?}", var_type),
                            encoding: "binary".to_string(),
                            msb: size as i32 - 1,
                            lsb: 0,
                        }),
                    };

                    self.hierarchy.push(signal_node);
                    variables.insert(code, signal_id);
                },
                Some(Command::Enddefinitions) => {
                    break;
                },
                Some(_) => {
                    // Skip other header commands
                },
                None => break,
            }
        }

        // Parse value changes
        let mut min_time = u64::MAX;
        let mut max_time = 0u64;
        let mut current_time = 0u64;

        loop {
            match parser.parse_command()? {
                Some(Command::Timestamp(time)) => {
                    current_time = time;
                    min_time = min_time.min(time);
                    max_time = max_time.max(time);
                },
                Some(Command::ChangeScalar(code, value)) => {
                    if let Some(&signal_id) = variables.get(&code) {
                        let value_str = match value {
                            Value::V0 => "0",
                            Value::V1 => "1",
                            Value::X => "X",
                            Value::Z => "Z",
                        };
                        self.signal_cache.add_transition(signal_id, current_time, value_str.to_string());
                    }
                },
                Some(Command::ChangeVector(code, value)) => {
                    if let Some(&signal_id) = variables.get(&code) {
                        self.signal_cache.add_transition(signal_id, current_time, value.to_string());
                    }
                },
                Some(_) => {
                    // Skip other commands
                },
                None => break,
            }
        }

        // Create metadata
        let metadata = FileMetadata {
            format: "vcd".to_string(),
            version,
            date,
            timescale: format!("{:?}", timescale),
            total_signals: variables.len() as u32,
            total_scopes: self.hierarchy.iter().filter(|n| n.node_type == "scope").count() as u32,
            time_range: Timerange {
                start: min_time,
                end: max_time,
                timescale: format!("{:?}", timescale),
            },
        };

        self.metadata = Some(metadata.clone());
        Ok(metadata)
    }

    pub fn get_hierarchy(&self) -> Vec<HierarchyNode> {
        self.hierarchy.clone()
    }

    pub fn into_signal_cache(self) -> SignalCache {
        self.signal_cache
    }
}