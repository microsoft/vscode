/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { open, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const checkout = fileURLToPath(new URL('../../../../', import.meta.url));
const maxFrontMatterBytes = 64 * 1024;
const specRoots = [
	{ path: '.github/skills/design-system/foundations', kind: 'foundation' },
	{ path: '.github/skills/design-system/patterns', kind: 'pattern' },
	{ path: 'src/vs', kind: 'component' }
] as const;

type SpecKind = 'foundation' | 'pattern' | 'primitive' | 'composite';
type SpecStatus = 'draft' | 'stable' | 'deprecated';

interface DesignSpec {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	readonly kind: SpecKind;
	readonly status: SpecStatus;
	readonly aliases: readonly string[];
	readonly legacyPaths: readonly string[];
	readonly replacedBy?: string;
	readonly order?: number;
	readonly hidden?: boolean;
}

interface ValidationOptions {
	readonly root: string;
	readonly viewer?: string;
	readonly output?: string;
	readonly sourcesOnly?: boolean;
}

export interface ValidationReport {
	readonly root: string;
	readonly identity: string;
	readonly viewer?: string;
	readonly viewerVersion?: string;
	readonly sources: 'passed';
	readonly exportedTopics?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(metadata: Record<string, unknown>, key: string, file: string): string {
	const value = metadata[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${file}: requires a non-empty '${key}' string`);
	}
	return value.trim();
}

function optionalString(metadata: Record<string, unknown>, key: string, file: string): string | undefined {
	const value = metadata[key];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${file}: '${key}' must be a non-empty string`);
	}
	return value.trim();
}

function stringArray(metadata: Record<string, unknown>, key: string, file: string): readonly string[] {
	const value = metadata[key];
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
		throw new Error(`${file}: '${key}' must be an array of non-empty strings`);
	}
	const values: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string' || entry.trim().length === 0) {
			throw new Error(`${file}: '${key}' must be an array of non-empty strings`);
		}
		values.push(entry.trim());
	}
	if (new Set(values).size !== values.length) {
		throw new Error(`${file}: '${key}' contains duplicates`);
	}
	return values;
}

async function readFrontMatter(file: string): Promise<Record<string, unknown>> {
	const handle = await open(file, 'r');
	try {
		const buffer = Buffer.alloc(4096);
		let source = '';
		let position = 0;
		while (source.length <= maxFrontMatterBytes) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
			if (bytesRead === 0) {
				break;
			}
			source += buffer.toString('utf8', 0, bytesRead);
			const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
			if (match) {
				const value = loadYaml(match[1]);
				if (!isRecord(value)) {
					throw new Error(`${file}: front matter must be a YAML object`);
				}
				return value;
			}
			position += bytesRead;
		}
		throw new Error(`${file}: missing or oversized YAML front matter`);
	} finally {
		await handle.close();
	}
}

function validateId(id: string, file: string): void {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
		throw new Error(`${file}: spec id '${id}' must be a lowercase kebab-case identifier`);
	}
}

async function readSpec(root: string, file: string, expectedKind: (typeof specRoots)[number]['kind']): Promise<DesignSpec> {
	const metadata = await readFrontMatter(path.join(root, file));
	const title = requiredString(metadata, 'title', file);
	const kindValue = requiredString(metadata, 'kind', file);
	const statusValue = requiredString(metadata, 'status', file);
	const id = optionalString(metadata, 'id', file) ?? path.posix.basename(file, '.design.md');
	validateId(id, file);

	const allowedKinds: readonly SpecKind[] = expectedKind === 'component'
		? ['primitive', 'composite']
		: [expectedKind];
	const kind = allowedKinds.find(candidate => candidate === kindValue);
	if (!kind) {
		throw new Error(`${file}: kind '${kindValue}' is not valid under ${expectedKind}`);
	}
	const allowedStatuses: readonly SpecStatus[] = ['draft', 'stable', 'deprecated'];
	const status = allowedStatuses.find(candidate => candidate === statusValue);
	if (!status) {
		throw new Error(`${file}: status '${statusValue}' must be draft, stable, or deprecated`);
	}

	const replacedBy = optionalString(metadata, 'replacedBy', file);
	if (status === 'deprecated' && !replacedBy) {
		throw new Error(`${file}: deprecated specs require 'replacedBy'`);
	}
	if (status !== 'deprecated' && replacedBy) {
		throw new Error(`${file}: 'replacedBy' is only valid for deprecated specs`);
	}

	const orderValue = metadata.order;
	if (orderValue !== undefined && (typeof orderValue !== 'number' || !Number.isInteger(orderValue) || orderValue < 0)) {
		throw new Error(`${file}: 'order' must be a non-negative integer`);
	}
	const hiddenValue = metadata.hidden;
	if (hiddenValue !== undefined && typeof hiddenValue !== 'boolean') {
		throw new Error(`${file}: 'hidden' must be a boolean`);
	}

	return {
		id,
		path: file,
		title,
		kind,
		status,
		aliases: stringArray(metadata, 'aliases', file),
		legacyPaths: stringArray(metadata, 'legacyPaths', file),
		replacedBy,
		order: typeof orderValue === 'number' ? orderValue : undefined,
		hidden: typeof hiddenValue === 'boolean' ? hiddenValue : undefined
	};
}

function validateSpecSet(specs: readonly DesignSpec[]): void {
	const byId = new Map<string, DesignSpec>();
	const aliases = new Map<string, string>();
	const orders = new Map<string, Map<number, string>>();

	for (const spec of specs) {
		if (byId.has(spec.id)) {
			throw new Error(`Duplicate spec id '${spec.id}' in ${byId.get(spec.id)!.path} and ${spec.path}`);
		}
		byId.set(spec.id, spec);
		if (spec.order !== undefined) {
			let kindOrders = orders.get(spec.kind);
			if (!kindOrders) {
				kindOrders = new Map();
				orders.set(spec.kind, kindOrders);
			}
			const previous = kindOrders.get(spec.order);
			if (previous) {
				throw new Error(`Duplicate order ${spec.order} for ${spec.kind} specs ${previous} and ${spec.id}`);
			}
			kindOrders.set(spec.order, spec.id);
		}
	}

	for (const spec of specs) {
		if (spec.replacedBy) {
			const replacement = byId.get(spec.replacedBy);
			if (!replacement || replacement.status === 'deprecated') {
				throw new Error(`${spec.path}: replacement '${spec.replacedBy}' must identify an existing nondeprecated spec`);
			}
		}
		for (const alias of [...spec.aliases, ...spec.legacyPaths]) {
			if (byId.has(alias)) {
				throw new Error(`${spec.path}: alias '${alias}' collides with spec id '${alias}'`);
			}
			const previous = aliases.get(alias);
			if (previous) {
				throw new Error(`Alias '${alias}' is claimed by both ${previous} and ${spec.path}`);
			}
			aliases.set(alias, spec.path);
		}
	}
}

function compareSpecs(a: DesignSpec, b: DesignSpec): number {
	const kindOrder: Record<SpecKind, number> = { foundation: 0, pattern: 1, primitive: 2, composite: 3 };
	return kindOrder[a.kind] - kindOrder[b.kind]
		|| (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
		|| a.title.localeCompare(b.title)
		|| a.path.localeCompare(b.path);
}

export async function discoverDesignSpecs(root: string): Promise<readonly DesignSpec[]> {
	const specs: DesignSpec[] = [];
	for (const specRoot of specRoots) {
		const entries = await readdir(path.join(root, specRoot.path), { recursive: true });
		for (const entry of entries) {
			const file = path.posix.join(specRoot.path, entry.replaceAll(path.sep, '/'));
			if (file.endsWith('.design.md')) {
				specs.push(await readSpec(root, file, specRoot.kind));
			}
		}
	}
	validateSpecSet(specs);
	return specs.sort(compareSpecs);
}

async function checkFile(root: string, file: string): Promise<void> {
	if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
		throw new Error(`Path must be relative to the repository: ${file}`);
	}
	const resolved = await realpath(path.join(root, file));
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error(`Path escapes the repository: ${file}`);
	}
	if (!(await stat(resolved)).isFile()) {
		throw new Error(`Path must identify a file: ${file}`);
	}
}

async function checkTopicCompositions(root: string, specs: readonly DesignSpec[]): Promise<void> {
	const directory = path.join(root, '.github/skills/design-system/content/topics');
	const entries = (await readdir(directory)).filter(entry => entry.endsWith('.json')).sort();
	const sharedSpecs = specs.filter(spec => (spec.kind === 'foundation' || spec.kind === 'pattern') && spec.status !== 'deprecated');
	const specById = new Map(sharedSpecs.map(spec => [spec.id, spec]));
	const composedIds = new Set<string>();

	for (const entry of entries) {
		const file = `.github/skills/design-system/content/topics/${entry}`;
		const composition: unknown = JSON.parse(await readFile(path.join(root, file), 'utf8'));
		if (!isRecord(composition)) {
			throw new Error(`${file}: expected a JSON object`);
		}
		const id = requiredString(composition, 'id', file);
		if (entry !== `${id}.json`) {
			throw new Error(`${file}: filename must match composition id '${id}'`);
		}
		const source = requiredString(composition, 'source', file);
		const renderer = requiredString(composition, 'renderer', file);
		const renderers = ['components', 'documents', 'foundations', 'guidance', 'icons', 'motion', 'patterns', 'theming', 'tokens', 'typography'];
		if (!renderers.includes(renderer)) {
			throw new Error(`${file}: unknown renderer '${renderer}'`);
		}
		await checkFile(root, source);

		const additionalSources = composition.sources;
		if (additionalSources !== undefined) {
			if (!Array.isArray(additionalSources)) {
				throw new Error(`${file}: 'sources' must be an array`);
			}
			for (const sourceEntry of additionalSources) {
				const sourceFile = typeof sourceEntry === 'string'
					? sourceEntry
					: isRecord(sourceEntry) && typeof sourceEntry.file === 'string'
						? sourceEntry.file
						: undefined;
				if (!sourceFile) {
					throw new Error(`${file}: source entries must identify a local file`);
				}
				await checkFile(root, sourceFile);
			}
		}

		if (renderer === 'documents' || renderer === 'components') {
			if (specById.has(id)) {
				throw new Error(`${file}: utility document id '${id}' collides with a design spec`);
			}
			continue;
		}
		const spec = specById.get(id);
		if (!spec) {
			throw new Error(`${file}: no nondeprecated foundation or pattern spec has id '${id}'`);
		}
		if (source !== spec.path) {
			throw new Error(`${file}: source '${source}' must point to ${spec.path}`);
		}
		composedIds.add(id);
	}

	for (const spec of sharedSpecs) {
		if (!composedIds.has(spec.id)) {
			throw new Error(`${spec.path}: missing chapter composition content/topics/${spec.id}.json`);
		}
	}
}

async function checkLegacyDocumentPaths(root: string): Promise<void> {
	const file = '.github/skills/design-system/content/legacy-document-paths.json';
	const absolutePath = path.join(root, file);
	let contents: string;
	try {
		contents = await readFile(absolutePath, 'utf8');
	} catch (error) {
		if (isRecord(error) && error.code === 'ENOENT') {
			return;
		}
		throw error;
	}
	const mappings: unknown = JSON.parse(contents);
	if (!isRecord(mappings)) {
		throw new Error(`${file}: expected an object mapping old paths to current paths`);
	}
	for (const [legacyPath, currentPath] of Object.entries(mappings)) {
		if (typeof currentPath !== 'string' || currentPath.trim().length === 0) {
			throw new Error(`${file}: '${legacyPath}' must map to a current document path`);
		}
		if (path.isAbsolute(legacyPath) || legacyPath.split(/[\\/]/).includes('..') || legacyPath === currentPath || Object.hasOwn(mappings, currentPath)) {
			throw new Error(`${file}: aliases must resolve directly to a different current path: ${legacyPath}`);
		}
		await checkFile(root, currentPath);
	}
}

interface ComponentCurationEntry {
	readonly id: string;
	readonly owner?: string;
	readonly design?: string;
}

function readCurationEntry(value: unknown, file: string, idOverride?: string): ComponentCurationEntry {
	if (!isRecord(value)) {
		throw new Error(`${file}: component curation entries must be objects`);
	}
	return {
		id: idOverride ?? requiredString(value, 'id', file),
		owner: optionalString(value, 'owner', file),
		design: optionalString(value, 'design', file)
	};
}

async function checkComponentCuration(root: string): Promise<void> {
	const file = '.github/skills/design-system/content/components/curation.json';
	const absolutePath = path.join(root, file);
	let contents: string;
	try {
		contents = await readFile(absolutePath, 'utf8');
	} catch (error) {
		if (isRecord(error) && error.code === 'ENOENT') {
			return;
		}
		throw error;
	}
	const curation: unknown = JSON.parse(contents);
	if (!isRecord(curation)) {
		throw new Error(`${file}: expected a JSON object`);
	}
	const entries = new Map<string, ComponentCurationEntry>();
	for (const collectionName of ['productControls', 'additions']) {
		const collection = curation[collectionName];
		if (!Array.isArray(collection)) {
			throw new Error(`${file}: '${collectionName}' must be an array`);
		}
		for (const value of collection) {
			const entry = readCurationEntry(value, file);
			entries.set(entry.id, entry);
		}
	}
	const families = curation.families;
	if (!Array.isArray(families)) {
		throw new Error(`${file}: 'families' must be an array`);
	}
	for (const family of families) {
		if (!Array.isArray(family) || family.length !== 2 || typeof family[0] !== 'string') {
			throw new Error(`${file}: family entries must be [id, metadata] pairs`);
		}
		const familyEntry = readCurationEntry(family[1], file, family[0]);
		const previous = entries.get(familyEntry.id);
		entries.set(familyEntry.id, {
			id: familyEntry.id,
			owner: familyEntry.owner ?? previous?.owner,
			design: familyEntry.design ?? previous?.design
		});
	}
	for (const entry of entries.values()) {
		if (!entry.design) {
			continue;
		}
		if (!entry.owner) {
			throw new Error(`${file}: component design requires an implementation owner: ${entry.design}`);
		}
		await checkFile(root, entry.design);
		await checkFile(root, entry.owner);
		if (path.posix.dirname(entry.design) !== path.posix.dirname(entry.owner)) {
			throw new Error(`${file}: design spec ${entry.design} must be beside its implementation owner ${entry.owner}`);
		}
	}
}

export async function checkDesignPlacement(root: string): Promise<void> {
	root = await realpath(root);
	const specs = await discoverDesignSpecs(root);
	await checkTopicCompositions(root, specs);
	await checkLegacyDocumentPaths(root);
	await checkComponentCuration(root);
	console.log(`Design guidance: validated ${specs.length} discovered specifications and chapter compositions.`);
}

export async function checkRenderedSnapshot(file: string): Promise<void> {
	const html = await readFile(file, 'utf8');
	assert.match(html, /<main id="reference"/, 'Missing snapshot main content');
	assert.match(html, /id="snapshot-payload"/, 'Missing embedded design-system catalog');
	assert.match(html, /Visual Studio Code Design System/, 'Missing design-system title');
	assert.doesNotMatch(html, /\[\[|\]\]/, 'Unresolved placeholder in snapshot');
}

function command(program: string, args: string[], cwd: string): string {
	return execFileSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 180000 }).trim();
}

export async function validateDesignSystem(options: ValidationOptions): Promise<ValidationReport> {
	const root = await realpath(options.root);
	await checkDesignPlacement(root);

	const identity = command('git', ['log', '-1', '--format=%h %s'], root);
	if (!options.viewer) {
		if (options.output) {
			throw new Error('An output directory requires a viewer checkout');
		}
		const report = { root, identity, sources: 'passed' as const };
		console.log(JSON.stringify({ ...report, status: 'passed' }, null, 2));
		return report;
	}

	const viewer = await realpath(options.viewer);
	const metadata: unknown = JSON.parse(await readFile(path.join(viewer, 'package.json'), 'utf8'));
	if (!isRecord(metadata) || metadata.name !== 'vscode-design-system') {
		throw new Error(`Unexpected viewer package name: ${isRecord(metadata) ? metadata.name : undefined}`);
	}
	if (typeof metadata.version !== 'string' || metadata.version.length === 0) {
		throw new Error('Viewer package.json has no version');
	}
	const viewerVersion = metadata.version;
	command(process.execPath, [path.join(viewer, 'scripts', 'book.mjs'), 'validate', '--root', root], root);
	if (options.sourcesOnly) {
		const report = { root, identity, viewer, viewerVersion, sources: 'passed' as const };
		console.log(JSON.stringify({ ...report, status: 'passed' }, null, 2));
		return report;
	}

	const output = options.output ? path.resolve(options.output) : await mkdtemp(path.join(root, '.design-system-preview-'));
	await mkdir(output, { recursive: true });
	const listed = JSON.parse(command(process.execPath, [path.join(viewer, 'scripts', 'book.mjs'), 'list', '--root', root], root)) as { topics?: unknown };
	if (!Array.isArray(listed.topics)) {
		throw new Error('Viewer did not return a topic catalog');
	}
	const exportedFile = path.join(output, 'design-system.html');
	const exported = JSON.parse(command(process.execPath, [path.join(viewer, 'scripts', 'export.mjs'), exportedFile, '--root', root], output)) as { topics?: unknown };
	if (typeof exported.topics !== 'number' || exported.topics !== listed.topics.length) {
		throw new Error(`Viewer exported ${String(exported.topics)} topics, expected ${listed.topics.length}`);
	}
	await checkRenderedSnapshot(exportedFile);
	const report: ValidationReport = {
		root,
		identity,
		viewer,
		viewerVersion,
		sources: 'passed',
		exportedTopics: exported.topics,
	};
	console.log(JSON.stringify({
		...report,
		output,
		status: 'passed',
		limits: ['Live browser interaction and installed extension activation were not exercised.']
	}, null, 2));
	return report;
}

function parseArguments(args: string[]): { root: string; viewer?: string; output?: string; sourcesOnly: boolean; list: boolean } {
	let root = checkout;
	let viewer: string | undefined;
	let output: string | undefined;
	let sourcesOnly = false;
	let list = false;
	const readValue = (index: number, flag: string): string => {
		const value = args[index + 1];
		if (!value || value.startsWith('--')) {
			throw new Error(`${flag} requires a value`);
		}
		return value;
	};
	for (let index = 0; index < args.length; index++) {
		switch (args[index]) {
			case '--root':
				root = path.resolve(readValue(index++, '--root'));
				break;
			case '--viewer':
				viewer = path.resolve(readValue(index++, '--viewer'));
				break;
			case '--output':
				output = path.resolve(readValue(index++, '--output'));
				break;
			case '--sources-only':
				sourcesOnly = true;
				break;
			case '--list':
				list = true;
				break;
			default:
				throw new Error(`Unknown argument: ${args[index]}`);
		}
	}
	return { root, viewer, output, sourcesOnly, list };
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	if (options.list) {
		const specs = await discoverDesignSpecs(options.root);
		console.log(JSON.stringify(specs.map(({ id, path: file, title, kind, status, order, hidden }) => ({
			id,
			path: file,
			title,
			kind,
			status,
			...(order === undefined ? {} : { order }),
			...(hidden === undefined ? {} : { hidden })
		})), null, 2));
		return;
	}
	await validateDesignSystem(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
