/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Unit tests that read a registry entry that nothing they load registers (`ripple
//! registrations`). A test run loads every test file before running any, so such a test passes
//! when another test file loads the module that registers the entry, and fails when it runs
//! alone or with a selection of test files that does not include that one.
//!
//! The registries are those of `registries` in the configuration. A read of an entry by a key
//! that is a string or names a value (`CommandsRegistry.getCommand(SOME_ID)`) needs a registration
//! with the same key (`CommandsRegistry.registerCommand(SOME_ID, ...)`, or
//! `registerAction2(SomeAction)` whose constructor passes `{ id: SOME_ID }` to `super`) in code
//! that the test can reach (see `Graph::reaches`): code that runs when a module it loads is
//! evaluated, or that the test itself calls. Reads of keys that nothing registers, or whose key the
//! analysis cannot resolve, are not checked, and a reachable registration whose key the analysis
//! cannot resolve counts as registering any key.

use anyhow::{Context, Result, bail};

use crate::analyze::ExportTarget;
use crate::config::{Config, Registration, Role};
use crate::graph::{Graph, Key, RegistryCall, Scratch, Snapshot};

/// A test that reads a registry entry that nothing it loads registers.
#[derive(Debug, PartialEq, Eq)]
pub struct Finding {
	pub test: String,
	pub line: u32,
	/// The registry's name in the configuration.
	pub registry: String,
	/// The key, as a string or the declaration it names.
	pub key: String,
	/// The declarations that register the entry.
	pub registered_by: Vec<String>,
	/// The modules that register the entry when they load, which the test could import.
	pub loaded_by: Vec<String>,
}

impl Finding {
	/// What identifies a finding across commits, unlike its line.
	pub fn id(&self) -> (&str, &str, &str) {
		(&self.test, &self.registry, &self.key)
	}
}

/// What `<module>#<name>` or `<module>#<name>.<member>` names: a declaration that the module
/// declares and exports, or a member of it.
fn resolve(snap: &Snapshot, graph: &Graph, registry: &str, path: &str) -> Result<Key> {
	let (module, name) = path
		.split_once('#')
		.with_context(|| format!("registry '{registry}': '{path}' is not <module>#<name>"))?;
	let f = snap
		.find(module)
		.with_context(|| format!("registry '{registry}': no module {module}"))?;
	let facts = snap.entries[f as usize]
		.facts
		.as_deref()
		.with_context(|| format!("registry '{registry}': {module} is not analyzed"))?;
	let (export, member) = match name.split_once('.') {
		Some((export, member)) => (export, Some(member)),
		None => (name, None),
	};
	let Some(d) = facts
		.exports_named(export)
		.iter()
		.find_map(|(_, target)| match target {
			ExportTarget::Local(d) => Some(*d),
			_ => None,
		})
	else {
		bail!("registry '{registry}': {module} does not declare and export {export}");
	};
	let d = match member {
		Some(m) => {
			let members = &facts.decls[d as usize].members;
			match members.binary_search_by(|(n, _)| (**n).cmp(m)) {
				Ok(i) => members[i].1,
				Err(_) => bail!("registry '{registry}': {export} has no member {m}"),
			}
		}
		None => d,
	};
	Ok(Key::Nodes {
		nodes: vec![graph.file_nodes(f as usize).start + d],
		member: member.map(Into::into),
	})
}

/// The calls of a registration: what they are called on and the method, or none for a function.
fn registration_target(
	snap: &Snapshot,
	graph: &Graph,
	registry: &str,
	id: &Key,
	registration: &Registration,
) -> Result<(Key, Option<Box<str>>)> {
	match (&registration.method, &registration.call) {
		(Some(method), _) => Ok((id.clone(), Some(method.as_str().into()))),
		(None, Some(call)) => {
			let (module, path) = call.split_once('#').unwrap_or((call, ""));
			match path.rsplit_once('.') {
				Some((object, method)) => Ok((
					resolve(snap, graph, registry, &format!("{module}#{object}"))?,
					Some(method.into()),
				)),
				None => Ok((resolve(snap, graph, registry, call)?, None)),
			}
		}
		(None, None) => bail!("registry '{registry}': a registration needs a method or a call"),
	}
}

/// What a registration call registers.
enum Registered {
	/// Keys, with the refinement of them (see `Registration::refine`) when the call has one.
	Keys(Vec<Key>, Option<Key>),
	/// Entries whose keys the analysis cannot tell, which may be any key.
	Unknown,
	/// No entry: the call has none of the keys and the registration does not require one.
	Nothing,
}

/// `fixed` is the resolved `registers` key of the registration.
fn registered(call: &RegistryCall, registration: &Registration, fixed: Option<&Key>) -> Registered {
	let keys = if registration.class {
		match &call.constructed {
			Some(keys) => keys,
			None => return Registered::Unknown,
		}
	} else {
		&call.keys
	};
	let mut found = Vec::new();
	for (path, key) in keys {
		if !registration.keys.iter().any(|p| **p == **path) {
			continue;
		}
		match (key, fixed) {
			(Some(Key::Literal(flag)), Some(fixed)) if &**flag == "true" => {
				found.push(fixed.clone())
			}
			(Some(k), None) if !matches!(k, Key::Nodes { nodes, .. } if nodes.is_empty()) => {
				found.push(k.clone())
			}
			_ => return Registered::Unknown,
		}
	}
	let refine = registration.refine.as_deref().and_then(|refine| {
		keys.iter().find_map(|(path, key)| match key {
			Some(k)
				if **path == *refine
					&& !matches!(k, Key::Nodes { nodes, .. } if nodes.is_empty()) =>
			{
				Some(k.clone())
			}
			_ => None,
		})
	});
	match (found.is_empty(), registration.required) {
		(false, _) => Registered::Keys(found, refine),
		(true, true) => Registered::Unknown,
		(true, false) => Registered::Nothing,
	}
}

fn describe(snap: &Snapshot, graph: &Graph, key: &Key) -> String {
	match key {
		Key::Literal(s) => format!("'{s}'"),
		Key::Nodes { nodes, .. } => nodes
			.first()
			.map_or_else(|| "<unresolved>".to_owned(), |&v| graph.label(snap, v)),
	}
}

/// The registrations of a registry: by key, and the calls that may register any key.
struct Registrations {
	/// Registered keys, with their refinement if known, by the node that registers them.
	known: Vec<(Key, Option<Key>, u32)>,
	unknown: Vec<u32>,
}

/// What a check covered.
#[derive(Debug, Default)]
pub struct Summary {
	/// Reads checked: of keys that some code registers.
	pub checked: usize,
	/// Reads of keys that nothing registers, or that the analysis cannot resolve.
	pub unchecked: usize,
	/// Test files with checked reads.
	pub tests: usize,
}

/// The unit tests that read an entry of a configured registry that nothing they load registers.
pub fn check(snap: &Snapshot, graph: &Graph, config: &Config) -> Result<(Vec<Finding>, Summary)> {
	let Some(registries) = &config.registries else {
		bail!("the configuration has no registries to check");
	};
	// The reads in unit test files, as (test file, registry, call, key, refinement).
	let mut reads: Vec<(u32, usize, &RegistryCall, &Key, Option<&Key>)> = Vec::new();
	let mut all: Vec<(&str, Registrations)> = Vec::new();
	for (name, registry) in &registries.keyed {
		let id = resolve(snap, graph, name, &registry.registry)?;
		let targets = registry
			.register
			.iter()
			.map(|r| {
				let fixed = r
					.registers
					.as_deref()
					.map(|k| resolve(snap, graph, name, k))
					.transpose()?;
				Ok((registration_target(snap, graph, name, &id, r)?, r, fixed))
			})
			.collect::<Result<Vec<_>>>()?;
		let mut registrations = Registrations {
			known: Vec::new(),
			unknown: Vec::new(),
		};
		// The registration functions register what their callers pass, and the calls of them are
		// what registers the entries. So do the other helpers of the modules that declare them or
		// the registry, such as the methods that `registerEditorCommand` calls (see `forwarded`).
		let receivers: Vec<u32> = std::iter::once(&id)
			.chain(targets.iter().map(|((receiver, _), ..)| receiver))
			.flat_map(|receiver| match receiver {
				Key::Nodes { nodes, .. } => nodes.clone(),
				Key::Literal(_) => Vec::new(),
			})
			.collect();
		let helpers: Vec<u32> = targets
			.iter()
			.filter(|((_, method), ..)| method.is_none())
			.flat_map(|((receiver, _), ..)| match receiver {
				Key::Nodes { nodes, .. } => nodes.clone(),
				Key::Literal(_) => Vec::new(),
			})
			.collect();
		let infrastructure: Vec<u32> = receivers
			.iter()
			.map(|&v| graph.node_file[v as usize])
			.collect();
		for call in &graph.registry_calls {
			if helpers.contains(&call.node) {
				continue;
			}
			for ((receiver, method), registration, fixed) in &targets {
				if call.method != *method || !call.receiver.matches(receiver) {
					continue;
				}
				match registered(call, registration, fixed.as_ref()) {
					Registered::Keys(keys, refine) => registrations
						.known
						.extend(keys.into_iter().map(|k| (k, refine.clone(), call.node))),
					// A registration helper of the infrastructure, whose caller passes the key.
					Registered::Unknown
						if call.forwarded && infrastructure.contains(&call.file) => {}
					Registered::Unknown => {
						if std::env::var_os("RIPPLE_DEBUG").is_some() {
							eprintln!(
								"unknown: {}:{} registers {name} entries that the analysis cannot resolve",
								snap.entries[call.file as usize].path, call.line
							);
						}
						registrations.unknown.push(call.node)
					}
					Registered::Nothing => {}
				}
			}
			let is_read = call
				.method
				.as_deref()
				.is_some_and(|m| registry.read.iter().any(|r| r == m));
			if is_read
				&& !call.ignored
				&& !call.absent
				&& snap.entries[call.file as usize].role == Role::UnitTest
				&& call.receiver.matches(&id)
			{
				if let Some((_, Some(key))) = call.keys.iter().find(|(path, _)| path.is_empty()) {
					let refine = registry.read_filter.as_deref().and_then(|filter| {
						call.filters
							.iter()
							.find(|(path, _)| **path == *filter)
							.map(|(_, k)| k)
					});
					reads.push((call.file, all.len(), call, key, refine));
				}
			}
		}
		all.push((name, registrations));
	}
	reads.sort_by_key(|&(file, ..)| file);

	let mut findings = Vec::new();
	let mut summary = Summary::default();
	let mut scratch = Scratch::default();
	let mut visited_file = None;
	for (file, r, read, key, refine) in reads {
		let (name, registrations) = &all[r];
		// With a refinement, the registrations of exactly that refinement, and the others of the
		// key, whose refinement is not known, may register it too.
		// Registrations in other test files are scoped to their tests: another test file cannot
		// depend on them.
		let elsewhere = |node: u32| {
			let f = graph.node_file[node as usize];
			f != file && snap.entries[f as usize].role.is_test()
		};
		let registering: Vec<u32> = registrations
			.known
			.iter()
			.filter(|(k, f, node)| {
				!elsewhere(*node)
					&& k.matches(key)
					&& match (refine, f) {
						(Some(refine), Some(f)) => f.matches(refine),
						(Some(_), None) => false,
						(None, _) => true,
					}
			})
			.map(|&(.., node)| node)
			.collect();
		let unrefined: Vec<u32> = match refine {
			Some(_) => registrations
				.known
				.iter()
				.filter(|(k, f, _)| f.is_none() && k.matches(key))
				.map(|&(.., node)| node)
				.collect(),
			None => Vec::new(),
		};
		// A key that nothing registers is not checked: the test may expect it to be missing.
		if registering.is_empty() {
			summary.unchecked += 1;
			if std::env::var_os("RIPPLE_DEBUG").is_some() {
				eprintln!(
					"unchecked: {}:{} reads the {name} entry {}, which nothing registers",
					snap.entries[file as usize].path,
					read.line,
					describe(snap, graph, key)
				);
			}
			continue;
		}
		summary.checked += 1;
		if visited_file != Some(file) {
			graph.visit(file, &mut scratch);
			visited_file = Some(file);
			summary.tests += 1;
		}
		// A registration whose key the analysis cannot resolve may register this key too, unless
		// keys are registered once and this one is registered where the analysis can tell.
		let unique = registries.keyed[*name].unique || refine.is_some();
		let others: &[u32] = if unique { &[] } else { &registrations.unknown };
		if let Some(&v) = registering
			.iter()
			.chain(if unique { &[][..] } else { &unrefined[..] })
			.chain(others)
			.find(|&&v| graph.visited(&scratch, v))
		{
			if std::env::var_os("RIPPLE_DEBUG").is_some() {
				eprintln!(
					"satisfied: {}:{} reads the {name} entry {}, which {} registers{}",
					snap.entries[file as usize].path,
					read.line,
					describe(snap, graph, key),
					graph.label(snap, v),
					if registering.contains(&v) {
						""
					} else {
						" (an unresolved key)"
					}
				);
			}
			continue;
		}
		let mut registered_by: Vec<String> =
			registering.iter().map(|&v| graph.label(snap, v)).collect();
		registered_by.sort();
		registered_by.dedup();
		let loaded_by = graph
			.nearest_initializers(&registering)
			.into_iter()
			.map(|f| &snap.entries[f as usize])
			.filter(|e| !e.role.is_test())
			.map(|e| e.path.to_string())
			.collect();
		findings.push(Finding {
			test: snap.entries[file as usize].path.to_string(),
			line: read.line,
			registry: name.to_string(),
			key: match refine {
				Some(refine) => format!(
					"{} for {}",
					describe(snap, graph, key),
					describe(snap, graph, refine)
				),
				None => describe(snap, graph, key),
			},
			registered_by,
			loaded_by,
		});
	}
	findings.sort_by(|a, b| (&a.test, a.line).cmp(&(&b.test, b.line)));
	findings.dedup_by(|a, b| a.id() == b.id());
	Ok((findings, summary))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::analyze::analyze;
	use crate::config::for_tests;
	use crate::graph::Entry;
	use std::sync::Arc;

	/// The registries of `config::for_tests`.
	const BASE: &[(&str, &str)] = &[
		(
			"src/registry.ts",
			"export const Registry = { as(id: string) { return {}; } };\n\
			export const Extensions = { Views: 'views' };",
		),
		(
			"src/commands.ts",
			"export const Commands = { registerCommand(id: any, handler?: any) {}, getCommand(id: string) {} };",
		),
		(
			"src/actions.ts",
			"export class MenuId { static readonly CommandPalette = new MenuId(); static readonly Title = new MenuId(); }\n\
			export const Menus = { appendMenuItem(menu: any, item: any) {}, getMenuItems(menu: any) { return []; } };\n\
			export class Action { constructor(desc: any) {} }\n\
			export function registerAction(ctor: any) {}",
		),
	];

	fn findings(files: &[(&str, &str)]) -> Vec<Finding> {
		let config = for_tests();
		let mut entries: Vec<Entry> = BASE
			.iter()
			.chain(files)
			.map(|(path, source)| Entry {
				path: (*path).into(),
				oid: Arc::from(*path),
				role: config.role(path),
				facts: Some(Arc::new(analyze(path, source, config))),
			})
			.collect();
		entries.sort_by(|a, b| a.path.cmp(&b.path));
		let snap = Snapshot { entries };
		let graph = Graph::build(&snap, config);
		check(&snap, &graph, config).unwrap().0
	}

	/// The findings as (test, line, key, modules that register the entry when they load).
	fn summary(found: &[Finding]) -> Vec<(&str, u32, &str, Vec<&str>)> {
		found
			.iter()
			.map(|f| {
				(
					f.test.as_str(),
					f.line,
					f.key.as_str(),
					f.loaded_by.iter().map(String::as_str).collect(),
				)
			})
			.collect()
	}

	/// A module that declares a view's id and a function that registers it, and a module that
	/// calls the function when it loads.
	const VIEW: &str = "import { Registry, Extensions } from './registry.js';\n\
		export const VIEW_ID = 'my.view';\n\
		export function registerView() { return Registry.as(Extensions.Views).register({ id: VIEW_ID }); }";
	const CONTRIBUTION: &str = "import { registerView } from './view.js';\nregisterView();";

	#[test]
	fn reading_an_entry_that_only_another_test_file_registers_is_a_finding() {
		let test = "import { Registry, Extensions } from '../registry.js';\n\
			import { VIEW_ID } from '../view.js';\n\
			test('view', () => { Registry.as(Extensions.Views).get(VIEW_ID); });";
		let other = "import '../contribution.js';\ntest('other', () => {});";
		let found = findings(&[
			("src/view.ts", VIEW),
			("src/contribution.ts", CONTRIBUTION),
			("src/test/view.test.ts", test),
			("src/test/other.test.ts", other),
		]);
		assert_eq!(
			found,
			vec![Finding {
				test: "src/test/view.test.ts".into(),
				line: 3,
				registry: "view".into(),
				key: "'my.view'".into(),
				registered_by: vec!["src/view.ts :: registerView".into()],
				loaded_by: vec!["src/contribution.ts".into()],
			}]
		);
	}

	#[test]
	fn entries_that_the_test_registers_or_loads_are_not_findings() {
		let registers = "import { Registry, Extensions } from '../registry.js';\n\
			import { VIEW_ID, registerView } from '../view.js';\n\
			test('view', () => { registerView(); const r = Registry.as(Extensions.Views); r.get(VIEW_ID); });";
		let loads = "import { Registry, Extensions } from '../registry.js';\n\
			import { VIEW_ID } from '../view.js';\n\
			import '../contribution.js';\n\
			test('view', () => { Registry.as(Extensions.Views).get(VIEW_ID); });";
		// A key that nothing registers is not checked: the test may expect it to be missing.
		let unknown = "import { Registry, Extensions } from '../registry.js';\n\
			test('view', () => { Registry.as(Extensions.Views).get('other.view'); });";
		// A registration whose key the analysis cannot resolve may register the key that the test
		// reads, which `contribution.ts` also registers.
		let dynamic = "import { Registry, Extensions } from '../registry.js';\n\
			import { VIEW_ID } from '../view.js';\n\
			test('view', () => { const view = { id: VIEW_ID }; Registry.as(Extensions.Views).register({ id: view.id }); Registry.as(Extensions.Views).get(VIEW_ID); });";
		let found = findings(&[
			("src/view.ts", VIEW),
			("src/contribution.ts", CONTRIBUTION),
			("src/test/registers.test.ts", registers),
			("src/test/loads.test.ts", loads),
			("src/test/unknown.test.ts", unknown),
			("src/test/dynamic.test.ts", dynamic),
		]);
		assert_eq!(found, vec![]);
	}

	#[test]
	fn keys_are_matched_by_declaration_and_member_through_re_exports() {
		let ids = "export const Ids = { A: {}, B: {} };";
		let reexport = "export { Ids } from './ids.js';";
		let register = "import { Registry, Extensions } from './registry.js';\n\
			import { Ids } from './ids.js';\n\
			Registry.as(Extensions.Views).register({ id: Ids.A });";
		// Registers `Ids.A` when it loads, but the test reads `Ids.B`, which only `other.ts` registers.
		let test = "import { Registry, Extensions } from '../registry.js';\n\
			import { Ids } from '../reexport.js';\n\
			import '../register.js';\n\
			test('a', () => { Registry.as(Extensions.Views).get(Ids.A); });\n\
			test('b', () => { Registry.as(Extensions.Views).get(Ids.B); });";
		let other = "import { Registry, Extensions } from './registry.js';\n\
			import { Ids } from './ids.js';\n\
			Registry.as(Extensions.Views).register({ id: Ids.B });";
		let found = findings(&[
			("src/ids.ts", ids),
			("src/reexport.ts", reexport),
			("src/register.ts", register),
			("src/other.ts", other),
			("src/test/ids.test.ts", test),
		]);
		assert_eq!(
			summary(&found),
			vec![(
				"src/test/ids.test.ts",
				5,
				"src/ids.ts :: Ids.B",
				vec!["src/other.ts"]
			)]
		);
	}

	/// An action whose id is a static member, and a module that registers it with its menus and
	/// another action per element of a loop when it loads.
	const FEATURE: &str = "import { Action, MenuId } from './actions.js';\n\
		export class OpenAction extends Action {\n\
			static readonly ID = 'feature.open';\n\
			constructor() { super({ id: OpenAction.ID, f1: true }); }\n\
		}";
	const FEATURE_CONTRIBUTION: &str = "import { Action, MenuId, registerAction } from './actions.js';\n\
		import { OpenAction } from './feature.js';\n\
		registerAction(class extends OpenAction {});\n\
		for (const [name, menu] of [['a', MenuId.Title], ['b', MenuId.Title]] as const) {\n\
			registerAction(class extends Action { constructor() { super({ id: `feature.${name}`, menu: [menu].map(id => ({ id })) }); } });\n\
		}";

	#[test]
	fn actions_register_their_commands_and_menu_items() {
		let test = "import { Commands } from '../commands.js';\n\
			import { Menus, MenuId } from '../actions.js';\n\
			import { OpenAction } from '../feature.js';\n\
			test('open', () => { Commands.getCommand(OpenAction.ID); });\n\
			test('palette', () => { Menus.getMenuItems(MenuId.CommandPalette).filter(item => item.command.id === 'feature.open'); });\n\
			test('loop', () => { Commands.getCommand('feature.b'); Menus.getMenuItems(MenuId.Title).find(item => item.command.id === 'feature.a'); });";
		let found = findings(&[
			("src/feature.ts", FEATURE),
			("src/feature.contribution.ts", FEATURE_CONTRIBUTION),
			("src/test/feature.test.ts", test),
		]);
		let contribution = vec!["src/feature.contribution.ts"];
		assert_eq!(
			summary(&found),
			vec![
				(
					"src/test/feature.test.ts",
					4,
					"'feature.open'",
					contribution.clone()
				),
				(
					"src/test/feature.test.ts",
					5,
					"src/actions.ts :: MenuId.CommandPalette for 'feature.open'",
					contribution.clone()
				),
				(
					"src/test/feature.test.ts",
					6,
					"'feature.b'",
					contribution.clone()
				),
				(
					"src/test/feature.test.ts",
					6,
					"src/actions.ts :: MenuId.Title for 'feature.a'",
					contribution
				),
			]
		);
	}

	#[test]
	fn reads_that_do_not_depend_on_the_entry_are_not_findings() {
		// Checks that entries are missing, by an assertion or by filtering for a command that no
		// code adds to the menu, or opts out with a comment.
		let missing = "import { Commands } from '../commands.js';\n\
			import { Menus, MenuId } from '../actions.js';\n\
			test('missing', () => {\n\
				assert.strictEqual(Commands.getCommand('feature.open'), undefined);\n\
				Menus.getMenuItems(MenuId.Title).filter(item => item.command.id === 'feature.open');\n\
				// ripple-ignore-registration: compares the palette before and after\n\
				Menus.getMenuItems(MenuId.CommandPalette).filter(item => item.command.id === 'feature.open');\n\
			});";
		// A throwaway id that another test file registers in its test.
		let throwaway = "import { Commands } from '../commands.js';\n\
			test('foo', () => { Commands.getCommand('foo'); });";
		let other = "import { Commands } from '../commands.js';\n\
			test('foo', () => { Commands.registerCommand('foo'); });";
		let found = findings(&[
			("src/feature.ts", FEATURE),
			("src/feature.contribution.ts", FEATURE_CONTRIBUTION),
			("src/test/missing.test.ts", missing),
			("src/test/throwaway.test.ts", throwaway),
			("src/test/other.test.ts", other),
		]);
		assert_eq!(summary(&found), vec![]);
	}
}
