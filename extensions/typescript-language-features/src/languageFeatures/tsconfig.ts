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
import { resolvePackageJsonExports } from '../utils/packageExports';

function mapChildren<R>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => R): R[] {
	return node && node.type === 'array' && node.children
		? node.children.map(f)
		: [];
}

const maxPackageJsonCacheEntries = 100;
const packageJsonCache = new Map<string, { exports?: unknown }>();

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
			for (const uriCandidate of pathCandidates
				.map((relativePath) => relativePath.split(posix.sep).slice(sepIndex).join(posix.sep))
				// skip empty paths within module
				.filter(Boolean)
				.map((relativeModulePath) => vscode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))
			) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
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
 * Splits a Node module specifier into the package name and the (posix) subpath.
 *
 * @example
 * - `lodash/fp` => { packageName: 'lodash', subpath: 'fp' }
 * - `@scope/pkg/base/tsconfig.json` => { packageName: '@scope/pkg', subpath: 'base/tsconfig.json' }
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_RESOLVE)
 */
function parseNodeModuleSpecifier(specifier: string): { packageName: string; subpath: string } | undefined {
	const parts = specifier.split(posix.sep).filter(Boolean);
	if (!parts.length) {
		return undefined;
	}

	if (parts[0].startsWith('@')) {
		if (parts.length < 2) {
			return undefined;
		}
		return {
			packageName: `${parts[0]}/${parts[1]}`,
			subpath: parts.slice(2).join(posix.sep)
		};
	}

	return {
		packageName: parts[0],
		subpath: parts.slice(1).join(posix.sep)
	};
}

/**
 * Walks up from `baseDirUri` and looks for `node_modules/<packageName>`.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_RESOLVE)
 */
async function findNodeModulePackageRoot(baseDirUri: vscode.Uri, packageName: string): Promise<vscode.Uri | undefined> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(baseDirUri);
	const workspaceRoot = workspaceFolder?.uri?.toString();

	let currentUri = baseDirUri;
	while (true) {
		const candidate = vscode.Uri.joinPath(currentUri, 'node_modules', ...packageName.split(posix.sep));
		try {
			const stat = await vscode.workspace.fs.stat(candidate);
			if (stat.type & vscode.FileType.Directory) {
				return candidate;
			}
		} catch {
			// noop
		}

		const oldUri = currentUri;
		currentUri = vscode.Uri.joinPath(currentUri, '..');

		// Stop at workspace or system root
		if (oldUri.toString() === workspaceRoot || oldUri.path === currentUri.path) {
			return undefined;
		}
	}
}

/**
 * Reads and parses `<packageRoot>/package.json`.
 *
 * Note: For this feature we use a permissive JSONC parser and ignore parse errors,
 * because the goal is best-effort link resolution.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (READ_PACKAGE_JSON)
 */
async function tryReadPackageJson(packageRoot: vscode.Uri): Promise<{ exports?: unknown } | undefined> {
	const packageJsonUri = vscode.Uri.joinPath(packageRoot, 'package.json');
	try {
		const stat = await vscode.workspace.fs.stat(packageJsonUri);
		const cacheKey = `${packageJsonUri.toString()}@${stat.mtime}`;
		const cached = packageJsonCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const bytes = await vscode.workspace.fs.readFile(packageJsonUri);
		const text = new TextDecoder('utf-8').decode(bytes);
		const parsed = jsonc.parse(text, [], { allowTrailingComma: true });
		if (typeof parsed !== 'object' || parsed === null) {
			return undefined;
		}

		const value = parsed as { exports?: unknown };
		packageJsonCache.set(cacheKey, value);

		while (packageJsonCache.size > maxPackageJsonCacheEntries) {
			const oldestKey = packageJsonCache.keys().next().value as string | undefined;
			if (!oldestKey) {
				break;
			}
			packageJsonCache.delete(oldestKey);
		}

		return value;
	} catch {
		return undefined;
	}
}

/**
 * Resolve a module specifier using `package.json#exports`.
 *
 * This is used for `tsconfig.json` `extends` links so that the link resolution
 * matches Node/TypeScript behavior when packages use `exports` subpath remapping.
 *
 * @see https://nodejs.org/api/packages.html#package-entry-points
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_RESOLVE)
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_EXPORTS_RESOLVE)
 */
export async function resolveNodeModulePathUsingExports(baseDirUri: vscode.Uri, specifier: string): Promise<vscode.Uri | undefined> {
	const parsed = parseNodeModuleSpecifier(specifier);
	if (!parsed) {
		return undefined;
	}

	const packageRoot = await findNodeModulePackageRoot(baseDirUri, parsed.packageName);
	if (!packageRoot) {
		return undefined;
	}

	const packageJson = await tryReadPackageJson(packageRoot);
	const subpath = parsed.subpath ? `./${parsed.subpath}` : '.';
	const resolvedTarget = resolvePackageJsonExports(packageJson?.exports, subpath, ['node', 'import'])
		?? resolvePackageJsonExports(packageJson?.exports, subpath, ['node', 'require']);
	if (!resolvedTarget) {
		return undefined;
	}

	const normalized = resolvedTarget.startsWith('./') ? resolvedTarget.slice(2) : resolvedTarget;
	if (!normalized) {
		return undefined;
	}

	const targetUri = vscode.Uri.joinPath(packageRoot, normalized);
	return await exists(targetUri) ? targetUri : undefined;
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
	const exportsResolved = await resolveNodeModulePathUsingExports(baseDirUri, pathValue);
	if (exportsResolved) {
		return exportsResolved;
	}

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
