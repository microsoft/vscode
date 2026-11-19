/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';

export const RustCratesToLookFor = [
	'actix-web',
	'anyhow',
	'async-openai',
	'async-std',
	'axum',
	'bevy',
	'bindgen',
	'burn',
	'candle-core',
	'clap',
	'diesel',
	'egui',
	'hyper',
	'openssl',
	'ort',
	'pyo3',
	'qdrant-client',
	'rayon',
	'reqwest',
	'rig-core',
	'rocket',
	'rustls',
	'sea-orm',
	'serde',
	'serde_json',
	'smol',
	'sqlx',
	'tauri',
	'thiserror',
	'tokio',
	'tonic',
	'tracing',
	'warp',
	'wasm-bindgen',
	'winit',
	'azure_core',
	'azure_core_amqp',
	'azure_core_opentelemetry',
	'azure_data_cosmos',
	'azure_identity',
	'azure_messaging_eventhubs',
	'azure_messaging_eventhubs_checkpointstore_blob',
	'azure_messaging_servicebus',
	'azure_security_keyvault_certificates',
	'azure_security_keyvault_keys',
	'azure_security_keyvault_secrets',
	'azure_storage_blob',
	'azure_storage_common',
	'azure_storage_queue',
	'azure_storage_sas'
];

interface CargoDependency {
	packageName?: string;
	workspace?: boolean;
}

export function getCargoDependencyNames(contents: string, inheritedWorkspaceDependencies?: ReadonlyMap<string, string>): string[] {
	return getCargoDependencyNamesFromManifest(contents, inheritedWorkspaceDependencies);
}

export function getCargoWorkspaceDependencies(contents: string): ReadonlyMap<string, string> | undefined {
	const { hasWorkspace, workspaceDependencies } = parseCargoDependencies(contents);
	if (!hasWorkspace) {
		return undefined;
	}
	const dependencies = new Map<string, string>();
	for (const [alias, dependency] of workspaceDependencies) {
		if (!dependency.workspace) {
			dependencies.set(alias, dependency.packageName ?? alias);
		}
	}
	return dependencies;
}

export async function getCargoWorkspaceDependenciesForFolder(
	folder: URI,
	contents: string,
	readManifestContents: (folder: URI) => Promise<string | undefined>,
	cache: Map<string, ReadonlyMap<string, string> | undefined>
): Promise<ReadonlyMap<string, string> | undefined> {
	const manifest = parseCargoDependencies(contents);
	if (!manifest.sections.some(section => [...section].some(([alias, dependency]) => dependency.workspace && !manifest.workspaceDependencies.has(alias)))) {
		return undefined;
	}

	let currentFolder = folder;
	while (true) {
		const key = getComparisonKey(currentFolder);
		let dependencies = cache.get(key);
		if (!cache.has(key)) {
			let contents: string | undefined;
			try {
				contents = await readManifestContents(currentFolder);
			} catch {
				cache.set(key, undefined);
				return undefined;
			}
			dependencies = contents === undefined ? undefined : getCargoWorkspaceDependencies(contents);
			cache.set(key, dependencies);
		}
		if (dependencies) {
			return dependencies;
		}
		const parent = dirname(currentFolder);
		if (isEqual(currentFolder, parent)) {
			return undefined;
		}
		currentFolder = parent;
	}
}

function getCargoDependencyNamesFromManifest(contents: string, inheritedWorkspaceDependencies?: ReadonlyMap<string, string>): string[] {
	const { sections, workspaceDependencies } = parseCargoDependencies(contents);
	const names = new Set<string>();
	for (const section of sections) {
		for (const [alias, dependency] of section) {
			const workspaceDependency = workspaceDependencies.get(alias);
			let name: string | undefined;
			if (dependency.workspace) {
				name = workspaceDependency ? workspaceDependency.packageName ?? alias : inheritedWorkspaceDependencies?.get(alias);
			} else {
				name = dependency.packageName ?? alias;
			}
			if (name) {
				names.add(name);
			}
		}
	}
	return [...names];
}

function parseCargoDependencies(contents: string): { sections: Map<string, CargoDependency>[]; workspaceDependencies: Map<string, CargoDependency>; hasWorkspace: boolean } {
	const workspaceDependencies = new Map<string, CargoDependency>();
	const sections = new Map<string, Map<string, CargoDependency>>();
	let tablePath: string[] | undefined = [];
	let inlineTable: { path: string[]; value: string; braceDepth: number } | undefined;
	let hasWorkspace = false;
	const stringState: { multilineQuote?: string } = {};

	const getDependencySection = (section: DependencySection): Map<string, CargoDependency> => {
		if (section.isWorkspace) {
			return workspaceDependencies;
		}
		let dependencies = sections.get(section.id);
		if (!dependencies) {
			dependencies = new Map<string, CargoDependency>();
			sections.set(section.id, dependencies);
		}
		return dependencies;
	};

	const applyDependencyAssignment = (path: string[], value: string) => {
		const location = getDependencyLocation(path);
		if (!location) {
			return;
		}
		const dependencies = getDependencySection(location.section);
		hasWorkspace ||= location.section.isWorkspace;
		if (!location.alias) {
			for (const entry of parseInlineTable(value)) {
				const assignment = parseDependencyAssignment(entry);
				if (assignment?.keys.length === 1) {
					dependencies.set(assignment.keys[0], parseInlineDependency(assignment.value));
				} else if (assignment?.keys.length === 2) {
					const dependency = dependencies.get(assignment.keys[0]) ?? {};
					setDependencyProperty(dependency, assignment.keys[1], assignment.value);
					dependencies.set(assignment.keys[0], dependency);
				}
			}
		} else if (location.property) {
			const dependency = dependencies.get(location.alias) ?? {};
			setDependencyProperty(dependency, location.property, value);
			dependencies.set(location.alias, dependency);
		} else {
			dependencies.set(location.alias, parseInlineDependency(value));
		}
	};

	for (const rawLine of contents.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine, stringState).trim();
		if (!line) {
			continue;
		}

		if (inlineTable) {
			inlineTable.value += ` ${line}`;
			inlineTable.braceDepth += countBraces(line);
			if (inlineTable.braceDepth <= 0) {
				applyDependencyAssignment(inlineTable.path, inlineTable.value);
				inlineTable = undefined;
			}
			continue;
		}

		if (line.startsWith('[')) {
			tablePath = parseTomlTableHeader(line);
			if (!tablePath) {
				continue;
			}
			hasWorkspace ||= tablePath[0] === 'workspace';
			const location = getDependencyLocation(tablePath);
			if (location?.alias && !location.property) {
				const dependencies = getDependencySection(location.section);
				if (!dependencies.has(location.alias)) {
					dependencies.set(location.alias, {});
				}
			}
			continue;
		}

		if (!tablePath) {
			continue;
		}

		const assignment = parseDependencyAssignment(line);
		if (!assignment) {
			continue;
		}

		const path = [...tablePath, ...assignment.keys];
		const value = assignment.value;
		if (getDependencyLocation(path) && value.trimStart().startsWith('{') && countBraces(value) > 0) {
			inlineTable = { path, value, braceDepth: countBraces(value) };
		} else {
			applyDependencyAssignment(path, value);
		}
	}

	return { sections: [...sections.values(), workspaceDependencies], workspaceDependencies, hasWorkspace };
}

interface DependencySection {
	id: string;
	isWorkspace: boolean;
}

function getDependencyLocation(path: string[]): { section: DependencySection; alias?: string; property?: string } | undefined {
	const dependencySections = ['dependencies', 'dev-dependencies', 'build-dependencies'];
	let sectionLength: number;
	if (path[0] === 'workspace' && dependencySections.includes(path[1])) {
		sectionLength = 2;
	} else if (path[0] === 'target' && path.length >= 3 && dependencySections.includes(path[2])) {
		sectionLength = 3;
	} else if (dependencySections.includes(path[0])) {
		sectionLength = 1;
	} else {
		return undefined;
	}
	if (path.length > sectionLength + 2) {
		return undefined;
	}
	const sectionPath = path.slice(0, sectionLength);
	return {
		section: { id: JSON.stringify(sectionPath), isWorkspace: sectionPath[0] === 'workspace' },
		alias: path[sectionLength],
		property: path[sectionLength + 1]
	};
}

function parseTomlTableHeader(line: string): string[] | undefined {
	if (line.startsWith('[[') && line.endsWith(']]')) {
		return splitTomlDottedKey(line.slice(2, -2));
	}
	if (line.startsWith('[') && line.endsWith(']')) {
		return splitTomlDottedKey(line.slice(1, -1));
	}
	return undefined;
}

function parseDependencyAssignment(line: string): { keys: string[]; value: string } | undefined {
	const assignmentIndex = findUnquotedCharacter(line, '=');
	if (assignmentIndex === -1) {
		return undefined;
	}

	const keys = splitTomlDottedKey(line.slice(0, assignmentIndex));
	if (!keys) {
		return undefined;
	}

	return {
		keys,
		value: line.slice(assignmentIndex + 1).trim()
	};
}

function splitTomlDottedKey(value: string): string[] | undefined {
	const keys: string[] = [];
	let start = 0;
	let quote: '"' | '\'' | undefined;
	let escaped = false;

	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (quote) {
			if (quote === '"' && character === '\\' && !escaped) {
				escaped = true;
				continue;
			}
			if (character === quote && !escaped) {
				quote = undefined;
			}
			escaped = false;
		} else if (character === '"' || character === '\'') {
			quote = character;
		} else if (character === '.') {
			const key = parseTomlKey(value.slice(start, i));
			if (key === undefined) {
				return undefined;
			}
			keys.push(key);
			start = i + 1;
		}
	}

	if (quote) {
		return undefined;
	}

	const key = parseTomlKey(value.slice(start));
	if (key === undefined) {
		return undefined;
	}
	keys.push(key);
	return keys;
}

function findUnquotedCharacter(value: string, expectedCharacter: string): number {
	let quote: '"' | '\'' | undefined;
	let escaped = false;

	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (quote) {
			if (quote === '"' && character === '\\' && !escaped) {
				escaped = true;
				continue;
			}
			if (character === quote && !escaped) {
				quote = undefined;
			}
			escaped = false;
		} else if (character === '"' || character === '\'') {
			quote = character;
		} else if (character === expectedCharacter) {
			return i;
		}
	}

	return -1;
}

function setDependencyProperty(dependency: CargoDependency, property: string, value: string): void {
	if (property === 'package') {
		dependency.packageName = /^["']([^"']+)["']/.exec(value)?.[1];
	} else if (property === 'workspace') {
		dependency.workspace = value.trim() === 'true';
	}
}

function parseInlineDependency(value: string): CargoDependency {
	const dependency: CargoDependency = {};
	for (const entry of parseInlineTable(value)) {
		const assignment = parseDependencyAssignment(entry);
		if (assignment?.keys.length === 1) {
			setDependencyProperty(dependency, assignment.keys[0], assignment.value);
		}
	}
	return dependency;
}

function parseInlineTable(value: string): string[] {
	if (!value.startsWith('{')) {
		return [];
	}
	const entries: string[] = [];
	let start = 1;
	let depth = 0;
	let quote: '"' | '\'' | undefined;
	for (let i = start; i < value.length; i++) {
		const character = value[i];
		if (quote) {
			if (quote === '"' && character === '\\') {
				i++;
			} else if (character === quote) {
				quote = undefined;
			}
		} else if (character === '"' || character === '\'') {
			quote = character;
		} else if (character === '{' || character === '[') {
			depth++;
		} else if (depth === 0 && (character === ',' || character === '}')) {
			const entry = value.slice(start, i).trim();
			if (entry) {
				entries.push(entry);
			}
			start = i + 1;
		} else if (character === '}' || character === ']') {
			depth--;
		}
	}
	return entries;
}

function parseTomlKey(value: string): string | undefined {
	const key = value.trim();
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith('\'') && key.endsWith('\''))) {
		return key.slice(1, -1);
	}
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : undefined;
}

function countBraces(value: string): number {
	let count = 0;
	let quote: '"' | '\'' | undefined;
	let escaped = false;
	for (const character of value) {
		if (quote) {
			if (quote === '"' && character === '\\' && !escaped) {
				escaped = true;
				continue;
			}
			if (character === quote && !escaped) {
				quote = undefined;
			}
			escaped = false;
		} else if (character === '"' || character === '\'') {
			quote = character;
		} else if (character === '{') {
			count++;
		} else if (character === '}') {
			count--;
		}
	}
	return count;
}

function stripTomlComment(value: string, state: { multilineQuote?: string }): string {
	let result = '';
	let quote: '"' | '\'' | undefined;
	for (let i = 0; i < value.length; i++) {
		const character = value[i];
		if (state.multilineQuote) {
			if (state.multilineQuote === '"""' && character === '\\') {
				i++;
			} else if (value.startsWith(state.multilineQuote, i)) {
				i += 2;
				for (let extra = 0; extra < 2 && value[i + 1] === character; extra++) {
					i++;
				}
				state.multilineQuote = undefined;
			}
			continue;
		}
		if (quote) {
			result += character;
			if (quote === '"' && character === '\\' && i + 1 < value.length) {
				result += value[++i];
			} else if (character === quote) {
				quote = undefined;
			}
		} else if (value.startsWith('"""', i) || value.startsWith('\'\'\'', i)) {
			state.multilineQuote = value.slice(i, i + 3);
			result += '""';
			i += 2;
		} else if (character === '"' || character === '\'') {
			quote = character;
			result += character;
		} else if (character === '#') {
			break;
		} else {
			result += character;
		}
	}
	return result;
}
