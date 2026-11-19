/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function getCargoDependencyNames(contents: string): string[] {
	const workspaceDependencies = new Map<string, CargoDependency>();
	const sections: Map<string, CargoDependency>[] = [workspaceDependencies];
	let dependencies: Map<string, CargoDependency> | undefined;
	let dependencyTable: CargoDependency | undefined;
	let inlineDependency: { alias: string; value: string; braceDepth: number } | undefined;
	const stringState: { multilineQuote?: string } = {};

	const finishInlineDependency = () => {
		if (inlineDependency && dependencies) {
			dependencies.set(inlineDependency.alias, parseInlineDependency(inlineDependency.value));
			inlineDependency = undefined;
		}
	};

	for (const rawLine of contents.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine, stringState).trim();
		if (!line) {
			continue;
		}

		if (inlineDependency) {
			inlineDependency.value += ` ${line}`;
			inlineDependency.braceDepth += countBraces(line);
			if (inlineDependency.braceDepth <= 0) {
				finishInlineDependency();
			}
			continue;
		}

		if (line.startsWith('[')) {
			dependencyTable = undefined;
			dependencies = undefined;

			const section = line.endsWith(']') ? splitTomlDottedKey(line.slice(1, -1)) : undefined;
			if (!section) {
				continue;
			}
			const dependencyIndex = section[0] === 'workspace' ? 1 : section[0] === 'target' ? 2 : 0;
			if (!['dependencies', 'dev-dependencies', 'build-dependencies'].includes(section[dependencyIndex]) ||
				(section.length !== dependencyIndex + 1 && section.length !== dependencyIndex + 2)) {
				continue;
			}
			dependencies = section[0] === 'workspace' ? workspaceDependencies : new Map<string, CargoDependency>();
			if (dependencies !== workspaceDependencies) {
				sections.push(dependencies);
			}
			if (section.length === dependencyIndex + 2) {
				dependencyTable = {};
				dependencies.set(section[dependencyIndex + 1], dependencyTable);
			}
			continue;
		}

		if (dependencyTable) {
			const assignment = parseDependencyAssignment(line);
			if (assignment && !assignment.property) {
				setDependencyProperty(dependencyTable, assignment.alias, assignment.value);
			}
			continue;
		}

		if (!dependencies) {
			continue;
		}

		const dependency = parseDependencyAssignment(line);
		if (!dependency) {
			continue;
		}

		const { alias, property, value } = dependency;
		if (property) {
			const entry = dependencies.get(alias) ?? {};
			setDependencyProperty(entry, property, value);
			dependencies.set(alias, entry);
			continue;
		}

		const braceDepth = countBraces(value);
		if (value.trimStart().startsWith('{') && braceDepth > 0) {
			inlineDependency = { alias, value, braceDepth };
		} else {
			dependencies.set(alias, parseInlineDependency(value));
		}
	}

	finishInlineDependency();
	const names = new Set<string>();
	for (const section of sections) {
		for (const [alias, dependency] of section) {
			names.add(dependency.packageName ?? (dependency.workspace ? workspaceDependencies.get(alias)?.packageName : undefined) ?? alias);
		}
	}
	return [...names];
}

function parseDependencyAssignment(line: string): { alias: string; property?: string; value: string } | undefined {
	const assignmentIndex = findUnquotedCharacter(line, '=');
	if (assignmentIndex === -1) {
		return undefined;
	}

	const keys = splitTomlDottedKey(line.slice(0, assignmentIndex));
	if (!keys || keys.length > 2) {
		return undefined;
	}

	return {
		alias: keys[0],
		property: keys[1],
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
	if (!value.startsWith('{')) {
		return dependency;
	}
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
			const assignment = parseDependencyAssignment(value.slice(start, i));
			if (assignment && !assignment.property) {
				setDependencyProperty(dependency, assignment.alias, assignment.value);
			}
			start = i + 1;
		} else if (character === '}' || character === ']') {
			depth--;
		}
	}
	return dependency;
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
