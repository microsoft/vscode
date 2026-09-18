/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import glob from 'glob';
import { analyzeLocalizeCalls, parseLocalizeKeyOrValue, type ISpan } from '../lib/nls-analysis.ts';
import { serializeNlsData } from '../lib/nlsMessages.ts';
import { mapWithConcurrency, MAX_CONCURRENT_FILE_OPERATIONS } from './transpile.ts';

type NLSKey = string | { readonly key: string; readonly comment?: readonly string[] };

interface NLSEntry {
	readonly moduleId: string;
	readonly key: NLSKey;
	readonly message: string;
	readonly placeholder: string;
}

export interface NLSCatalog {
	readonly entries: readonly NLSEntry[];
	readonly indexMap: ReadonlyMap<string, number>;
}

interface NLSCall {
	readonly entry: NLSEntry;
	readonly keySpan: ISpan;
}

interface NLSManifest {
	readonly version: 1;
	readonly sourceHash: string;
	readonly entries: readonly NLSEntry[];
}

const globAsync = promisify(glob);
export const NLS_CATALOG_FILE = 'nls.catalog.json';

function keyText(key: NLSKey): string {
	return typeof key === 'string' ? key : key.key;
}

function isNLSKey(value: unknown): value is NLSKey {
	return typeof value === 'string' || (
		typeof value === 'object' && value !== null &&
		'key' in value && typeof value.key === 'string' &&
		(!('comment' in value) || (Array.isArray(value.comment) && value.comment.every(comment => typeof comment === 'string')))
	);
}

function isNLSEntry(value: unknown): value is NLSEntry {
	if (typeof value !== 'object' || value === null ||
		!('moduleId' in value) || typeof value.moduleId !== 'string' ||
		!('key' in value) || !isNLSKey(value.key) ||
		!('message' in value) || typeof value.message !== 'string' ||
		!('placeholder' in value)) {
		return false;
	}
	return value.placeholder === `%%NLS:${value.moduleId}#${keyText(value.key)}%%` ||
		value.placeholder === `%%NLS2:${value.moduleId}#${keyText(value.key)}%%`;
}

function isNLSManifest(value: unknown): value is NLSManifest {
	return typeof value === 'object' && value !== null &&
		'version' in value && value.version === 1 &&
		'sourceHash' in value && typeof value.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(value.sourceHash) &&
		'entries' in value && Array.isArray(value.entries) && value.entries.every(isNLSEntry);
}

export function getNLSModuleId(baseDir: string, filePath: string): string {
	return path.relative(baseDir, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');
}

export function collectNLSCalls(source: string, moduleId: string): NLSCall[] {
	if (!source.includes('/nls')) {
		return [];
	}

	const calls: NLSCall[] = [];
	for (const [name, prefix] of [['localize', 'NLS'], ['localize2', 'NLS2']] as const) {
		for (const call of analyzeLocalizeCalls(source, name)) {
			try {
				const key = parseLocalizeKeyOrValue(call.key);
				const message = parseLocalizeKeyOrValue(call.value);
				if (!isNLSKey(key) || typeof message !== 'string') {
					throw new Error('Expected a localization key and a string default message.');
				}
				calls.push({
					entry: { moduleId, key, message, placeholder: `%%${prefix}:${moduleId}#${keyText(key)}%%` },
					keySpan: call.keySpan,
				});
			} catch (error) {
				throw new Error(`[nls] Invalid ${name} call in ${moduleId}:${call.keySpan.start.line + 1}`, { cause: error });
			}
		}
	}
	return calls.sort((a, b) => a.keySpan.start.line - b.keySpan.start.line || a.keySpan.start.character - b.keySpan.start.character);
}

/**
 * Assigns one index space before target bundling. Ordering must not depend on
 * the host's locale, filesystem enumeration, or esbuild's module load order.
 */
export function createNLSCatalog(entries: Iterable<NLSEntry>): NLSCatalog {
	const byPlaceholder = new Map<string, NLSEntry>();
	const byKey = new Map<string, { message: string; comments: Map<string, readonly string[]> }>();
	for (const entry of entries) {
		const id = JSON.stringify([entry.moduleId, keyText(entry.key)]);
		let metadata = byKey.get(id);
		if (metadata && metadata.message !== entry.message) {
			throw new Error(`[nls] Conflicting default messages for ${entry.moduleId}#${keyText(entry.key)}`);
		}
		if (!metadata) {
			metadata = { message: entry.message, comments: new Map() };
			byKey.set(id, metadata);
		}
		if (typeof entry.key !== 'string' && entry.key.comment) {
			metadata.comments.set(JSON.stringify(entry.key.comment), entry.key.comment);
		}
		byPlaceholder.set(entry.placeholder, entry);
	}

	const sortedEntries = [...byPlaceholder.values()].map(entry => {
		const metadata = byKey.get(JSON.stringify([entry.moduleId, keyText(entry.key)]))!;
		// Preserve each comment block's order, including metadata from repeated calls.
		const comments = [...new Set([...metadata.comments.keys()].sort().flatMap(key => metadata.comments.get(key)!))];
		return Object.freeze({
			...entry,
			key: metadata.comments.size > 0 ? Object.freeze({ key: keyText(entry.key), comment: Object.freeze(comments) }) : keyText(entry.key),
		});
	}).sort((a, b) => {
		const aId = `${a.moduleId}\0${keyText(a.key)}\0${a.placeholder}`;
		const bId = `${b.moduleId}\0${keyText(b.key)}\0${b.placeholder}`;
		return aId < bId ? -1 : aId > bId ? 1 : 0;
	});

	return {
		entries: Object.freeze(sortedEntries),
		indexMap: new Map(sortedEntries.map((entry, index) => [entry.placeholder, index])),
	};
}

async function readNLSInputs(sourceDir: string) {
	if (!(await fs.promises.stat(sourceDir)).isDirectory()) {
		throw new Error(`[nls] Expected a source directory: ${sourceDir}`);
	}
	const files = (await globAsync('**/*.ts', {
		cwd: sourceDir,
		nodir: true,
		ignore: ['**/*.d.ts', '**/test/**', '**/*.test.ts', '**/*.integrationTest.ts'],
	})).map(file => file.replace(/\\/g, '/')).sort();
	const sources = await mapWithConcurrency(files, MAX_CONCURRENT_FILE_OPERATIONS, async file => ({
		moduleId: getNLSModuleId(sourceDir, path.join(sourceDir, file)),
		source: (await fs.promises.readFile(path.join(sourceDir, file), 'utf8')).replace(/\r\n/g, '\n'),
	}));
	const hash = createHash('sha256');
	for (const { moduleId, source } of sources) {
		hash.update(moduleId).update('\0').update(source).update('\0');
	}
	return { sources, sourceHash: hash.digest('hex') };
}

async function collectCatalog(sourceDir: string) {
	const { sources, sourceHash } = await readNLSInputs(sourceDir);
	const catalog = createNLSCatalog(sources.flatMap(({ moduleId, source }) => collectNLSCalls(source, moduleId).map(call => call.entry)));
	console.log(`[nls] Collected ${catalog.entries.length} messages from ${sources.length} source files`);
	return { catalog, sourceHash };
}

export async function extractNLSCatalog(sourceDir: string): Promise<NLSCatalog> {
	return (await collectCatalog(sourceDir)).catalog;
}

export async function writeNLSFiles(catalog: NLSCatalog, outDir: string): Promise<void> {
	const messages: string[] = [];
	const moduleToKeys = new Map<string, NLSKey[]>();
	const moduleToMessages = new Map<string, string[]>();
	for (const entry of catalog.entries) {
		messages.push(entry.message);
		if (!moduleToKeys.has(entry.moduleId)) {
			moduleToKeys.set(entry.moduleId, []);
			moduleToMessages.set(entry.moduleId, []);
		}
		moduleToKeys.get(entry.moduleId)!.push(entry.key);
		moduleToMessages.get(entry.moduleId)!.push(entry.message);
	}
	const keys: [string, string[]][] = [...moduleToKeys].map(([moduleId, keys]) => [moduleId, keys.map(keyText)]);
	const metadata = { keys: Object.fromEntries(moduleToKeys), messages: Object.fromEntries(moduleToMessages) };
	const files = {
		'nls.messages.json': JSON.stringify(messages),
		'nls.keys.json': JSON.stringify(keys),
		'nls.metadata.json': JSON.stringify(metadata, null, '\t'),
		'nls.messages.js': `/*---------------------------------------------------------\n * Copyright (C) Microsoft Corporation. All rights reserved.\n *--------------------------------------------------------*/\nglobalThis._VSCODE_NLS_MESSAGES=${serializeNlsData(messages)};`,
	};
	await fs.promises.mkdir(outDir, { recursive: true });
	await mapWithConcurrency(Object.entries(files), MAX_CONCURRENT_FILE_OPERATIONS, ([file, contents]) =>
		fs.promises.writeFile(path.join(outDir, file), contents));
}

/** Publishes shared build metadata once, before any target process starts. */
export async function prepareNLSCatalog(sourceDir: string, outDir: string): Promise<void> {
	const manifestPath = path.join(outDir, NLS_CATALOG_FILE);
	await fs.promises.rm(manifestPath, { force: true });
	const { catalog, sourceHash } = await collectCatalog(sourceDir);
	await writeNLSFiles(catalog, outDir);
	const manifest: NLSManifest = { version: 1, sourceHash, entries: catalog.entries };
	const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
	try {
		await fs.promises.writeFile(temporaryPath, JSON.stringify(manifest), { flag: 'wx' });
		await fs.promises.rename(temporaryPath, manifestPath);
	} finally {
		await fs.promises.rm(temporaryPath, { force: true });
	}
}

export async function loadNLSCatalog(sourceDir: string, manifestPath: string): Promise<NLSCatalog> {
	const manifest: unknown = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
	if (!isNLSManifest(manifest)) {
		throw new Error(`[nls] Invalid catalog: ${manifestPath}. Regenerate it with the nls command.`);
	}
	const catalog = createNLSCatalog(manifest.entries);
	if (JSON.stringify(catalog.entries) !== JSON.stringify(manifest.entries)) {
		throw new Error(`[nls] Non-canonical entries in ${manifestPath}. Regenerate it with the nls command.`);
	}
	if ((await readNLSInputs(sourceDir)).sourceHash !== manifest.sourceHash) {
		throw new Error(`[nls] Stale catalog: ${manifestPath}. Sources changed; regenerate it with the nls command.`);
	}
	return catalog;
}
