/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { open, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const checkout = fileURLToPath(new URL('../../../../', import.meta.url));
const maxFrontMatterBytes = 64 * 1024;
const specRoots = [
	{ path: '.github/skills/design-system/foundations', kind: 'foundation' },
	{ path: '.github/skills/design-system/patterns', kind: 'pattern' },
	{ path: 'src/vs', kind: 'component' }
] as const;

type SpecKind = 'foundation' | 'pattern' | 'component';
const presentations = ['guidance', 'typography', 'foundations', 'theming', 'icons', 'motion', 'tokens'] as const;
type SpecPresentation = (typeof presentations)[number];
type ExampleValue = string | number | boolean | null | ExampleValue[] | { [key: string]: ExampleValue };

interface ComponentBindings {
	readonly implementation?: string;
	readonly relatedSources?: readonly string[];
	readonly api?: readonly string[];
	readonly fixtures?: readonly string[];
	readonly designReference?: string;
}

interface DesignSpec {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	readonly kind: SpecKind;
	readonly isDraft: boolean;
	readonly aliases: readonly string[];
	readonly replacedBy?: string;
	readonly order?: number;
	readonly hidden?: boolean;
	readonly component?: ComponentBindings;
	readonly presentation?: SpecPresentation;
	readonly specimens?: Record<string, ExampleValue>;
	readonly sectionCopy?: Record<string, ExampleValue>;
	readonly tokenDomain?: boolean;
}

interface ValidationOptions {
	readonly root: string;
}

export interface ValidationReport {
	readonly root: string;
	readonly identity: string;
	readonly sources: 'passed';
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
		const decoder = new StringDecoder('utf8');
		let source = '';
		let position = 0;
		while (position <= maxFrontMatterBytes) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
			if (bytesRead === 0) {
				break;
			}
			source += decoder.write(buffer.subarray(0, bytesRead));
			position += bytesRead;
			const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
			if (match) {
				if (Buffer.byteLength(match[1]) > maxFrontMatterBytes) {
					throw new Error(`${file}: oversized YAML front matter`);
				}
				const value = loadYaml(match[1]);
				if (!isRecord(value)) {
					throw new Error(`${file}: front matter must be a YAML object`);
				}
				return value;
			}
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

async function componentBindings(root: string, metadata: Record<string, unknown>, file: string, expectedKind: string): Promise<ComponentBindings | undefined> {
	const value = metadata.component;
	if (value === undefined) {
		return undefined;
	}
	if (expectedKind !== 'component' || !isRecord(value)
		|| Object.keys(value).some(key => !['implementation', 'relatedSources', 'api', 'fixtures', 'designReference'].includes(key))) {
		throw new Error(`${file}: invalid component bindings`);
	}
	const implementation = optionalString(value, 'implementation', file);
	const relatedSources = stringArray(value, 'relatedSources', file);
	const api = stringArray(value, 'api', file);
	const fixtures = stringArray(value, 'fixtures', file);
	const designReference = optionalString(value, 'designReference', file);
	for (const source of [...(implementation ? [implementation] : []), ...relatedSources]) {
		if (!/^src\/[\w/.-]+\.ts$/.test(source) || source.split('/').includes('..')) {
			throw new Error(`${file}: invalid component source '${source}'`);
		}
		await checkFile(root, source, file);
	}
	if (implementation && path.posix.dirname(implementation) !== path.posix.dirname(file)) {
		throw new Error(`${file}: a component specification must be beside its implementation '${implementation}'`);
	}
	if (api.length && !implementation || api.some(member => !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/.test(member))) {
		throw new Error(`${file}: API selections require an implementation and public symbol names`);
	}
	if (designReference && !/^https:\/\/www\.figma\.com\/(?:design|file)\/[A-Za-z0-9]+\/[^#\s]*$/.test(designReference)) {
		throw new Error(`${file}: designReference must be an HTTPS Figma design link`);
	}
	return {
		...(implementation ? { implementation } : {}),
		...(value.relatedSources === undefined ? {} : { relatedSources }),
		...(value.api === undefined ? {} : { api }),
		...(value.fixtures === undefined ? {} : { fixtures }),
		...(designReference ? { designReference } : {}),
	};
}

async function exampleValue(root: string, value: unknown, file: string, depth = 0): Promise<ExampleValue> {
	if (depth > 20) {
		throw new Error(`${file}: example bindings exceed the supported depth`);
	}
	if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (Array.isArray(value)) {
		return Promise.all(value.map(entry => exampleValue(root, entry, file, depth + 1)));
	}
	if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype
		|| Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key) || key.startsWith('$') && key !== '$text')) {
		throw new Error(`${file}: invalid example bindings`);
	}
	const result: Record<string, ExampleValue> = {};
	for (const [key, entry] of Object.entries(value)) {
		if ((key === 'file' || key === 'textSource') && typeof entry === 'string') {
			await checkFile(root, entry, file);
		}
		result[key] = await exampleValue(root, entry, file, depth + 1);
	}
	return result;
}

async function exampleBindings(root: string, metadata: Record<string, unknown>, key: string, file: string): Promise<Record<string, ExampleValue> | undefined> {
	const value = metadata[key];
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value)) {
		throw new Error(`${file}: '${key}' must be an object`);
	}
	const result: Record<string, ExampleValue> = {};
	for (const [name, entry] of Object.entries(value)) {
		if (['version', 'id', 'renderer', 'source', 'status', 'isDraft', 'intro', 'sections', 'sectionIds', 'markdownSource'].includes(name)) {
			throw new Error(`${file}: '${key}' must not duplicate chapter identity or structure`);
		}
		result[name] = await exampleValue(root, entry, file);
	}
	return result;
}

async function readSpec(root: string, file: string, expectedKind: (typeof specRoots)[number]['kind']): Promise<DesignSpec> {
	const metadata = await readFrontMatter(path.join(root, file));
	const title = requiredString(metadata, 'title', file);
	const kindValue = requiredString(metadata, 'kind', file);
	const id = optionalString(metadata, 'id', file) ?? path.posix.basename(file, '.design.md');
	validateId(id, file);

	if (kindValue !== expectedKind) {
		throw new Error(`${file}: kind '${kindValue}' is not valid under ${expectedKind}`);
	}
	if (metadata.status !== undefined) {
		throw new Error(`${file}: use 'isDraft' instead of 'status'`);
	}
	const isDraftValue = metadata.isDraft;
	if (isDraftValue !== undefined && typeof isDraftValue !== 'boolean') {
		throw new Error(`${file}: 'isDraft' must be a boolean`);
	}
	const isDraft = isDraftValue ?? false;

	const replacedBy = optionalString(metadata, 'replacedBy', file);
	if (isDraft && replacedBy) {
		throw new Error(`${file}: 'replacedBy' is not valid on draft specs`);
	}

	const orderValue = metadata.order;
	if (orderValue !== undefined && (typeof orderValue !== 'number' || !Number.isInteger(orderValue) || orderValue < 0)) {
		throw new Error(`${file}: 'order' must be a non-negative integer`);
	}
	const hiddenValue = metadata.hidden;
	if (hiddenValue !== undefined && typeof hiddenValue !== 'boolean') {
		throw new Error(`${file}: 'hidden' must be a boolean`);
	}
	const presentationValue = optionalString(metadata, 'presentation', file);
	const presentation = presentations.find(candidate => candidate === presentationValue);
	if (presentationValue !== undefined && !presentation) {
		throw new Error(`${file}: unsupported presentation '${presentationValue}'`);
	}
	const tokenDomain = metadata.tokenDomain;
	if (tokenDomain !== undefined && typeof tokenDomain !== 'boolean') {
		throw new Error(`${file}: 'tokenDomain' must be a boolean`);
	}
	if (expectedKind === 'component' && ['presentation', 'specimens', 'sectionCopy', 'tokenDomain'].some(key => metadata[key] !== undefined)) {
		throw new Error(`${file}: chapter bindings belong to shared guidance, not component specifications`);
	}

	return {
		id,
		path: file,
		title,
		kind: expectedKind,
		isDraft,
		aliases: stringArray(metadata, 'aliases', file),
		replacedBy,
		order: typeof orderValue === 'number' ? orderValue : undefined,
		hidden: typeof hiddenValue === 'boolean' ? hiddenValue : undefined,
		component: await componentBindings(root, metadata, file, expectedKind),
		presentation,
		specimens: await exampleBindings(root, metadata, 'specimens', file),
		sectionCopy: await exampleBindings(root, metadata, 'sectionCopy', file),
		tokenDomain
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
			if (!replacement || replacement.replacedBy) {
				throw new Error(`${spec.path}: replacement '${spec.replacedBy}' must identify an existing nondeprecated spec`);
			}
		}
		for (const alias of spec.aliases) {
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
	const kindOrder: Record<SpecKind, number> = { foundation: 0, pattern: 1, component: 2 };
	return kindOrder[a.kind] - kindOrder[b.kind]
		|| (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
		|| a.title.localeCompare(b.title)
		|| a.path.localeCompare(b.path);
}

export async function discoverDesignSpecs(root: string): Promise<readonly DesignSpec[]> {
	root = await realpath(root);
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

async function checkFile(root: string, file: string, owner: string): Promise<void> {
	if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
		throw new Error(`${owner}: path must be relative to the repository: ${file}`);
	}
	let resolved: string;
	try {
		resolved = await realpath(path.join(root, file));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`${owner}: referenced file does not exist: ${file}`);
		}
		throw error;
	}
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error(`${owner}: path escapes the repository: ${file}`);
	}
	if (!(await stat(resolved)).isFile()) {
		throw new Error(`${owner}: path must identify a file: ${file}`);
	}
}

export async function checkDesignPlacement(root: string): Promise<void> {
	root = await realpath(root);
	const specs = await discoverDesignSpecs(root);
	console.log(`Design guidance: validated ${specs.length} discovered specifications and their owned bindings.`);
}

function command(program: string, args: string[], cwd: string): string {
	return execFileSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 180000 }).trim();
}

export async function validateDesignSystem(options: ValidationOptions): Promise<ValidationReport> {
	const root = await realpath(options.root);
	await checkDesignPlacement(root);

	const identity = command('git', ['log', '-1', '--format=%h %s'], root);
	const report = { root, identity, sources: 'passed' as const };
	console.log(JSON.stringify({ ...report, status: 'passed' }, null, 2));
	return report;
}

function parseArguments(args: string[]): { root: string; list: boolean } {
	let root = checkout;
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
			case '--list':
				list = true;
				break;
			default:
				throw new Error(`Unknown argument: ${args[index]}`);
		}
	}
	return { root, list };
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	if (options.list) {
		const specs = await discoverDesignSpecs(options.root);
		console.log(JSON.stringify(specs.map(({ id, path: file, title, kind, isDraft, order, hidden }) => ({
			id,
			path: file,
			title,
			kind,
			isDraft,
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
