/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { isAbsolute, posix } from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { coalesce } from '../utils/arrays';
import { exists, looksLikeAbsoluteWindowsPath } from '../utils/fs';

function mapChildren<R>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => R): R[] {
	return node && node.type === 'array' && node.children
		? node.children.map(f)
		: [];
}

const openExtendsLinkCommandId = '_typescript.openExtendsLink';

enum TsConfigLinkType {
	Extends,
	References
}

type OpenExtendsLinkCommandArgs = {
	readonly resourceUri: vscode.Uri;
	readonly extendsValue: string;
	readonly linkType: TsConfigLinkType;
};


class TsconfigLinkProvider implements vscode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.DocumentLink[] {
		const root = jsonc.parseTree(document.getText());
		if (!root) {
			return [];
		}

		return coalesce([
			this.getExtendsLink(document, root),
			...this.getFilesLinks(document, root),
			...this.getReferencesLinks(document, root)
		]);
	}

	private getExtendsLink(document: vscode.TextDocument, root: jsonc.Node): vscode.DocumentLink | undefined {
		const node = jsonc.findNodeAtLocation(root, ['extends']);
		return node && this.tryCreateTsConfigLink(document, node, TsConfigLinkType.Extends);
	}

	private getReferencesLinks(document: vscode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['references']),
			child => {
				const pathNode = jsonc.findNodeAtLocation(child, ['path']);
				return pathNode && this.tryCreateTsConfigLink(document, pathNode, TsConfigLinkType.References);
			});
	}

	private tryCreateTsConfigLink(document: vscode.TextDocument, node: jsonc.Node, linkType: TsConfigLinkType): vscode.DocumentLink | undefined {
		if (!this.isPathValue(node)) {
			return undefined;
		}

		const args: OpenExtendsLinkCommandArgs = {
			resourceUri: { ...document.uri.toJSON(), $mid: undefined },
			extendsValue: node.value,
			linkType
		};

		const link = new vscode.DocumentLink(
			this.getRange(document, node),
			vscode.Uri.parse(`command:${openExtendsLinkCommandId}?${JSON.stringify(args)}`));
		link.tooltip = vscode.l10n.t("Follow link");
		return link;
	}

	private getFilesLinks(document: vscode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['files']),
			child => this.pathNodeToLink(document, child));
	}

	private pathNodeToLink(
		document: vscode.TextDocument,
		node: jsonc.Node | undefined
	): vscode.DocumentLink | undefined {
		return this.isPathValue(node)
			? new vscode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
			: undefined;
	}

	private isPathValue(node: jsonc.Node | undefined): node is jsonc.Node {
		return node
			&& node.type === 'string'
			&& node.value
			&& !(node.value as string).includes('*'); // don't treat globs as links.
	}

	private getFileTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
		if (isAbsolute(node.value)) {
			return vscode.Uri.file(node.value);
		}

		return vscode.Uri.joinPath(Utils.dirname(document.uri), node.value);
	}

	private getRange(document: vscode.TextDocument, node: jsonc.Node) {
		const offset = node.offset;
		const start = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node.length - 1));
		return new vscode.Range(start, end);
	}
}

async function resolveNodeModulesPath(baseDirUri: vscode.Uri, pathCandidates: string[]): Promise<vscode.Uri | undefined> {
	let currentUri = baseDirUri;
	const baseCandidate = pathCandidates[0];
	const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
	const moduleBasePath = baseCandidate.split(posix.sep).slice(0, sepIndex).join(posix.sep);
	while (true) {
		const moduleAbsoluteUrl = vscode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
		let moduleStat: vscode.FileStat | undefined;
		try {
			moduleStat = await vscode.workspace.fs.stat(moduleAbsoluteUrl);
		} catch (err) {
			// noop
		}

		if (moduleStat && (moduleStat.type & vscode.FileType.Directory)) {
			for (const candidate of pathCandidates) {
				const subpath = candidate.split(posix.sep).slice(sepIndex).join(posix.sep);
				if (!subpath) {
					continue;
				}

				// Try resolving via package.json exports first
				const exportResolved = await resolveViaPackageExports(moduleAbsoluteUrl, subpath);
				if (exportResolved && await exists(exportResolved)) {
					return exportResolved;
				}

				// Fall back to direct path lookup
				const directPath = vscode.Uri.joinPath(moduleAbsoluteUrl, subpath);
				if (await exists(directPath)) {
					return directPath;
				}
			}
			// Continue to looking for potentially another version
		}

		const oldUri = currentUri;
		currentUri = vscode.Uri.joinPath(currentUri, '..');

		// Can't go next. Reached the system root
		if (oldUri.path === currentUri.path) {
			return;
		}
	}
}

/**
 * Resolve a subpath using the package.json "exports" field.
 * Supports exact matches and single-wildcard (*) patterns.
 */
async function resolveViaPackageExports(moduleUri: vscode.Uri, subpath: string): Promise<vscode.Uri | undefined> {
	const packageJsonUri = vscode.Uri.joinPath(moduleUri, 'package.json');
	let packageJson: { exports?: unknown };
	try {
		const raw = await vscode.workspace.fs.readFile(packageJsonUri);
		packageJson = JSON.parse(Buffer.from(raw).toString('utf-8'));
	} catch {
		return undefined;
	}

	if (!packageJson.exports || typeof packageJson.exports !== 'object') {
		return undefined;
	}

	const exportsMap = packageJson.exports as Record<string, unknown>;
	const subpathWithDot = `./${subpath}`;

	for (const [pattern, target] of Object.entries(exportsMap)) {
		const resolved = matchExportPattern(pattern, subpathWithDot, target);
		if (resolved) {
			// resolved is relative to the module root (e.g., "./lib/base/tsconfig.json")
			const relativePath = resolved.startsWith('./') ? resolved.slice(2) : resolved;
			return vscode.Uri.joinPath(moduleUri, relativePath);
		}
	}

	return undefined;
}

/**
 * Match a subpath against an exports pattern and return the resolved target path,
 * or undefined if the pattern does not match.
 */
function matchExportPattern(pattern: string, subpath: string, target: unknown): string | undefined {
	// Resolve conditional exports to a string target
	const targetStr = resolveExportTarget(target);
	if (!targetStr) {
		return undefined;
	}

	// Exact match
	if (pattern === subpath) {
		return targetStr;
	}

	// Wildcard pattern match (single * substitution)
	const starIndex = pattern.indexOf('*');
	if (starIndex !== -1) {
		const prefix = pattern.slice(0, starIndex);
		const suffix = pattern.slice(starIndex + 1);
		if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length) {
			const matched = subpath.slice(prefix.length, subpath.length - suffix.length);
			return targetStr.replace('*', matched);
		}
	}

	return undefined;
}

/**
 * Resolve conditional exports (objects with "types", "import", "default" keys) to a string.
 */
function resolveExportTarget(target: unknown): string | undefined {
	if (typeof target === 'string') {
		return target;
	}
	if (target && typeof target === 'object' && !Array.isArray(target)) {
		const obj = target as Record<string, unknown>;
		// Prefer types > import > require > default
		for (const key of ['types', 'import', 'require', 'default']) {
			if (key in obj) {
				return resolveExportTarget(obj[key]);
			}
		}
	}
	return undefined;
}

// Reference Extends:https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
// Reference Project References: https://github.com/microsoft/TypeScript/blob/7377f5cb9db19d79a6167065b323a45611c812b5/src/compiler/tsbuild.ts#L188C1-L194C2
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri: vscode.Uri, pathValue: string, linkType: TsConfigLinkType): Promise<vscode.Uri | undefined> {
	async function resolve(absolutePath: vscode.Uri): Promise<vscode.Uri> {
		if (absolutePath.path.endsWith('.json') || await exists(absolutePath)) {
			return absolutePath;
		}
		return absolutePath.with({
			path: `${absolutePath.path}${linkType === TsConfigLinkType.References ? '/tsconfig.json' : '.json'}`
		});
	}

	const isRelativePath = ['./', '../'].some(str => pathValue.startsWith(str));
	if (isRelativePath) {
		return resolve(vscode.Uri.joinPath(baseDirUri, pathValue));
	}

	if (pathValue.startsWith('/') || looksLikeAbsoluteWindowsPath(pathValue)) {
		return resolve(vscode.Uri.file(pathValue));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		pathValue,
		...pathValue.endsWith('.json') ? [] : [
			`${pathValue}.json`,
			`${pathValue}/tsconfig.json`,
		]
	]);
}

export function register() {
	const patterns: vscode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const languages = ['json', 'jsonc'];

	const selector: vscode.DocumentSelector =
		languages.map(language => patterns.map((pattern): vscode.DocumentFilter => ({ language, pattern })))
			.flat();

	return vscode.Disposable.from(
		vscode.commands.registerCommand(openExtendsLinkCommandId, async ({ resourceUri, extendsValue, linkType }: OpenExtendsLinkCommandArgs) => {
			const tsconfigPath = await getTsconfigPath(Utils.dirname(vscode.Uri.from(resourceUri)), extendsValue, linkType);
			if (tsconfigPath === undefined) {
				vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve {0} as module", extendsValue));
				return;
			}
			// Will suggest to create a .json variant if it doesn't exist yet (but only for relative paths)
			await vscode.commands.executeCommand('vscode.open', tsconfigPath);
		}),
		vscode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider()),
	);
}
