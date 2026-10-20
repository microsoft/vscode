/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Content-addressed test keys. The key of a test file hashes everything it can execute: the
//! content hash of every node in its name-gated closure (declarations, assets, npm package
//! versions, ambient inputs, directories it reads) plus the test toolchain. A test whose key
//! already passed does not need to run again.

use std::collections::HashMap;

use anyhow::Result;
use serde_json::Value;
use xxhash_rust::xxh3::{Xxh3, xxh3_64};

use crate::engine::global_trigger;
use crate::git::BlobReader;
use crate::graph::{Graph, Scratch, Snapshot};

fn mix(identity: u64, content: u64) -> u64 {
	xxh3_64(&[identity.to_le_bytes(), content.to_le_bytes()].concat())
}

/// Per-node signatures for one snapshot.
pub struct Keys {
	sigs: Vec<u64>,
	toolchain: u64,
}

/// Lockfile entries hashed per package name, cached by lockfile blob.
#[derive(Default)]
pub struct PackageHashes {
	cache: HashMap<String, HashMap<String, u64>>,
}

impl PackageHashes {
	fn get(&mut self, reader: &mut BlobReader, oid: &str) -> Result<&HashMap<String, u64>> {
		if !self.cache.contains_key(oid) {
			let lock: Value = serde_json::from_slice(&reader.read(oid)?).unwrap_or(Value::Null);
			let mut map = HashMap::new();
			if let Some(packages) = lock["packages"].as_object() {
				for (path, entry) in packages {
					if let Some((_, name)) = path.rsplit_once("node_modules/") {
						let h = xxh3_64(entry.to_string().as_bytes());
						map.entry(name.to_owned())
							.and_modify(|x: &mut u64| *x = x.wrapping_add(h))
							.or_insert(h);
					}
				}
			}
			self.cache.insert(oid.to_owned(), map);
		}
		Ok(&self.cache[oid])
	}
}

impl Keys {
	pub fn new(
		snap: &Snapshot,
		graph: &Graph,
		reader: &mut BlobReader,
		packages: &mut PackageHashes,
	) -> Result<Self> {
		let mut sigs = vec![0u64; graph.node_count()];
		for (f, e) in snap.entries.iter().enumerate() {
			let path_hash = xxh3_64(e.path.as_bytes());
			match &e.facts {
				Some(facts) => {
					for (i, d) in facts.decls.iter().enumerate() {
						sigs[(graph.base[f] + i as u32) as usize] =
							mix(path_hash ^ xxh3_64(d.key.as_bytes()), d.hash);
					}
				}
				None => sigs[graph.base[f] as usize] = mix(path_hash, xxh3_64(e.oid.as_bytes())),
			}
		}
		let lock = snap
			.find("package-lock.json")
			.map(|i| snap.entries[i as usize].oid.clone());
		let lock_hashes = match &lock {
			Some(oid) => Some(packages.get(reader, oid)?),
			None => None,
		};
		for (name, &id) in &graph.packages {
			let content = lock_hashes.and_then(|m| m.get(name)).copied().unwrap_or(0);
			sigs[id as usize] = mix(xxh3_64(format!("pkg:{name}").as_bytes()), content);
		}
		for (name, &id) in &graph.globals {
			let source = if name == "_VSCODE_PRODUCT_JSON" {
				"product.json"
			} else {
				"package.json"
			};
			let content = snap
				.find(source)
				.map_or(0, |i| xxh3_64(snap.entries[i as usize].oid.as_bytes()));
			sigs[id as usize] = mix(xxh3_64(format!("global:{name}").as_bytes()), content);
		}
		// Nodes that read a directory by path depend on every file in it.
		for (dir, readers) in graph.dir_readers() {
			let mut h = Xxh3::new();
			for e in &snap.entries[snap.under(dir)] {
				h.update(e.path.as_bytes());
				h.update(e.oid.as_bytes());
			}
			let content = h.digest();
			for &v in readers {
				sigs[v as usize] = mix(sigs[v as usize], content);
			}
		}
		let mut toolchain = Xxh3::new();
		for e in snap
			.entries
			.iter()
			.filter(|e| global_trigger(&e.path).is_some())
		{
			toolchain.update(e.path.as_bytes());
			toolchain.update(e.oid.as_bytes());
		}
		Ok(Self {
			sigs,
			toolchain: toolchain.digest(),
		})
	}

	pub fn test_key(&self, graph: &Graph, file: u32, scratch: &mut Scratch) -> u64 {
		graph
			.closure(file, scratch)
			.into_iter()
			.fold(self.toolchain, |k, v| k.wrapping_add(self.sigs[v as usize]))
	}
}
