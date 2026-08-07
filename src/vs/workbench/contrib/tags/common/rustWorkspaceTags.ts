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

const dependencySectionPattern = /^(?:workspace\.)?(?:dependencies|dev-dependencies|build-dependencies)$/;
const targetDependencySectionPattern = /^target\..+\.(?:dependencies|dev-dependencies|build-dependencies)$/;
const dependencyTablePattern = /^(?:(?:workspace\.)?(?:dependencies|dev-dependencies|build-dependencies)|target\..+\.(?:dependencies|dev-dependencies|build-dependencies))\.(.+)$/;
const dependencyPattern = /^("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?\s*=\s*(.*)$/;
const packagePattern = /(?:^|[,{]\s*)package\s*=\s*["']([^"']+)["']/;

export function getCargoDependencyNames(contents: string): string[] {
	const dependencies = new Map<string, string>();
	let dependencySection = false;
	let dependencyTable: { alias: string; packageName?: string } | undefined;
	let inlineDependency: { alias: string; value: string; braceDepth: number } | undefined;

	const finishDependencyTable = () => {
		if (dependencyTable) {
			dependencies.set(dependencyTable.alias, dependencyTable.packageName ?? dependencyTable.alias);
			dependencyTable = undefined;
		}
	};

	const finishInlineDependency = () => {
		if (inlineDependency) {
			dependencies.set(inlineDependency.alias, getPackageName(inlineDependency.value) ?? inlineDependency.alias);
			inlineDependency = undefined;
		}
	};

	for (const rawLine of contents.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine).trim();
		if (!line) {
			continue;
		}

		const sectionMatch = /^\[\s*(.+?)\s*\]$/.exec(line);
		if (sectionMatch) {
			finishInlineDependency();
			finishDependencyTable();

			const section = sectionMatch[1];
			const dependencyTableMatch = dependencyTablePattern.exec(section);
			if (dependencyTableMatch) {
				dependencyTable = { alias: parseTomlKey(dependencyTableMatch[1]) };
				dependencySection = false;
			} else {
				dependencySection = dependencySectionPattern.test(section) || targetDependencySectionPattern.test(section);
			}
			continue;
		}

		if (dependencyTable) {
			const packageMatch = /^package\s*=\s*["']([^"']+)["']/.exec(line);
			if (packageMatch) {
				dependencyTable.packageName = packageMatch[1];
			}
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

		if (!dependencySection) {
			continue;
		}

		const dependencyMatch = dependencyPattern.exec(line);
		if (!dependencyMatch) {
			continue;
		}

		const alias = parseTomlKey(dependencyMatch[1]);
		const property = dependencyMatch[2];
		const value = dependencyMatch[3];
		if (property) {
			const packageName = property === 'package' ? /^["']([^"']+)["']/.exec(value)?.[1] : undefined;
			dependencies.set(alias, packageName ?? dependencies.get(alias) ?? alias);
			continue;
		}

		const braceDepth = countBraces(value);
		if (value.trimStart().startsWith('{') && braceDepth > 0) {
			inlineDependency = { alias, value, braceDepth };
		} else {
			dependencies.set(alias, getPackageName(value) ?? alias);
		}
	}

	finishInlineDependency();
	finishDependencyTable();
	return [...dependencies.values()];
}

function getPackageName(value: string): string | undefined {
	return packagePattern.exec(value)?.[1];
}

function parseTomlKey(value: string): string {
	const key = value.trim();
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith('\'') && key.endsWith('\''))) {
		return key.slice(1, -1);
	}
	return key;
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

function stripTomlComment(value: string): string {
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
		} else if (character === '#') {
			return value.slice(0, i);
		}
	}
	return value;
}
