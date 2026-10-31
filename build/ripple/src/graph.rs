/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! The impact graph. Every runtime declaration of every module is a node; node 0 of a module is
//! its initializer. Edges point from a node to what it depends on: the declarations it references
//! (resolved through re-export chains), and for initializers, the modules they load.

use std::collections::{HashMap, HashSet};
use std::ops::Range;
use std::sync::Arc;

use crate::analyze::{
	ExportTarget, FileFacts, Heritage, IMPLICIT_METHODS, Imported, Ref, TypeOrigin, name_id,
};
use crate::config::{Config, Role, Signals};

#[derive(Clone)]
pub struct Entry {
	pub path: Arc<str>,
	pub oid: Arc<str>,
	pub role: Role,
	pub facts: Option<Arc<FileFacts>>,
}

/// The files of one commit, sorted by path.
#[derive(Clone, Default)]
pub struct Snapshot {
	pub entries: Vec<Entry>,
}

impl Snapshot {
	pub fn find(&self, path: &str) -> Option<u32> {
		self.entries
			.binary_search_by(|e| (*e.path).cmp(path))
			.ok()
			.map(|i| i as u32)
	}

	/// The role of a path in this snapshot, `Asset` if it does not exist.
	pub fn role(&self, path: &str) -> Role {
		self.find(path)
			.map_or(Role::Asset, |i| self.entries[i as usize].role)
	}

	/// The file that a module path names, such as `src/a.ts` for `src/a.js`, if it exists.
	pub fn resolve_file(&self, p: &str) -> Option<u32> {
		let candidates: Vec<String> = if let Some(stem) = p.strip_suffix(".js") {
			vec![format!("{stem}.ts"), format!("{stem}.tsx"), p.to_owned()]
		} else if let Some(stem) = p.strip_suffix(".mjs") {
			vec![format!("{stem}.mts"), p.to_owned()]
		} else {
			vec![
				p.to_owned(),
				format!("{p}.ts"),
				format!("{p}/index.ts"),
				format!("{p}.js"),
			]
		};
		candidates.iter().find_map(|c| self.find(c))
	}

	/// Entries inside a directory.
	pub fn under(&self, dir: &str) -> Range<usize> {
		let prefix = format!("{}/", dir.trim_end_matches('/'));
		let start = self.entries.partition_point(|e| *e.path < *prefix);
		let end = start + self.entries[start..].partition_point(|e| e.path.starts_with(&prefix));
		start..end
	}
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Res {
	None,
	File(u32),
	/// A file or directory that code reads by path, such as a grammar or a fixture folder that a
	/// test reads: index into `Linker::reads`.
	Read(u32),
	/// The data files (not modules) of a directory that code reads by a computed path: index into
	/// `Linker::data_dirs`.
	DataDir(u32),
	Pkg(u32),
	/// A Node.js built-in module: index into `Linker::builtins`.
	Builtin(u32),
}

const BUILTINS: &[&str] = &[
	"assert",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"inspector",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"stream",
	"string_decoder",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
];

/// The npm package that a module specifier such as `@scope/pkg/sub` loads: none for paths, URLs
/// and Node.js built-in modules.
pub fn package_name(spec: &str) -> Option<String> {
	if spec.starts_with(['.', '/']) || spec.starts_with("node:") || spec.contains("://") {
		return None;
	}
	let mut segments = spec.split('/');
	let name = match (spec.starts_with('@'), segments.next(), segments.next()) {
		(true, Some(scope), Some(pkg)) => format!("{scope}/{pkg}"),
		(false, Some(pkg), _) => pkg.to_owned(),
		_ => return None,
	};
	(!BUILTINS.contains(&name.as_str())).then_some(name)
}

/// The Node.js built-in module that a module specifier loads, such as `fs` for `node:fs` and
/// `fs/promises`.
pub fn builtin_module(spec: &str) -> Option<&str> {
	let (name, prefixed) = match spec.strip_prefix("node:") {
		Some(name) => (name, true),
		None => (spec, false),
	};
	let name = name.strip_suffix("/promises").unwrap_or(name);
	let first = name.split('/').next()?;
	(prefixed || BUILTINS.contains(&first)).then_some(name)
}

/// The platform signal name of two levels of members of a namespace or default import (see
/// `Ref::ImportPath`): `node:fs#chmod` for `fs.promises.chmod`, `npm:vscode#Uri.file` for
/// `vscode.Uri.file`.
pub fn import_path_signal(owner: &str, path: &str) -> String {
	match path.strip_prefix("promises.") {
		Some(m) if owner.starts_with("node:") => format!("{owner}#{m}"),
		_ => format!("{owner}#{path}"),
	}
}

/// The platform signal name of what code uses through an import of a Node.js module or an npm
/// package (`owner` is `node:fs` or `npm:vscode`): `node:fs#realpath` for `fs.realpath`,
/// `import { realpath } from 'fs'` and `import { promises } from 'fs'` with `promises.realpath`,
/// `npm:vscode#Uri.file` for `import { Uri } from 'vscode'` with `Uri.file`, or the owner itself
/// for a use of the whole module.
pub fn import_signal(owner: &str, imported: &Imported, member: Option<&str>) -> String {
	match (imported, member) {
		(Imported::Named(n), Some(m)) if n == "promises" => format!("{owner}#{m}"),
		(Imported::Named(n), Some(m)) => format!("{owner}#{n}.{m}"),
		(Imported::Named(n), None) => format!("{owner}#{n}"),
		(_, Some(m)) => format!("{owner}#{m}"),
		(_, None) => owner.to_owned(),
	}
}

/// Something a module loads when it is evaluated.
#[derive(Clone, PartialEq, Eq)]
pub enum Load {
	File(u32),
	/// An npm package module, by specifier: `pkg/one` and `pkg/two` are different modules.
	Package(Box<str>),
}

/// A computed path: the directory it starts in, and the static start and end of the path in it.
type DataPattern = (Box<str>, Box<str>, Box<str>);

/// Whether a path inside the directory of a computed path has the path's static start and end.
fn matches_data_pattern(start: &str, end: &str, path: &str) -> bool {
	path.len() >= start.len() + end.len() && path.starts_with(start) && path.ends_with(end)
}

/// The test data folders of a snapshot, by folder name: the folders next to test files that
/// contain no module, each with the test files next to it.
fn test_data_folders(snap: &Snapshot) -> Vec<(&str, Vec<(&str, Vec<u32>)>)> {
	fn dir_of(p: &str) -> &str {
		p.rsplit_once('/').map_or("", |(d, _)| d)
	}
	let mut tests: HashMap<&str, Vec<u32>> = HashMap::new();
	for (f, e) in snap.entries.iter().enumerate() {
		if e.role.is_test() {
			tests.entry(dir_of(&e.path)).or_default().push(f as u32);
		}
	}
	// The folders next to test files, and whether they contain a module.
	let mut folders: HashMap<&str, bool> = HashMap::new();
	for e in &snap.entries {
		for (i, _) in e.path.match_indices('/') {
			let folder = &e.path[..i];
			if tests.contains_key(dir_of(folder)) {
				*folders.entry(folder).or_default() |= e.role.is_module();
			}
		}
	}
	let mut by_name: HashMap<&str, Vec<(&str, Vec<u32>)>> = HashMap::new();
	for (folder, has_module) in folders {
		if !has_module {
			let (dir, name) = folder.rsplit_once('/').unwrap_or(("", folder));
			by_name
				.entry(name)
				.or_default()
				.push((folder, tests[dir].clone()));
		}
	}
	let mut list: Vec<_> = by_name.into_iter().collect();
	list.sort_unstable_by(|a, b| a.0.cmp(b.0));
	list
}

/// The path that a relative path names from a directory, unless it leaves the repository.
pub fn join(dir: &str, rel: &str) -> Option<String> {
	let mut parts: Vec<&str> = dir.split('/').filter(|s| !s.is_empty()).collect();
	for seg in rel.split('/') {
		match seg {
			"" | "." => {}
			".." => {
				parts.pop()?;
			}
			s => parts.push(s),
		}
	}
	Some(parts.join("/"))
}

struct Linker<'s> {
	snap: &'s Snapshot,
	config: &'s Config,
	base: &'s [u32],
	res: Vec<Option<Box<[Res]>>>,
	memo: HashMap<(u32, Box<str>), Vec<u32>>,
	/// The node standing for the surface of each module that code references as a whole (see
	/// `surface`), and the ones whose edges are still to be added.
	surfaces: HashMap<u32, u32>,
	new_surfaces: Vec<(u32, u32)>,
	packages: HashMap<String, u32>,
	globals: HashMap<String, u32>,
	/// Platform signals that code uses (see `Signals`), by name, such as `node:fs#realpath`.
	signals: HashMap<String, u32>,
	builtins: Vec<Box<str>>,
	builtin_index: HashMap<Box<str>, u32>,
	reads: Vec<Box<str>>,
	read_index: HashMap<Box<str>, u32>,
	/// Computed paths: (directory, static start, static end of the path in the directory).
	data_dirs: Vec<DataPattern>,
	data_dir_index: HashMap<DataPattern, u32>,
	file_nodes_end: u32,
	next: u32,
	/// Imports of names that a module does not export (see `Graph::unresolved`).
	unresolved: u32,
}

impl<'s> Linker<'s> {
	/// Adds the nodes that a reference of module `f` depends on to `out`, and returns the file or
	/// folder that it reads by path, if any (`Res::Read` or `Res::DataDir`). `count` counts an
	/// import that cannot be resolved (see `Graph::unresolved`): the references of test cases
	/// are references of their initializer too.
	fn ref_targets(&mut self, f: u32, r: &Ref, out: &mut Vec<u32>, count: bool) -> Res {
		let snap = self.snap;
		let facts = snap.entries[f as usize].facts.as_deref().unwrap();
		let b = self.base[f as usize];
		match r {
			Ref::Local(t) => out.push(b + t),
			Ref::Import { binding, member } => {
				let spec = facts.bindings[*binding as usize].spec;
				// What the code uses of a Node.js module or npm package, for the platform
				// analysis: the npm package itself is a node already.
				if let Some(owner) = self.signal_owner(f, spec) {
					let name = import_signal(
						&owner,
						&facts.bindings[*binding as usize].imported,
						member.as_deref(),
					);
					if (name.contains('#') || owner.starts_with("node:"))
						&& self.config.is_platform_signal(&name)
					{
						out.push(self.signal(&name));
					}
				}
				let targets = self.resolve_binding(f, *binding, member.as_deref(), 0);
				if targets.is_empty() {
					// A module that does not export the name (for example a type used as a value or
					// a non-module file): depend on the whole module. Built-ins are leaves.
					if let Res::File(t) = self.spec_res(f, spec) {
						self.unresolved += count as u32;
						if count && std::env::var_os("RIPPLE_DEBUG").is_some() {
							let binding = &facts.bindings[*binding as usize];
							eprintln!(
								"unresolved: {} imports {:?} from {}",
								snap.entries[f as usize].path,
								binding.imported,
								facts.specs[binding.spec as usize].specifier
							);
						}
						out.push(self.surface(t));
					}
				}
				out.extend(targets);
			}
			Ref::All(spec) => match self.spec_res(f, *spec) {
				Res::File(t) => out.push(self.surface(t)),
				read @ (Res::Read(_) | Res::DataDir(_)) => return read,
				Res::Pkg(p) => out.push(p),
				Res::Builtin(m) => {
					let name = format!("node:{}", self.builtins[m as usize]);
					if self.config.is_platform_signal(&name) {
						out.push(self.signal(&name));
					}
				}
				_ => {}
			},
			Ref::Global(name) => out.push(self.global(name)),
			Ref::Signal(name) => {
				if self.config.is_platform_signal(name) {
					out.push(self.signal(name));
				}
			}
			Ref::ImportPath { binding, path } => {
				let spec = facts.bindings[*binding as usize].spec;
				if let Some(owner) = self.signal_owner(f, spec) {
					let name = import_path_signal(&owner, path);
					if self.config.is_platform_signal(&name) {
						out.push(self.signal(&name));
					}
				}
			}
		}
		Res::None
	}

	fn node_count(&self, f: u32) -> u32 {
		self.snap.entries[f as usize]
			.facts
			.as_ref()
			.map_or(1, |facts| facts.decls.len() as u32)
	}

	fn all_nodes(&self, f: u32) -> Range<u32> {
		let b = self.base[f as usize];
		b..b + self.node_count(f)
	}

	fn global(&mut self, name: &str) -> u32 {
		if let Some(&id) = self.globals.get(name) {
			return id;
		}
		let id = self.next;
		self.next += 1;
		self.globals.insert(name.to_owned(), id);
		id
	}

	/// The node of a platform signal, a leaf that only the platform analysis reads.
	fn signal(&mut self, name: &str) -> u32 {
		if let Some(&id) = self.signals.get(name) {
			return id;
		}
		let id = self.next;
		self.next += 1;
		self.signals.insert(name.to_owned(), id);
		id
	}

	/// The platform signal name of the Node.js module or npm package that a spec names:
	/// `node:fs` or `npm:electron`.
	fn signal_owner(&mut self, f: u32, spec: u32) -> Option<String> {
		match self.spec_res(f, spec) {
			Res::Builtin(b) => Some(format!("node:{}", self.builtins[b as usize])),
			Res::Pkg(_) => {
				let facts = self.snap.entries[f as usize].facts.as_ref()?;
				package_name(&facts.specs[spec as usize].specifier).map(|p| format!("npm:{p}"))
			}
			_ => None,
		}
	}

	/// The node of `member` when `v` is a declaration with tracked members, otherwise `v`.
	fn member_node(&self, v: u32, member: &str) -> u32 {
		if v >= self.file_nodes_end {
			return v;
		}
		let f = self.base.partition_point(|&b| b <= v) - 1;
		let Some(facts) = self.snap.entries[f].facts.as_deref() else {
			return v;
		};
		let members = &facts.decls[(v - self.base[f]) as usize].members;
		members
			.binary_search_by(|(n, _)| (**n).cmp(member))
			.map_or(v, |i| self.base[f] + members[i].1)
	}

	fn package(&mut self, spec: &str) -> Res {
		if let Some(module) = builtin_module(spec) {
			if let Some(&b) = self.builtin_index.get(module) {
				return Res::Builtin(b);
			}
			let b = self.builtins.len() as u32;
			self.builtins.push(module.into());
			self.builtin_index.insert(module.into(), b);
			return Res::Builtin(b);
		}
		let Some(name) = package_name(spec) else {
			return Res::None;
		};
		if let Some(&id) = self.packages.get(&name) {
			return Res::Pkg(id);
		}
		let id = self.next;
		self.next += 1;
		self.packages.insert(name, id);
		Res::Pkg(id)
	}

	fn resolve_path(&mut self, p: &str) -> Res {
		if let Some(i) = self.snap.resolve_file(p) {
			return Res::File(i);
		}
		let p = p.trim_end_matches('/');
		let range = self.snap.under(p);
		if !range.is_empty() {
			if let Some(&d) = self.read_index.get(p) {
				return Res::Read(d);
			}
			// Tests that read a folder read data (fixtures, media, scripts). Strings that name a
			// folder of source code are almost always path manipulation.
			let code = self.snap.entries[range.clone()]
				.iter()
				.filter(|e| e.role.is_module())
				.count();
			if code * 2 > range.len() && range.len() > 30 {
				return Res::None;
			}
			return Res::Read(self.read(p));
		}
		Res::None
	}

	/// The id of a file or directory read by path.
	fn read(&mut self, p: &str) -> u32 {
		if let Some(&d) = self.read_index.get(p) {
			return d;
		}
		let d = self.reads.len() as u32;
		self.reads.push(p.into());
		self.read_index.insert(p.into(), d);
		d
	}

	/// The data files that a computed path can name: those under the folder it starts in whose path
	/// in that folder has its static start and end. The folder must be specific enough: not a
	/// top-level folder such as `src/vs`.
	fn data_dir(&mut self, from: &str, spec: &str, root: bool, start: &str, end: &str) -> Res {
		let relative =
			spec == "." || spec == ".." || spec.starts_with("./") || spec.starts_with("../");
		let path = if root {
			Some(spec.to_owned())
		} else if relative {
			join(from.rsplit_once('/').map_or("", |(d, _)| d), spec)
		} else {
			self.config.resolve_alias(&format!("{spec}/"))
		};
		let Some(path) = path else {
			return Res::None;
		};
		let path = path.trim_end_matches('/');
		let range = self.snap.under(path);
		if path.matches('/').count() < 2
			|| !self.snap.entries[range].iter().any(|e| {
				!e.role.is_module() && matches_data_pattern(start, end, &e.path[path.len() + 1..])
			}) {
			return Res::None;
		}
		let pattern: DataPattern = (path.into(), start.into(), end.into());
		if let Some(&d) = self.data_dir_index.get(&pattern) {
			return Res::DataDir(d);
		}
		let d = self.data_dirs.len() as u32;
		self.data_dirs.push(pattern.clone());
		self.data_dir_index.insert(pattern, d);
		Res::DataDir(d)
	}

	fn resolve_specifier(&mut self, from: &str, spec: &str) -> Res {
		if spec.starts_with("./") || spec.starts_with("../") {
			let dir = from.rsplit_once('/').map_or("", |(d, _)| d);
			match join(dir, spec) {
				Some(p) => self.resolve_path(&p),
				None => Res::None,
			}
		} else if let Some(p) = self.config.resolve_alias(spec) {
			self.resolve_path(&p)
		} else if spec.starts_with('/') || spec.starts_with('.') || spec.contains("://") {
			Res::None
		} else {
			self.package(spec)
		}
	}

	fn spec_res(&mut self, f: u32, spec: u32) -> Res {
		if self.res[f as usize].is_none() {
			let snap = self.snap;
			let entry = &snap.entries[f as usize];
			let facts = entry.facts.as_ref().expect("only code files have specs");
			let resolved: Vec<Res> = facts
				.specs
				.iter()
				.map(|s| {
					if let Some((start, end)) = &s.data {
						self.data_dir(&entry.path, &s.specifier, s.root, start, end)
					} else if s.root {
						// No module specifier is a path from the repository root, so code reads the
						// file that such a string names, or the string only looks like a path (the
						// files of a fake tree). It depends on the file's content, never on what a
						// module it names loads.
						match self.resolve_path(&s.specifier) {
							Res::File(t) => Res::Read(self.read(&snap.entries[t as usize].path)),
							r => r,
						}
					} else {
						self.resolve_specifier(&entry.path, &s.specifier)
					}
				})
				.collect();
			self.res[f as usize] = Some(resolved.into_boxed_slice());
		}
		self.res[f as usize].as_ref().unwrap()[spec as usize]
	}

	fn resolve_export(&mut self, f: u32, name: &str, depth: u32) -> Vec<u32> {
		let snap = self.snap;
		let Some(facts) = snap.entries[f as usize].facts.as_deref() else {
			return vec![self.base[f as usize]];
		};
		if depth > 24 {
			return vec![];
		}
		if let Some(v) = self.memo.get(&(f, name.into())) {
			return v.clone();
		}
		let mut out = Vec::new();
		for (_, target) in facts.exports_named(name) {
			match target {
				ExportTarget::Local(d) => out.push(self.base[f as usize] + d),
				ExportTarget::Binding(b) => {
					out.extend(self.resolve_binding(f, *b, None, depth + 1))
				}
				ExportTarget::ReExport { spec, name: inner } => match self.spec_res(f, *spec) {
					Res::File(t) => out.extend(self.resolve_export(t, inner, depth + 1)),
					Res::Pkg(p) => out.push(p),
					_ => {}
				},
				ExportTarget::Namespace(spec) => match self.spec_res(f, *spec) {
					Res::File(t) => out.push(self.surface(t)),
					Res::Pkg(p) => out.push(p),
					_ => {}
				},
			}
		}
		if out.is_empty() {
			for &star in &facts.stars {
				if let Res::File(t) = self.spec_res(f, star) {
					let r = self.resolve_export(t, name, depth + 1);
					if !r.is_empty() {
						out = r;
						out.extend(facts.star_decl.map(|s| self.base[f as usize] + s));
						break;
					}
				}
			}
		} else if let Some(e) = facts.export_decl(name) {
			// Consumers also depend on what each module along the chain binds the name to.
			out.push(self.base[f as usize] + e);
		}
		self.memo.insert((f, name.into()), out.clone());
		out
	}

	/// The node that a reference to a whole module depends on, such as a dynamic import or a
	/// namespace import used as a value. It depends on the module's own nodes and on what its
	/// exports bind to, through re-exports (`export { x } from`, `export * from`, `export * as ns
	/// from`), which `Graph::build` adds as its edges. A node of its own, so that a cycle of
	/// re-exports is a cycle of the graph.
	fn surface(&mut self, f: u32) -> u32 {
		if let Some(&s) = self.surfaces.get(&f) {
			return s;
		}
		let s = self.next;
		self.next += 1;
		self.surfaces.insert(f, s);
		self.new_surfaces.push((f, s));
		s
	}

	/// Whether a type that `implements` names comes from a package: the type `name` of the module
	/// that `spec` of module `f` names, followed through re-exports, aliases and the interfaces it
	/// extends (see `FileFacts::type_decls`).
	fn external_type(
		&mut self,
		f: u32,
		spec: u32,
		name: &str,
		seen: &mut HashSet<(u32, Box<str>)>,
	) -> bool {
		match self.spec_res(f, spec) {
			Res::File(t) => self.type_of_module_is_external(t, name, seen),
			// A package, or a module that is not analyzed, such as a declaration file.
			_ => true,
		}
	}

	fn type_of_module_is_external(
		&mut self,
		t: u32,
		name: &str,
		seen: &mut HashSet<(u32, Box<str>)>,
	) -> bool {
		if !seen.insert((t, name.into())) {
			return false;
		}
		let snap = self.snap;
		let Some(facts) = snap.entries[t as usize].facts.as_deref() else {
			return true;
		};
		match facts
			.type_decls
			.binary_search_by(|(n, _)| n.as_str().cmp(name))
		{
			Ok(i) => facts.type_decls[i].1.iter().any(|origin| match origin {
				TypeOrigin::External => true,
				TypeOrigin::Import { spec, name } => self.external_type(t, *spec, name, seen),
				TypeOrigin::Local(n) => self.type_of_module_is_external(t, n, seen),
			}),
			Err(_) => facts
				.stars
				.iter()
				.any(|&star| match self.spec_res(t, star) {
					Res::File(u) => self.type_of_module_is_external(u, name, seen),
					Res::Pkg(_) => true,
					_ => false,
				}),
		}
	}

	fn resolve_binding(&mut self, f: u32, b: u32, member: Option<&str>, depth: u32) -> Vec<u32> {
		let snap = self.snap;
		let facts = snap.entries[f as usize].facts.as_deref().unwrap();
		let binding = &facts.bindings[b as usize];
		let with_member = |linker: &Self, nodes: Vec<u32>| -> Vec<u32> {
			match member {
				Some(m) => nodes
					.into_iter()
					.map(|v| linker.member_node(v, m))
					.collect(),
				None => nodes,
			}
		};
		match self.spec_res(f, binding.spec) {
			Res::File(t) => match &binding.imported {
				Imported::Named(n) => {
					let r = self.resolve_export(t, n, depth);
					with_member(self, r)
				}
				Imported::Default => {
					let r = self.resolve_export(t, "default", depth);
					with_member(self, r)
				}
				Imported::Namespace => {
					let r = member
						.map(|m| self.resolve_export(t, m, depth))
						.unwrap_or_default();
					if r.is_empty() {
						vec![self.surface(t)]
					} else {
						r
					}
				}
			},
			Res::Pkg(p) => vec![p],
			_ => vec![],
		}
	}
}

/// Adjacency in compressed sparse row form.
struct Csr<T = u32> {
	start: Vec<u32>,
	items: Vec<T>,
}

impl<T: Copy + Default> Csr<T> {
	fn group(n: usize, pairs: &[(u32, T)]) -> Self {
		let mut start = vec![0u32; n + 1];
		for &(k, _) in pairs {
			start[k as usize + 1] += 1;
		}
		for i in 0..n {
			start[i + 1] += start[i];
		}
		let mut pos = start.clone();
		let mut items = vec![T::default(); pairs.len()];
		for &(k, v) in pairs {
			items[pos[k as usize] as usize] = v;
			pos[k as usize] += 1;
		}
		Self { start, items }
	}

	fn of(&self, k: u32) -> &[T] {
		&self.items[self.start[k as usize] as usize..self.start[k as usize + 1] as usize]
	}
}

impl Csr<u32> {
	fn reverse(n: usize, edges: &[(u32, u32)]) -> Self {
		let swapped: Vec<(u32, u32)> = edges.iter().map(|&(u, v)| (v, u)).collect();
		Self::group(n, &swapped)
	}

	fn reach(&self, seeds: impl IntoIterator<Item = u32>) -> Vec<bool> {
		let n = self.start.len() - 1;
		let mut seen = vec![false; n];
		let mut stack = Vec::new();
		for s in seeds {
			if !seen[s as usize] {
				seen[s as usize] = true;
				stack.push(s);
			}
		}
		while let Some(v) = stack.pop() {
			for &u in
				&self.items[self.start[v as usize] as usize..self.start[v as usize + 1] as usize]
			{
				if !seen[u as usize] {
					seen[u as usize] = true;
					stack.push(u);
				}
			}
		}
		seen
	}
}

/// Reusable buffers for `Graph::reaches`.
#[derive(Default)]
pub struct Scratch {
	stamp: u32,
	visited: Vec<u32>,
	used: std::collections::HashSet<u64>,
	pending: HashMap<u64, Vec<u32>>,
}

/// How a search reached the nodes it visited (see `Graph::path_from`).
#[derive(Default)]
struct Trace {
	/// The node whose edge led to each visited or waiting node.
	from: HashMap<u32, u32>,
	/// The node that used each name first, which opened the instance methods of that name.
	named_by: HashMap<u64, u32>,
}

pub struct Graph {
	/// First node of each snapshot entry.
	pub base: Vec<u32>,
	/// Owning entry of each node, or `u32::MAX` for the nodes standing for packages, injected
	/// globals and whole modules.
	pub node_file: Vec<u32>,
	pub packages: HashMap<String, u32>,
	/// The module that each node standing for a whole module stands for (see `Linker::surface`).
	surfaces: HashMap<u32, u32>,
	/// Number of nodes owned by files; the nodes standing for packages, injected globals and whole
	/// modules follow.
	file_nodes_end: u32,
	nodes: Csr,
	forward: Csr,
	/// Name gate of each node (instance methods), 0 for none.
	gate: Vec<u64>,
	/// Property names used by each node.
	uses: Csr<u64>,
	/// File-level reverse imports, including type-only imports (what a file-level tool would use).
	files_all: Csr,
	/// File-level reverse runtime loads.
	files_runtime: Csr,
	/// Nodes and files that read a file or directory by path, keyed by path.
	reads: HashMap<Box<str>, (Vec<u32>, Vec<u32>)>,
	/// Nodes and files that read data files of a directory by a computed path, by directory, with
	/// the static start and end of the path in the directory.
	data_dirs: HashMap<Box<str>, Vec<(Box<str>, Box<str>, u32, u32)>>,
	/// Globals injected by the test runners, and the nodes standing for them.
	pub globals: HashMap<String, u32>,
	/// Platform signals that code uses, by name, and the leaf nodes standing for them (see
	/// `Signals`).
	pub signals: HashMap<String, u32>,
	/// Modules loaded by each entry's initializer.
	pub loads: Vec<Box<[u32]>>,
	/// The modules and npm packages loaded by each entry's initializer, in load order.
	load_order: Vec<Box<[Load]>>,
	/// Loading the entry has effects outside of it, directly or through modules it loads.
	pub effectful: Vec<bool>,
	/// Name ids of the methods code calls without naming them (see `IMPLICIT_METHODS`).
	implicit: Vec<u64>,
	pub edges: usize,
	pub unresolved: u32,
	/// The nodes that each test case of a module initializer references, by module (see
	/// `FileFacts::cases`). They are not edges of the graph: only the platform analysis reads them.
	cases: HashMap<u32, Vec<Box<[u32]>>>,
}

impl Graph {
	pub fn build(snap: &Snapshot, config: &Config) -> Self {
		let n = snap.entries.len();
		let mut base = Vec::with_capacity(n);
		let mut next = 0u32;
		for e in &snap.entries {
			base.push(next);
			next += e.facts.as_ref().map_or(1, |f| f.decls.len() as u32);
		}
		let mut linker = Linker {
			snap,
			config,
			base: &base,
			res: vec![None; n],
			memo: HashMap::new(),
			surfaces: HashMap::new(),
			new_surfaces: Vec::new(),
			packages: HashMap::new(),
			globals: HashMap::new(),
			signals: HashMap::new(),
			builtins: Vec::new(),
			builtin_index: HashMap::new(),
			reads: Vec::new(),
			read_index: HashMap::new(),
			data_dirs: Vec::new(),
			data_dir_index: HashMap::new(),
			file_nodes_end: next,
			next,
			unresolved: 0,
		};
		let mut loads: Vec<Box<[u32]>> = vec![Box::new([]); n];
		let mut load_order: Vec<Box<[Load]>> = vec![Box::new([]); n];
		let mut load_edges: Vec<(u32, u32)> = Vec::new();
		let mut read_refs: Vec<(u32, u32, u32)> = Vec::new();
		let mut data_dir_refs: Vec<(u32, u32, u32)> = Vec::new();
		let mut edges: Vec<(u32, u32)> = Vec::new();
		let mut files_all: Vec<(u32, u32)> = Vec::new();
		let mut files_runtime: Vec<(u32, u32)> = Vec::new();
		let mut targets: Vec<u32> = Vec::new();
		let mut case_targets: HashMap<u32, Vec<Box<[u32]>>> = HashMap::new();
		for f in 0..n as u32 {
			let Some(facts) = snap.entries[f as usize].facts.as_deref() else {
				continue;
			};
			let b = base[f as usize];
			for (si, spec) in facts.specs.iter().enumerate() {
				if let Res::File(t) = linker.spec_res(f, si as u32) {
					if t != f {
						files_all.push((f, t));
						if !spec.type_only {
							files_runtime.push((f, t));
						}
					}
				}
			}
			for (d, decl) in facts.decls.iter().enumerate() {
				let u = b + d as u32;
				if decl.pinned && d != 0 {
					edges.push((b, u));
				}
				for child in &decl.children {
					edges.push((u, b + child));
				}
				for r in &decl.refs {
					match linker.ref_targets(f, r, &mut targets, true) {
						Res::Read(d) => read_refs.push((d, u, f)),
						Res::DataDir(d) => data_dir_refs.push((d, u, f)),
						_ => {}
					}
					edges.extend(targets.drain(..).map(|v| (u, v)));
				}
			}
			// The test cases of the initializer, for the platform analysis only (see
			// `FileFacts::cases`): what each one references, not edges of the graph.
			if !facts.cases.is_empty() {
				let cases = facts
					.cases
					.iter()
					.map(|case| {
						for r in &case.refs {
							linker.ref_targets(f, r, &mut targets, false);
						}
						targets.sort_unstable();
						targets.dedup();
						targets.drain(..).collect()
					})
					.collect();
				case_targets.insert(f, cases);
			}
			let mut targets = Vec::new();
			let mut order = Vec::new();
			for &spec in &facts.loads {
				match linker.spec_res(f, spec) {
					Res::File(t) => {
						edges.push((b, base[t as usize]));
						targets.push(t);
						load_edges.push((f, t));
						order.push(Load::File(t));
					}
					Res::Pkg(p) => {
						edges.push((b, p));
						order.push(Load::Package(
							facts.specs[spec as usize].specifier.as_str().into(),
						));
					}
					_ => {}
				}
			}
			loads[f as usize] = targets.into_boxed_slice();
			load_order[f as usize] = order.into_boxed_slice();
		}
		// Modules that load a module, transitively, by the module they load.
		let loaders = Csr::reverse(n, &load_edges);
		// Test data: the folders next to test files that contain no modules, such as snapshots
		// and fixtures. Tests read them by a path they compute, so the folder's name appears in a
		// string of the test or of a module it loads, such as a snapshot helper's
		// '__snapshots__': those tests depend on the folder.
		for (name, folders) in test_data_folders(snap) {
			let id = name_id(name);
			let roots = (0..n as u32).filter(|&f| {
				snap.entries[f as usize]
					.facts
					.as_ref()
					.is_some_and(|facts| facts.path_segments.binary_search(&id).is_ok())
			});
			let reads = loaders.reach(roots);
			for (folder, tests) in folders {
				for f in tests.into_iter().filter(|&f| reads[f as usize]) {
					read_refs.push((linker.read(folder), base[f as usize], f));
				}
			}
		}
		// Style sheets change the document of every test that loads them. npm packages are not
		// analyzed, so loading one counts as an effect.
		let roots = (0..n as u32).filter(|&f| {
			let e = &snap.entries[f as usize];
			load_order[f as usize]
				.iter()
				.any(|l| matches!(l, Load::Package(_)))
				|| e.facts
					.as_ref()
					.map_or(e.path.ends_with(".css"), |facts| facts.global_effects)
		});
		let effectful = loaders.reach(roots);
		// What each class extends or implements (see `Heritage`): whether code outside the
		// analysis may call its methods, or the analyzed superclasses whose methods it inherits.
		// Resolved before linking the surfaces, as resolving can reference new ones.
		let mut open_classes: Vec<u32> = Vec::new();
		let mut subclasses: Vec<(u32, Vec<u32>)> = Vec::new();
		for (f, e) in snap.entries.iter().enumerate() {
			let Some(facts) = &e.facts else { continue };
			for (d, decl) in facts.decls.iter().enumerate() {
				if decl.heritage.is_empty() {
					continue;
				}
				let u = base[f] + d as u32;
				let mut open = false;
				let mut targets = Vec::new();
				for h in &decl.heritage {
					match h {
						Heritage::External => open = true,
						Heritage::Interface { spec, name } => {
							open |= linker.external_type(f as u32, *spec, name, &mut HashSet::new())
						}
						Heritage::Super(r) => {
							let t = match r {
								Ref::Local(t) => vec![base[f] + t],
								Ref::Import { binding, member } => {
									linker.resolve_binding(f as u32, *binding, member.as_deref(), 0)
								}
								_ => Vec::new(),
							};
							// A superclass that cannot be resolved is not analyzed.
							open |= t.is_empty();
							targets.extend(t);
						}
					}
				}
				if open {
					open_classes.push(u);
				} else if !targets.is_empty() {
					subclasses.push((u, targets));
				}
			}
		}
		// The edges of the surfaces of the modules that code references as a whole (see
		// `Linker::surface`). Linking one can reference new ones.
		while let Some((f, s)) = linker.new_surfaces.pop() {
			edges.extend(linker.all_nodes(f).map(|v| (s, v)));
			let Some(facts) = snap.entries[f as usize].facts.as_deref() else {
				continue;
			};
			for (name, target) in &facts.exports {
				if !matches!(target, ExportTarget::Local(_)) {
					let targets = linker.resolve_export(f, name, 0);
					edges.extend(targets.into_iter().map(|v| (s, v)));
				}
			}
			for &star in &facts.stars {
				match linker.spec_res(f, star) {
					Res::File(t) => {
						let target = linker.surface(t);
						edges.push((s, target));
					}
					Res::Pkg(p) => edges.push((s, p)),
					_ => {}
				}
			}
		}
		let total = linker.next as usize;
		let mut gate = vec![0u64; total];
		let mut uses: Vec<(u32, u64)> = Vec::new();
		for (f, e) in snap.entries.iter().enumerate() {
			if let Some(facts) = &e.facts {
				for (d, decl) in facts.decls.iter().enumerate() {
					let u = base[f] + d as u32;
					gate[u as usize] = decl.gate;
					uses.extend(decl.uses.iter().map(|&n| (u, n)));
				}
			}
		}
		let mut node_file = vec![u32::MAX; total];
		for f in 0..n {
			let end = if f + 1 < n { base[f + 1] } else { next };
			for v in base[f]..end {
				node_file[v as usize] = f as u32;
			}
		}
		// Code outside the analysis may call any method of a class that extends or implements it
		// (see `Heritage`): reaching such a class reaches all of its instance methods.
		let mut open = vec![false; total];
		for &u in &open_classes {
			open[u as usize] = true;
		}
		// A superclass that is not analyzed, such as a JavaScript file or a package class that a
		// module re-exports.
		let unanalyzed = |t: u32| {
			let file = node_file[t as usize];
			file == u32::MAX || snap.entries[file as usize].facts.is_none()
		};
		for (u, targets) in &subclasses {
			if targets.iter().any(|&t| unanalyzed(t)) {
				open[*u as usize] = true;
			}
		}
		// The code that calls the methods of a class also calls those of its subclasses.
		let mut changed = true;
		while changed {
			changed = false;
			for (u, targets) in &subclasses {
				if !open[*u as usize] && targets.iter().any(|&t| open[t as usize]) {
					open[*u as usize] = true;
					changed = true;
				}
			}
		}
		let mut ungated = 0;
		for (f, e) in snap.entries.iter().enumerate() {
			let Some(facts) = &e.facts else { continue };
			for (d, decl) in facts.decls.iter().enumerate() {
				if open[(base[f] + d as u32) as usize] {
					for &child in &decl.children {
						let g = &mut gate[(base[f] + child) as usize];
						ungated += usize::from(*g != 0);
						*g = 0;
					}
				}
			}
		}
		if std::env::var_os("RIPPLE_DEBUG").is_some() {
			let classes = open.iter().filter(|&&o| o).count();
			eprintln!(
				"{ungated} methods of {classes} classes that code outside the analysis may call"
			);
		}
		let packages = std::mem::take(&mut linker.packages);
		let globals = std::mem::take(&mut linker.globals);
		let signals = std::mem::take(&mut linker.signals);
		let unresolved = linker.unresolved;
		let surfaces = linker.surfaces.iter().map(|(&f, &s)| (s, f)).collect();
		let mut reads: HashMap<Box<str>, (Vec<u32>, Vec<u32>)> = HashMap::new();
		for (d, u, f) in read_refs {
			let entry = reads.entry(linker.reads[d as usize].clone()).or_default();
			entry.0.push(u);
			entry.1.push(f);
		}
		let mut data_dirs: HashMap<Box<str>, Vec<(Box<str>, Box<str>, u32, u32)>> = HashMap::new();
		for (d, u, f) in data_dir_refs {
			let (dir, start, end) = linker.data_dirs[d as usize].clone();
			data_dirs.entry(dir).or_default().push((start, end, u, f));
		}
		if std::env::var_os("RIPPLE_DEBUG").is_some() {
			let mut list: Vec<(&Box<str>, &(Vec<u32>, Vec<u32>))> = reads.iter().collect();
			list.sort_by_key(|(d, _)| (d.matches('/').count(), d.len()));
			for (d, (_, files)) in list.iter().take(40) {
				let names: Vec<&str> = files
					.iter()
					.take(3)
					.map(|&f| &*snap.entries[f as usize].path)
					.collect();
				eprintln!(
					"read by path: {d} <- {} refs, e.g. {}",
					files.len(),
					names.join(", ")
				);
			}
		}
		let swapped: Vec<(u32, u32)> = edges.iter().copied().collect();
		Self {
			reads,
			data_dirs,
			globals,
			signals,
			loads,
			load_order,
			effectful,
			implicit: IMPLICIT_METHODS
				.iter()
				.map(|m| name_id(m))
				.chain(config.implicit_methods.iter().map(|m| name_id(m)))
				.collect(),
			forward: Csr::group(total, &swapped),
			gate,
			uses: Csr::group(total, &uses),
			nodes: Csr::reverse(total, &edges),
			files_all: Csr::reverse(n, &files_all),
			files_runtime: Csr::reverse(n, &files_runtime),
			edges: edges.len(),
			file_nodes_end: next,
			base,
			node_file,
			packages,
			surfaces,
			cases: case_targets,
			unresolved,
		}
	}

	pub fn node_count(&self) -> usize {
		self.node_file.len()
	}

	/// The nodes of a snapshot entry.
	pub fn file_nodes(&self, f: usize) -> Range<u32> {
		let end = self.base.get(f + 1).copied().unwrap_or(self.file_nodes_end);
		self.base[f]..end
	}

	/// Entries with at least one node that (transitively) depends on a seed node, ignoring name
	/// gates, and whether any path went through a gated node.
	pub fn dependent_files(&self, seeds: impl IntoIterator<Item = u32>) -> (Vec<bool>, bool) {
		let seen = self.nodes.reach(seeds);
		let mut files = vec![false; self.base.len()];
		let mut gated = false;
		for (v, s) in seen.iter().enumerate() {
			if *s {
				gated |= self.gate[v] != 0;
				let f = self.node_file[v];
				if f != u32::MAX {
					files[f as usize] = true;
				}
			}
		}
		(files, gated)
	}

	/// What evaluating a module runs that can have effects outside the modules, in order: the
	/// modules with global load-time effects (and style sheets) and the npm packages that it loads,
	/// transitively, each as (is a package, path or specifier). A module evaluates the modules it
	/// loads depth-first in source order, each once, and then itself.
	pub fn effect_sequence<'a>(&'a self, snap: &'a Snapshot, f: u32) -> Vec<(bool, &'a str)> {
		let mut seen = vec![false; self.base.len()];
		let mut packages: HashSet<&str> = HashSet::new();
		let mut out = Vec::new();
		// Modules being evaluated, with the position of the next load of each.
		let mut stack: Vec<(u32, usize)> = vec![(f, 0)];
		seen[f as usize] = true;
		while let Some(&(m, i)) = stack.last() {
			let order = &self.load_order[m as usize];
			if i == order.len() {
				stack.pop();
				let e = &snap.entries[m as usize];
				let effects = e
					.facts
					.as_ref()
					.map_or(e.path.ends_with(".css"), |facts| facts.global_effects);
				if effects {
					out.push((false, &*e.path));
				}
				continue;
			}
			stack.last_mut().unwrap().1 += 1;
			match &order[i] {
				Load::File(t) => {
					if !seen[*t as usize] {
						seen[*t as usize] = true;
						stack.push((*t, 0));
					}
				}
				Load::Package(spec) => {
					if packages.insert(spec) {
						out.push((true, spec));
					}
				}
			}
		}
		out
	}

	/// Whether the code of an entry can reach a target node, opening an instance method only once
	/// the closure uses its name. Reaching a class does not reach its methods by itself.
	pub fn reaches(&self, file: u32, targets: &[bool], scratch: &mut Scratch) -> bool {
		let roots: Vec<u32> = self.file_nodes(file as usize).collect();
		self.reaches_from(&roots, &[], targets, scratch)
	}

	/// Whether code that starts at `roots` and also uses the method names `names` (as name ids)
	/// can reach a target node, opening an instance method only once the closure uses its name.
	pub fn reaches_from(
		&self,
		roots: &[u32],
		names: &[u64],
		targets: &[bool],
		scratch: &mut Scratch,
	) -> bool {
		self.search::<false>(roots, names, targets, scratch, &mut Trace::default())
			.is_some()
	}

	/// How code that starts at `roots` reaches a target node (see `reaches_from`), if it does: a
	/// path from a root to the target, each node with, for an instance method, the node whose use
	/// of the method's name opened it (none for names that `names` or `IMPLICIT_METHODS` give). The
	/// search is breadth first, so the path is short.
	pub fn path_from(
		&self,
		roots: &[u32],
		names: &[u64],
		targets: &[bool],
	) -> Option<Vec<(u32, Option<u32>)>> {
		let mut trace = Trace::default();
		let target =
			self.search::<true>(roots, names, targets, &mut Scratch::default(), &mut trace)?;
		let mut path = Vec::new();
		let mut v = Some(target);
		while let Some(n) = v {
			let gate = self.gate[n as usize];
			let opener = (gate != 0)
				.then(|| trace.named_by.get(&gate).copied())
				.flatten();
			path.push((n, opener));
			v = trace.from.get(&n).copied();
		}
		path.reverse();
		Some(path)
	}

	/// The search of `reaches_from`, which returns the target node it reaches. It searches depth
	/// first, or with `TRACE`, breadth first while recording into `trace` how it reaches nodes.
	fn search<const TRACE: bool>(
		&self,
		roots: &[u32],
		names: &[u64],
		targets: &[bool],
		scratch: &mut Scratch,
		trace: &mut Trace,
	) -> Option<u32> {
		scratch.stamp += 1;
		if scratch.visited.len() < self.node_file.len() {
			scratch.visited.resize(self.node_file.len(), 0);
		}
		let stamp = scratch.stamp;
		scratch.used.clear();
		scratch.used.extend(self.implicit.iter().copied());
		scratch.used.extend(names.iter().copied());
		scratch.pending.clear();
		// A stack, or a queue from `next` on when searching breadth first.
		let mut queue: Vec<u32> = roots.to_vec();
		let mut next = 0;
		for &n in &queue {
			scratch.visited[n as usize] = stamp;
		}
		while let Some(n) = if TRACE {
			next += 1;
			queue.get(next - 1).copied()
		} else {
			queue.pop()
		} {
			if targets[n as usize] {
				return Some(n);
			}
			for &name in self.uses.of(n) {
				if scratch.used.insert(name) {
					if TRACE {
						trace.named_by.insert(name, n);
					}
					if let Some(waiting) = scratch.pending.remove(&name) {
						for v in waiting {
							if scratch.visited[v as usize] != stamp {
								scratch.visited[v as usize] = stamp;
								queue.push(v);
							}
						}
					}
				}
			}
			for &v in self.forward.of(n) {
				if scratch.visited[v as usize] == stamp {
					continue;
				}
				if TRACE {
					trace.from.entry(v).or_insert(n);
				}
				let g = self.gate[v as usize];
				if g != 0 && !scratch.used.contains(&g) {
					scratch.pending.entry(g).or_default().push(v);
					continue;
				}
				scratch.visited[v as usize] = stamp;
				queue.push(v);
			}
		}
		None
	}

	/// A readable name of a node: the path and key of a declaration, the path of a file that is
	/// not analyzed or of a module that code references as a whole, a package or a global.
	pub fn label(&self, snap: &Snapshot, v: u32) -> String {
		let named = |nodes: &HashMap<String, u32>| {
			nodes
				.iter()
				.find(|&(_, &n)| n == v)
				.map(|(name, _)| name.clone())
		};
		let f = self.node_file[v as usize];
		if let Some(entry) = snap.entries.get(f as usize) {
			return match &entry.facts {
				Some(facts) => format!(
					"{} :: {}",
					entry.path,
					facts.decls[(v - self.base[f as usize]) as usize].key
				),
				None => entry.path.to_string(),
			};
		}
		if let Some(&m) = self.surfaces.get(&v) {
			format!("{} (whole module)", snap.entries[m as usize].path)
		} else if let Some(name) = named(&self.packages) {
			format!("package {name}")
		} else if let Some(name) = named(&self.globals) {
			format!("global {name}")
		} else if let Some(name) = named(&self.signals) {
			format!("signal {name}")
		} else {
			format!("node {v}")
		}
	}

	/// The platform signal name of a node (see `Signals`): `path#key` for a declaration, the path
	/// of a file that is not analyzed or of a module that code references as a whole,
	/// `npm:<package>`, or the name of a signal such as `node:fs#realpath`.
	pub fn signal_name(&self, snap: &Snapshot, v: u32) -> String {
		let named = |nodes: &HashMap<String, u32>| {
			nodes
				.iter()
				.find(|&(_, &n)| n == v)
				.map(|(name, _)| name.clone())
		};
		let f = self.node_file[v as usize];
		if let Some(entry) = snap.entries.get(f as usize) {
			return match &entry.facts {
				Some(facts) => format!(
					"{}#{}",
					entry.path,
					facts.decls[(v - self.base[f as usize]) as usize].key
				),
				None => entry.path.to_string(),
			};
		}
		if let Some(&m) = self.surfaces.get(&v) {
			snap.entries[m as usize].path.to_string()
		} else if let Some(name) = named(&self.packages) {
			format!("npm:{name}")
		} else if let Some(name) = named(&self.globals) {
			format!("globalThis.{name}")
		} else if let Some(name) = named(&self.signals) {
			name
		} else {
			format!("node {v}")
		}
	}

	/// The nodes that platform signals name: the signal nodes, the npm packages, and the
	/// declarations of modules, or all the nodes of a module that a signal names as a whole.
	pub fn signal_marks(&self, snap: &Snapshot, signals: &Signals) -> Vec<bool> {
		let mut marks = vec![false; self.node_count()];
		if signals.is_empty() {
			return marks;
		}
		for (name, &v) in &self.signals {
			marks[v as usize] |= signals.matching(name).is_some();
		}
		for (name, &v) in &self.packages {
			marks[v as usize] |= signals.matching(&format!("npm:{name}")).is_some();
		}
		let surface_of: HashMap<u32, u32> = self.surfaces.iter().map(|(&s, &f)| (f, s)).collect();
		for (f, e) in snap.entries.iter().enumerate() {
			if signals.naming(&e.path).is_none() {
				continue;
			}
			let whole = signals.matching(&e.path).is_some();
			match &e.facts {
				Some(facts) => {
					for (d, decl) in facts.decls.iter().enumerate() {
						if whole
							|| signals
								.matching(&format!("{}#{}", e.path, decl.key))
								.is_some()
						{
							marks[self.base[f] as usize + d] = true;
						}
					}
				}
				None => marks[self.base[f] as usize] |= whole,
			}
			if let (true, Some(&s)) = (whole, surface_of.get(&(f as u32))) {
				marks[s as usize] = true;
			}
		}
		marks
	}

	/// Whether a node is the initializer of its module (or stands for a file that is not
	/// analyzed).
	fn is_init(&self, v: u32) -> bool {
		let f = self.node_file[v as usize];
		f != u32::MAX && self.base[f as usize] == v
	}

	/// A path of at most `depth` edges from test case `case` of entry `f` to a marked node (see
	/// `signal_path`), if there is one. A test case is not a node: the path starts at what it
	/// references.
	pub fn case_signal_path(
		&self,
		f: u32,
		case: usize,
		marks: &[bool],
		depth: u32,
	) -> Option<Vec<u32>> {
		let targets = self.cases.get(&f)?.get(case)?;
		if depth == 0 {
			return None;
		}
		if let Some(&t) = targets.iter().find(|&&t| marks[t as usize]) {
			return Some(vec![t]);
		}
		targets
			.iter()
			.find_map(|&t| self.signal_path(t, marks, depth - 1))
	}

	/// A path of at most `depth` edges from `start` to a marked node (see `signal_marks`), if
	/// there is one: `[start]` when `start` is marked itself. Loading a module is not using it, so
	/// the path does not go from a module initializer to another module's.
	pub fn signal_path(&self, start: u32, marks: &[bool], depth: u32) -> Option<Vec<u32>> {
		if marks[start as usize] {
			return Some(vec![start]);
		}
		let mut from: HashMap<u32, u32> = HashMap::new();
		let mut frontier = vec![start];
		for _ in 0..depth {
			let mut next = Vec::new();
			for &n in &frontier {
				let init = self.is_init(n);
				for &v in self.forward.of(n) {
					if v == start
						|| from.contains_key(&v)
						|| (init
							&& self.is_init(v) && self.node_file[v as usize]
							!= self.node_file[n as usize])
					{
						continue;
					}
					from.insert(v, n);
					if marks[v as usize] {
						let mut path = vec![v];
						let mut cur = v;
						while let Some(&p) = from.get(&cur) {
							path.push(p);
							cur = p;
						}
						path.reverse();
						return Some(path);
					}
					next.push(v);
				}
			}
			frontier = next;
		}
		None
	}

	/// Nodes and files that read `path` or a directory containing it, including, for a data file
	/// (not a module), the directories that computed paths read.
	pub fn readers(&self, path: &str, data: bool) -> (Vec<u32>, Vec<u32>) {
		let (mut nodes, mut files) = match self.reads.get(path) {
			Some((n, f)) => (n.clone(), f.clone()),
			None => (Vec::new(), Vec::new()),
		};
		for (i, _) in path.match_indices('/') {
			let dir = &path[..i];
			if let Some((n, f)) = self.reads.get(dir) {
				nodes.extend_from_slice(n);
				files.extend_from_slice(f);
			}
			let computed = self
				.data_dirs
				.get(dir)
				.filter(|_| data)
				.into_iter()
				.flatten();
			for (start, end, n, f) in computed {
				if matches_data_pattern(start, end, &path[i + 1..]) {
					nodes.push(*n);
					files.push(*f);
				}
			}
		}
		(nodes, files)
	}

	/// Entries that (transitively) import a seed entry. `runtime` ignores type-only imports.
	pub fn importing_files(
		&self,
		seeds: impl IntoIterator<Item = u32>,
		runtime: bool,
	) -> Vec<bool> {
		if runtime {
			self.files_runtime.reach(seeds)
		} else {
			self.files_all.reach(seeds)
		}
	}
}
