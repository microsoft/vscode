/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import type {
	EditorCommandDefinition,
	EditorCommandKeybinding,
	KeyboardPlatform,
} from '@vscode/markdown-editor/commands';

const GENERATED_MARKER = '$generated';
const MARKDOWN_EDITOR_COMMAND_ID_PREFIX = 'markdown.editor.';
const GENERATED_COMMAND_TITLE_SUFFIX = '.title';
const GENERATED_COMMAND_TITLE_COMMENT = 'Generated from @vscode/markdown-editor/commands. Do not edit manually.';
const MARKDOWN_EDITOR_ACTIVE = `activeCustomEditorId == 'vscode.markdown.editor'`;
const MARKDOWN_EDITOR_KEYBINDING = `${MARKDOWN_EDITOR_ACTIVE} && markdownEditorFocus`;
const PACKAGE_JSON_UPDATE_DEBOUNCE_MS = 2_000;

interface GeneratedItem {
	readonly $generated: true;
}

interface CommandContribution extends GeneratedItem {
	readonly command: string;
	readonly title: string;
	readonly category: string;
	readonly enablement: string;
}

interface KeybindingContribution extends GeneratedItem {
	readonly command: string;
	readonly key: string;
	readonly when: string;
}

interface CommandPaletteContribution extends GeneratedItem {
	readonly command: string;
	readonly when: 'false';
}

interface PackageJson {
	readonly contributes?: {
		readonly commands?: readonly Record<string, unknown>[];
		readonly keybindings?: readonly Record<string, unknown>[];
		readonly menus?: {
			readonly commandPalette?: readonly Record<string, unknown>[];
			readonly [key: string]: unknown;
		};
		readonly [key: string]: unknown;
	};
	readonly [key: string]: unknown;
}

interface PackageNlsMessage {
	readonly message: string;
	readonly comment: readonly string[];
	readonly $generated?: true;
}

type PackageNlsJson = Readonly<Record<string, string | PackageNlsMessage>>;

type JsonUpdate<T> =
	| { readonly kind: 'unchanged' }
	| { readonly kind: 'updated'; readonly value: T };

export type PackageJsonUpdate = JsonUpdate<PackageJson>;
export type PackageNlsJsonUpdate = JsonUpdate<PackageNlsJson>;

export function updatePackageJson(
	currentPackageJson: PackageJson,
	commandDefinitions: readonly EditorCommandDefinition[],
): PackageJsonUpdate {
	const hostCommands = commandDefinitions.filter(command => command.routing !== 'local');
	const generatedCommands: readonly CommandContribution[] = commandDefinitions.map(command => ({
		command: command.id,
		title: `%${commandTitleLocalizationKey(command)}%`,
		category: 'Markdown Editor',
		enablement: MARKDOWN_EDITOR_ACTIVE,
		$generated: true,
	}));
	const generatedKeybindings: readonly KeybindingContribution[] = hostCommands.flatMap(command =>
		command.keybindings.map(keybinding => ({
			command: command.id,
			key: toVsCodeKeybinding(keybinding),
			when: combineWhenClauses(MARKDOWN_EDITOR_KEYBINDING, platformWhenClause(keybinding.platforms)),
			$generated: true as const,
		}))
	);
	const generatedCommandPaletteEntries: readonly CommandPaletteContribution[] = commandDefinitions.map(command => ({
		command: command.id,
		when: 'false',
		$generated: true,
	}));

	const contributes = currentPackageJson.contributes ?? {};
	const commands = replaceGeneratedItems(
		contributes.commands ?? [],
		generatedCommands,
		item => String(item.command ?? ''),
		'command',
	);
	const keybindings = replaceGeneratedItems(
		contributes.keybindings ?? [],
		generatedKeybindings,
		item => JSON.stringify([item.command, item.key, item.when]),
		'keybinding',
	);
	const menus = contributes.menus ?? {};
	const commandPalette = replaceGeneratedItems(
		menus.commandPalette ?? [],
		generatedCommandPaletteEntries,
		item => String(item.command ?? ''),
		'Command Palette entry',
	);
	const updatedPackageJson: PackageJson = {
		...currentPackageJson,
		contributes: {
			...contributes,
			commands,
			keybindings,
			menus: {
				...menus,
				commandPalette,
			},
		},
	};

	return JSON.stringify(updatedPackageJson) === JSON.stringify(currentPackageJson)
		? { kind: 'unchanged' }
		: { kind: 'updated', value: updatedPackageJson };
}

export function updatePackageNlsJson(
	currentPackageNlsJson: PackageNlsJson,
	commandDefinitions: readonly EditorCommandDefinition[],
): PackageNlsJsonUpdate {
	const currentEntries = Object.entries(currentPackageNlsJson);
	const firstGeneratedIndex = currentEntries.findIndex(([key]) => isGeneratedCommandTitleLocalizationKey(key));
	const manualEntries = currentEntries.filter(([key]) => !isGeneratedCommandTitleLocalizationKey(key));
	const generatedEntries = commandDefinitions.map(command => [commandTitleLocalizationKey(command), {
		message: command.title,
		comment: [GENERATED_COMMAND_TITLE_COMMENT],
		$generated: true,
	}] as const);
	const insertionIndex = firstGeneratedIndex < 0
		? manualEntries.length
		: Math.min(firstGeneratedIndex, manualEntries.length);
	const updatedPackageNlsJson = Object.fromEntries([
		...manualEntries.slice(0, insertionIndex),
		...generatedEntries,
		...manualEntries.slice(insertionIndex),
	]);

	return JSON.stringify(updatedPackageNlsJson) === JSON.stringify(currentPackageNlsJson)
		? { kind: 'unchanged' }
		: { kind: 'updated', value: updatedPackageNlsJson };
}

function replaceGeneratedItems<T extends Record<string, unknown>>(
	currentItems: readonly Record<string, unknown>[],
	generatedItems: readonly T[],
	identity: (item: Record<string, unknown>) => string,
	kind: string,
): readonly Record<string, unknown>[] {
	const firstGeneratedIndex = currentItems.findIndex(isGenerated);
	const manualItems = currentItems.filter(item => !isGenerated(item));
	const manualIdentities = new Set(manualItems.map(identity));
	const generatedIdentities = new Set<string>();
	for (const item of generatedItems) {
		const itemIdentity = identity(item);
		if (generatedIdentities.has(itemIdentity)) {
			throw new Error(`Cannot generate duplicate Markdown editor ${kind} '${itemIdentity}'.`);
		}
		generatedIdentities.add(itemIdentity);
		if (manualIdentities.has(itemIdentity)) {
			throw new Error(`Cannot generate Markdown editor ${kind} '${itemIdentity}' because a manual entry already exists.`);
		}
	}

	const insertionIndex = firstGeneratedIndex < 0
		? manualItems.length
		: Math.min(firstGeneratedIndex, manualItems.length);
	return [
		...manualItems.slice(0, insertionIndex),
		...generatedItems,
		...manualItems.slice(insertionIndex),
	];
}

function isGenerated(item: Record<string, unknown>): boolean {
	return item[GENERATED_MARKER] === true;
}

function commandTitleLocalizationKey(command: EditorCommandDefinition): string {
	return `${command.id}${GENERATED_COMMAND_TITLE_SUFFIX}`;
}

function isGeneratedCommandTitleLocalizationKey(key: string): boolean {
	return key.startsWith(MARKDOWN_EDITOR_COMMAND_ID_PREFIX) && key.endsWith(GENERATED_COMMAND_TITLE_SUFFIX);
}

function toVsCodeKeybinding(binding: EditorCommandKeybinding): string {
	const result: string[] = [];
	if (binding.modifiers?.ctrl) { result.push('ctrl'); }
	if (binding.modifiers?.shift) { result.push('shift'); }
	if (binding.modifiers?.alt) { result.push('alt'); }
	if (binding.modifiers?.meta) { result.push('cmd'); }
	result.push(toVsCodeKey(binding.key));
	return result.join('+');
}

function toVsCodeKey(key: string): string {
	switch (key) {
		case 'ArrowLeft': return 'left';
		case 'ArrowRight': return 'right';
		case 'ArrowUp': return 'up';
		case 'ArrowDown': return 'down';
		default: return key.toLowerCase();
	}
}

function platformWhenClause(platforms: readonly KeyboardPlatform[] | undefined): string | undefined {
	if (!platforms || platforms.length === 3) {
		return undefined;
	}
	const platformClauses = platforms.map(platform => {
		switch (platform) {
			case 'macos': return 'isMac';
			case 'windows': return 'isWindows';
			case 'linux': return 'isLinux';
		}
	});
	if (platformClauses.length === 2 && !platforms.includes('macos')) {
		return '!isMac';
	}
	return platformClauses.length === 1
		? platformClauses[0]
		: `(${platformClauses.join(' || ')})`;
}

function combineWhenClauses(...clauses: readonly (string | undefined)[]): string {
	return clauses.filter((clause): clause is string => clause !== undefined).join(' && ');
}

const updateManifestFilesDebounced = debounceAsync(
	() => updateManifestFilesNow('write'),
	PACKAGE_JSON_UPDATE_DEBOUNCE_MS,
);

export function updateMarkdownEditorManifestFiles(mode: 'write' | 'check'): Promise<'unchanged' | 'updated'> {
	return mode === 'write'
		? updateManifestFilesDebounced()
		: updateManifestFilesNow(mode);
}

async function updateManifestFilesNow(mode: 'write' | 'check'): Promise<'unchanged' | 'updated'> {
	const packageJsonPath = path.resolve(import.meta.dirname, '..', 'package.json');
	const packageNlsJsonPath = path.resolve(import.meta.dirname, '..', 'package.nls.json');
	const [currentPackageJsonText, currentPackageNlsJsonText] = await Promise.all([
		readFile(packageJsonPath, 'utf8'),
		readFile(packageNlsJsonPath, 'utf8'),
	]);
	const currentPackageJson = JSON.parse(currentPackageJsonText) as PackageJson;
	const currentPackageNlsJson = JSON.parse(currentPackageNlsJsonText) as PackageNlsJson;
	const commandDefinitions = await loadCommandDefinitions();
	const packageJsonUpdate = updatePackageJson(currentPackageJson, commandDefinitions);
	const packageNlsJsonUpdate = updatePackageNlsJson(currentPackageNlsJson, commandDefinitions);
	if (packageJsonUpdate.kind === 'unchanged' && packageNlsJsonUpdate.kind === 'unchanged') {
		return 'unchanged';
	}
	if (mode === 'check') {
		throw new Error('package.json or package.nls.json is out of date. Run npm run update-markdown-editor-package-json.');
	}
	await Promise.all([
		packageJsonUpdate.kind === 'updated'
			? writeJsonFile(packageJsonPath, currentPackageJsonText, packageJsonUpdate.value)
			: undefined,
		packageNlsJsonUpdate.kind === 'updated'
			? writeJsonFile(packageNlsJsonPath, currentPackageNlsJsonText, packageNlsJsonUpdate.value)
			: undefined,
	]);
	return 'updated';
}

function writeJsonFile(filePath: string, currentText: string, value: object): Promise<void> {
	const newline = currentText.includes('\r\n') ? '\r\n' : '\n';
	const indentation = currentText.match(/^[\t ]+(?=")/m)?.[0] ?? '\t';
	const updatedText = `${JSON.stringify(value, null, indentation)}\n`.replaceAll('\n', newline);
	return writeFile(filePath, updatedText);
}

export function debounceAsync<T>(callback: () => Promise<T>, delay: number): () => Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let pending: {
		readonly promise: Promise<T>;
		readonly resolve: (value: T) => void;
		readonly reject: (error: unknown) => void;
	} | undefined;

	return () => {
		if (!pending) {
			let resolve!: (value: T) => void;
			let reject!: (error: unknown) => void;
			const promise = new Promise<T>((promiseResolve, promiseReject) => {
				resolve = promiseResolve;
				reject = promiseReject;
			});
			pending = { promise, resolve, reject };
		}

		if (timeout) {
			clearTimeout(timeout);
		}
		const current = pending;
		timeout = setTimeout(async () => {
			timeout = undefined;
			pending = undefined;
			try {
				current.resolve(await callback());
			} catch (error) {
				current.reject(error);
			}
		}, delay);
		return current.promise;
	};
}

async function loadCommandDefinitions(): Promise<readonly EditorCommandDefinition[]> {
	const commandsUrl = import.meta.resolve('@vscode/markdown-editor/commands');
	const commandsPath = fileURLToPath(commandsUrl);
	const version = (await stat(commandsPath)).mtimeMs;
	const module = await import(`${commandsUrl}?version=${version}`) as {
		readonly commands: readonly EditorCommandDefinition[];
	};
	return module.commands;
}

async function main(): Promise<void> {
	const argument = process.argv[2] ?? '--write';
	if (argument !== '--write' && argument !== '--check') {
		throw new Error(`Unknown argument '${argument}'. Expected --write or --check.`);
	}
	const result = await updateMarkdownEditorManifestFiles(argument === '--check' ? 'check' : 'write');
	console.log(`Markdown editor manifests: ${result}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(error => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
