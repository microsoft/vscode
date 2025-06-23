// src/rust/signal_cache.rs
// Signal cache for storing waveform transition data

use std::collections::HashMap;
use crate::{SignalData, Transition};

pub struct SignalCache {
    signals: HashMap<u32, Vec<Transition>>,
}

impl SignalCache {
    pub fn new() -> Self {
        Self {
            signals: HashMap::new(),
        }
    }

    pub fn add_transition(&mut self, signal_id: u32, time: u64, value: String) {
        let transitions = self.signals.entry(signal_id).or_insert_with(Vec::new);
        transitions.push(Transition { time, value });
    }

    pub fn get_signal_data(
        &self,
        signal_id: u32,
        time_start: Option<u64>,
        time_end: Option<u64>
    ) -> Option<Vec<Transition>> {
        let transitions = self.signals.get(&signal_id)?;

        let start_time = time_start.unwrap_or(0);
        let end_time = time_end.unwrap_or(u64::MAX);

        let filtered_transitions = transitions
            .iter()
            .filter(|t| t.time >= start_time && t.time <= end_time)
            .cloned()
            .collect();

        Some(filtered_transitions)
    }

    pub fn get_value_at_time(&self, signal_id: u32, time: u64) -> Option<String> {
        let transitions = self.signals.get(&signal_id)?;

        // Find the last transition before or at the given time
        let mut last_value = None;
        for transition in transitions {
            if transition.time <= time {
                last_value = Some(transition.value.clone());
            } else {
                break;
            }
        }

        last_value
    }

    pub fn get_time_range(&self, signal_id: u32) -> Option<(u64, u64)> {
        let transitions = self.signals.get(&signal_id)?;

        if transitions.is_empty() {
            return None;
        }

        let min_time = transitions.first().unwrap().time;
        let max_time = transitions.last().unwrap().time;

        Some((min_time, max_time))
    }
}