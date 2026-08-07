/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as arrays from './util/arrays';
import { Disposable } from './util/dispose';

function resolveExtensionResource(extension: vscode.Extension<any>, resourcePath: string): vscode.Uri {
	return vscode.Uri.joinPath(extension.extensionUri, resourcePath);
}

function* resolveExtensionResources(extension: vscode.Extension<any>, resourcePaths: unknown): Iterable<vscode.Uri> {
	if (Array.isArray(resourcePaths)) {
		for (const resource of resourcePaths) {
			try {
				yield resolveExtensionResource(extension, resource);
			} catch {
				// noop
			}
		}
	}
}

export interface MarkdownPreviewScript {
	readonly resource: vscode.Uri;
	readonly type?: 'module';
}

export type MarkdownCodeBlockEditorSelector =
	| { readonly language: string; readonly languagePrefix?: never }
	| { readonly language?: never; readonly languagePrefix: string };

export interface MarkdownCodeBlockEditorSandbox {
	readonly forms?: boolean;
	readonly downloads?: boolean;
	readonly pointerLock?: boolean;
	readonly clipboardWrite?: boolean;
}

export type MarkdownCodeBlockEditorSource =
	| { readonly kind: 'static'; readonly resource: vscode.Uri }
	| { readonly kind: 'exportApi'; readonly apiVersion: number };

export interface MarkdownCodeBlockEditorProvider {
	readonly id: string;
	readonly providerId: string;
	readonly extension: vscode.Extension<unknown>;
	readonly extensionVersion: string;
	readonly selector: MarkdownCodeBlockEditorSelector;
	readonly source: MarkdownCodeBlockEditorSource;
	readonly contentType: 'text' | 'json';
	readonly initialHeight?: number;
	readonly sandbox?: MarkdownCodeBlockEditorSandbox;
}

export interface MarkdownContributions {
	readonly previewScripts: readonly MarkdownPreviewScript[];
	readonly previewStyles: readonly vscode.Uri[];
	readonly previewResourceRoots: readonly vscode.Uri[];
	readonly markdownItPlugins: ReadonlyMap<string, Thenable<(md: any) => any>>;
	readonly codeBlockEditorProviders: readonly MarkdownCodeBlockEditorProvider[];
}

export namespace MarkdownContributions {
	export const Empty: MarkdownContributions = {
		previewScripts: [],
		previewStyles: [],
		previewResourceRoots: [],
		markdownItPlugins: new Map(),
		codeBlockEditorProviders: [],
	};

	export function merge(a: MarkdownContributions, b: MarkdownContributions): MarkdownContributions {
		return {
			previewScripts: [...a.previewScripts, ...b.previewScripts],
			previewStyles: [...a.previewStyles, ...b.previewStyles],
			previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
			markdownItPlugins: new Map([...a.markdownItPlugins.entries(), ...b.markdownItPlugins.entries()]),
			codeBlockEditorProviders: [...a.codeBlockEditorProviders, ...b.codeBlockEditorProviders],
		};
	}

	function uriEqual(a: vscode.Uri, b: vscode.Uri): boolean {
		return a.toString() === b.toString();
	}

	function previewScriptEqual(a: MarkdownPreviewScript, b: MarkdownPreviewScript): boolean {
		return uriEqual(a.resource, b.resource) && a.type === b.type;
	}

	export function equal(a: MarkdownContributions, b: MarkdownContributions): boolean {
		return arrays.equals(a.previewScripts, b.previewScripts, previewScriptEqual)
			&& arrays.equals(a.previewStyles, b.previewStyles, uriEqual)
			&& arrays.equals(a.previewResourceRoots, b.previewResourceRoots, uriEqual)
			&& arrays.equals(Array.from(a.markdownItPlugins.keys()), Array.from(b.markdownItPlugins.keys()))
			&& arrays.equals(a.codeBlockEditorProviders, b.codeBlockEditorProviders, (x, y) =>
				x.id === y.id
				&& x.providerId === y.providerId
				&& x.extension.id === y.extension.id
				&& x.extensionVersion === y.extensionVersion
				&& selectorEqual(x.selector, y.selector)
				&& sourceEqual(x.source, y.source)
				&& x.contentType === y.contentType
				&& x.initialHeight === y.initialHeight
				&& sandboxEqual(x.sandbox, y.sandbox));
	}

	export function fromExtension(extension: vscode.Extension<any>): MarkdownContributions {
		const contributions = extension.packageJSON?.contributes;
		if (!contributions) {
			return MarkdownContributions.Empty;
		}

		const previewStyles = Array.from(getContributedStyles(contributions, extension));
		const previewScripts = Array.from(getContributedScripts(contributions, extension));
		const previewResourceRoots = previewStyles.length || previewScripts.length ? [extension.extensionUri] : [];
		const markdownItPlugins = getContributedMarkdownItPlugins(contributions, extension);
		const codeBlockEditorProviders = Array.from(getContributedCodeBlockEditorProviders(contributions, extension));

		return {
			previewScripts,
			previewStyles,
			previewResourceRoots,
			markdownItPlugins,
			codeBlockEditorProviders,
		};
	}

	function getContributedMarkdownItPlugins(
		contributes: any,
		extension: vscode.Extension<any>
	): Map<string, Thenable<(md: any) => any>> {
		const map = new Map<string, Thenable<(md: any) => any>>();
		if (contributes['markdown.markdownItPlugins']) {
			map.set(extension.id, extension.activate().then(() => {
				if (extension.exports?.extendMarkdownIt) {
					return (md: any) => extension.exports.extendMarkdownIt(md);
				}
				return (md: any) => md;
			}));
		}
		return map;
	}

	function getContributedScripts(
		contributes: any,
		extension: vscode.Extension<any>
	): Iterable<MarkdownPreviewScript> {
		return resolvePreviewScripts(extension, contributes['markdown.previewScripts']);
	}

	function getContributedStyles(
		contributes: any,
		extension: vscode.Extension<any>
	) {
		return resolveExtensionResources(extension, contributes['markdown.previewStyles']);
	}

	function* getContributedCodeBlockEditorProviders(
		contributes: any,
		extension: vscode.Extension<unknown>
	): Iterable<MarkdownCodeBlockEditorProvider> {
		yield* getLegacyCodeBlockEditors(contributes, extension);

		const providers = contributes['markdown.codeBlockEditorProviders'];
		if (!Array.isArray(providers)) {
			return;
		}
		for (const value of providers) {
			if (!value || typeof value !== 'object') {
				continue;
			}
			const provider = value as Record<string, unknown>;
			const selector = readCodeBlockEditorSelector(provider.selector);
			const source = readCodeBlockEditorSource(provider.source, extension);
			if (
				typeof provider.id !== 'string'
				|| !selector
				|| !source
				|| (provider.contentType !== undefined && provider.contentType !== 'text' && provider.contentType !== 'json')
				|| (provider.initialHeight !== undefined && !isPositiveNumber(provider.initialHeight))
			) {
				continue;
			}
			yield {
				id: `${extension.id}/${provider.id}`,
				providerId: provider.id,
				extension,
				extensionVersion: typeof extension.packageJSON?.version === 'string' ? extension.packageJSON.version : '',
				selector,
				source,
				contentType: provider.contentType ?? 'text',
				initialHeight: provider.initialHeight as number | undefined,
				sandbox: readSandbox(provider.sandbox),
			};
		}
	}

	function* getLegacyCodeBlockEditors(
		contributes: any,
		extension: vscode.Extension<unknown>
	): Iterable<MarkdownCodeBlockEditorProvider> {
		const editors = contributes['markdown.codeBlockEditors'];
		if (!Array.isArray(editors)) {
			return;
		}
		for (const value of editors) {
			if (!value || typeof value !== 'object') {
				continue;
			}
			const editor = value as Record<string, unknown>;
			if (
				typeof editor.id !== 'string'
				|| typeof editor.language !== 'string'
				|| typeof editor.entrypoint !== 'string'
				|| (editor.contentType !== undefined && editor.contentType !== 'text' && editor.contentType !== 'json')
			) {
				continue;
			}
			yield {
				id: `${extension.id}/${editor.id}`,
				providerId: editor.id,
				extension,
				extensionVersion: typeof extension.packageJSON?.version === 'string' ? extension.packageJSON.version : '',
				selector: { language: editor.language },
				source: {
					kind: 'static',
					resource: resolveExtensionResource(extension, editor.entrypoint),
				},
				contentType: editor.contentType ?? 'text',
			};
		}
	}

	function readCodeBlockEditorSelector(value: unknown): MarkdownCodeBlockEditorSelector | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const selector = value as Record<string, unknown>;
		const language = typeof selector.language === 'string' && selector.language.length > 0 ? selector.language : undefined;
		const languagePrefix = typeof selector.languagePrefix === 'string' && selector.languagePrefix.length > 0 ? selector.languagePrefix : undefined;
		if ((language === undefined) === (languagePrefix === undefined)) {
			return undefined;
		}
		if (language !== undefined) {
			return { language };
		}
		return languagePrefix !== undefined ? { languagePrefix } : undefined;
	}

	function readCodeBlockEditorSource(value: unknown, extension: vscode.Extension<unknown>): MarkdownCodeBlockEditorSource | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const source = value as Record<string, unknown>;
		if (source.kind === 'exportApi' && isPositiveInteger(source.apiVersion)) {
			return { kind: 'exportApi', apiVersion: source.apiVersion };
		}
		if (source.kind === 'static' && typeof source.entrypoint === 'string') {
			return { kind: 'static', resource: resolveExtensionResource(extension, source.entrypoint) };
		}
		return undefined;
	}

	function readSandbox(value: unknown): MarkdownCodeBlockEditorSandbox | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const sandbox = value as Record<string, unknown>;
		return {
			forms: sandbox.forms === true,
			downloads: sandbox.downloads === true,
			pointerLock: sandbox.pointerLock === true,
			clipboardWrite: sandbox.clipboardWrite === true,
		};
	}

	function isPositiveNumber(value: unknown): value is number {
		return typeof value === 'number' && Number.isFinite(value) && value > 0;
	}

	function isPositiveInteger(value: unknown): value is number {
		return isPositiveNumber(value) && Number.isInteger(value);
	}

	function selectorEqual(a: MarkdownCodeBlockEditorSelector, b: MarkdownCodeBlockEditorSelector): boolean {
		return a.language === b.language && a.languagePrefix === b.languagePrefix;
	}

	function sourceEqual(a: MarkdownCodeBlockEditorSource, b: MarkdownCodeBlockEditorSource): boolean {
		if (a.kind !== b.kind) {
			return false;
		}
		return a.kind === 'static'
			? b.kind === 'static' && uriEqual(a.resource, b.resource)
			: b.kind === 'exportApi' && a.apiVersion === b.apiVersion;
	}

	function sandboxEqual(a: MarkdownCodeBlockEditorSandbox | undefined, b: MarkdownCodeBlockEditorSandbox | undefined): boolean {
		return a?.forms === b?.forms
			&& a?.downloads === b?.downloads
			&& a?.pointerLock === b?.pointerLock
			&& a?.clipboardWrite === b?.clipboardWrite;
	}

	function* resolvePreviewScripts(extension: vscode.Extension<any>, scripts: unknown): Iterable<MarkdownPreviewScript> {
		if (!Array.isArray(scripts)) {
			return;
		}

		for (const script of scripts) {
			const contribution = getPreviewScriptContribution(script);
			if (!contribution) {
				continue;
			}

			try {
				yield {
					resource: resolveExtensionResource(extension, contribution.path),
					type: contribution.type,
				};
			} catch {
				// noop
			}
		}
	}

	function getPreviewScriptContribution(script: unknown): { path: string; type?: MarkdownPreviewScript['type'] } | undefined {
		if (typeof script === 'string') {
			return { path: script };
		}

		if (!script || typeof script !== 'object') {
			return undefined;
		}

		const contribution = script as Record<string, unknown>;
		if (typeof contribution.path !== 'string') {
			return undefined;
		}

		return {
			path: contribution.path,
			type: contribution.type === 'module' ? contribution.type : undefined,
		};
	}
}

export interface MarkdownContributionProvider {
	readonly extensionUri: vscode.Uri;

	readonly contributions: MarkdownContributions;
	readonly onContributionsChanged: vscode.Event<this>;

	dispose(): void;
}

class VSCodeExtensionMarkdownContributionProvider extends Disposable implements MarkdownContributionProvider {

	#contributions?: MarkdownContributions;
	readonly #extensionContext: vscode.ExtensionContext;

	public constructor(
		extensionContext: vscode.ExtensionContext,
	) {
		super();
		this.#extensionContext = extensionContext;

		this._register(vscode.extensions.onDidChange(() => {
			const currentContributions = this.#getCurrentContributions();
			const existingContributions = this.#contributions || MarkdownContributions.Empty;
			if (!MarkdownContributions.equal(existingContributions, currentContributions)) {
				this.#contributions = currentContributions;
				this.#onContributionsChanged.fire(this);
			}
		}));
	}

	public get extensionUri() {
		return this.#extensionContext.extensionUri;
	}

	readonly #onContributionsChanged = this._register(new vscode.EventEmitter<this>());
	public readonly onContributionsChanged = this.#onContributionsChanged.event;

	public get contributions(): MarkdownContributions {
		this.#contributions ??= this.#getCurrentContributions();
		return this.#contributions;
	}

	#getCurrentContributions(): MarkdownContributions {
		return vscode.extensions.all
			.map(MarkdownContributions.fromExtension)
			.reduce(MarkdownContributions.merge, MarkdownContributions.Empty);
	}
}

export function getMarkdownExtensionContributions(context: vscode.ExtensionContext): MarkdownContributionProvider {
	return new VSCodeExtensionMarkdownContributionProvider(context);
}
