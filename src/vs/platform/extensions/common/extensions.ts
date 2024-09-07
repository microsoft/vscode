/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from '../../../base/common/severity.js';
import * as strings from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { ILocalizedString } from '../../action/common/action.js';
import { ExtensionKind } from '../../environment/common/environment.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getRemoteName } from '../../remote/common/remoteHosts.js';

export const USER_MANIFEST_CACHE_FILE = 'extensions.user.cache';
export const BUILTIN_MANIFEST_CACHE_FILE = 'extensions.builtin.cache';
export const UNDEFINED_PUBLISHER = 'undefined_publisher';

export interface ICommand {
	command: string;
	title: string | ILocalizedString;
	category?: string | ILocalizedString;
}

export interface IDebugger {
	label?: string;
	type: string;
	runtime?: string;
}

export interface IGrammar {
	language?: string;
}

export interface IJSONValidation {
	fileMatch: string | string[];
	url: string;
}

export interface IKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

export interface ILanguage {
	id: string;
	extensions: string[];
	aliases: string[];
}

export interface IMenu {
	command: string;
	alt?: string;
	when?: string;
	group?: string;
}

export interface ISnippet {
	language: string;
}

export interface ITheme {
	label: string;
}

export interface IViewContainer {
	id: string;
	title: string;
}

export interface IView {
	id: string;
	name: string;
}

export interface IColor {
	id: string;
	description: string;
	defaults: { light: string; dark: string; highContrast: string };
}

interface IWebviewEditor {
	readonly viewType: string;
	readonly priority: string;
	readonly selector: readonly {
		readonly filenamePattern?: string;
	}[];
}

export interface ICodeActionContributionAction {
	readonly kind: string;
	readonly title: string;
	readonly description?: string;
}

export interface ICodeActionContribution {
	readonly languages: readonly string[];
	readonly actions: readonly ICodeActionContributionAction[];
}

export interface IAuthenticationContribution {
	readonly id: string;
	readonly label: string;
}

export interface IWalkthroughStep {
	readonly id: string;
	readonly title: string;
	readonly description: string | undefined;
	readonly media:
	| { image: string | { dark: string; light: string; hc: string }; altText: string; markdown?: never; svg?: never }
	| { markdown: string; image?: never; svg?: never }
	| { svg: string; altText: string; markdown?: never; image?: never };
	readonly completionEvents?: string[];
	/** @deprecated use `completionEvents: 'onCommand:...'` */
	readonly doneOn?: { command: string };
	readonly when?: string;
}

export interface IWalkthrough {
	readonly id: string;
	readonly title: string;
	readonly icon?: string;
	readonly description: string;
	readonly steps: IWalkthroughStep[];
	readonly featuredFor: string[] | undefined;
	readonly when?: string;
}

export interface IStartEntry {
	readonly title: string;
	readonly description: string;
	readonly command: string;
	readonly when?: string;
	readonly category: 'file' | 'folder' | 'notebook';
}

export interface INotebookEntry {
	readonly type: string;
	readonly displayName: string;
}

export interface INotebookRendererContribution {
	readonly id: string;
	readonly displayName: string;
	readonly mimeTypes: string[];
}

export interface IDebugVisualizationContribution {
	readonly id: string;
	readonly when: string;
}

export interface ITranslation {
	id: string;
	path: string;
}

export interface ILocalizationContribution {
	languageId: string;
	languageName?: string;
	localizedLanguageName?: string;
	translations: ITranslation[];
	minimalTranslations?: { [key: string]: string };
}

export interface IExtensionContributions {
	commands?: ICommand[];
	configuration?: any;
	debuggers?: IDebugger[];
	grammars?: IGrammar[];
	jsonValidation?: IJSONValidation[];
	keybindings?: IKeyBinding[];
	languages?: ILanguage[];
	menus?: { [context: string]: IMenu[] };
	snippets?: ISnippet[];
	themes?: ITheme[];
	iconThemes?: ITheme[];
	productIconThemes?: ITheme[];
	viewsContainers?: { [location: string]: IViewContainer[] };
	views?: { [location: string]: IView[] };
	colors?: IColor[];
	localizations?: ILocalizationContribution[];
	readonly customEditors?: readonly IWebviewEditor[];
	readonly codeActions?: readonly ICodeActionContribution[];
	authentication?: IAuthenticationContribution[];
	walkthroughs?: IWalkthrough[];
	startEntries?: IStartEntry[];
	readonly notebooks?: INotebookEntry[];
	readonly notebookRenderer?: INotebookRendererContribution[];
	readonly debugVisualizers?: IDebugVisualizationContribution[];
	readonly chatParticipants?: ReadonlyArray<{ id: string }>;
}

export interface IExtensionCapabilities {
	readonly virtualWorkspaces?: ExtensionVirtualWorkspaceSupport;
	readonly untrustedWorkspaces?: ExtensionUntrustedWorkspaceSupport;
}


export const ALL_EXTENSION_KINDS: readonly ExtensionKind[] = ['ui', 'workspace', 'web'];

export type LimitedWorkspaceSupportType = 'limited';
export type ExtensionUntrustedWorkspaceSupportType = boolean | LimitedWorkspaceSupportType;
export type ExtensionUntrustedWorkspaceSupport = { supported: true } | { supported: false; description: string } | { supported: LimitedWorkspaceSupportType; description: string; restrictedConfigurations?: string[] };

export type ExtensionVirtualWorkspaceSupportType = boolean | LimitedWorkspaceSupportType;
export type ExtensionVirtualWorkspaceSupport = boolean | { supported: true } | { supported: false | LimitedWorkspaceSupportType; description: string };

export function getWorkspaceSupportTypeMessage(supportType: ExtensionUntrustedWorkspaceSupport | ExtensionVirtualWorkspaceSupport | undefined): string | undefined {
	if (typeof supportType === 'object' && supportType !== null) {
		if (supportType.supported !== true) {
			return supportType.description;
		}
	}
	return undefined;
}


export interface IExtensionIdentifier {
	id: string;
	uuid?: string;
}

export const EXTENSION_CATEGORIES = [
	'AI',
	'Azure',
	'Chat',
	'Data Science',
	'Debuggers',
	'Extension Packs',
	'Education',
	'Formatters',
	'Keymaps',
	'Language Packs',
	'Linters',
	'Machine Learning',
	'Notebooks',
	'Programming Languages',
	'SCM Providers',
	'Snippets',
	'Testing',
	'Themes',
	'Visualization',
	'Other',
];

export interface IRelaxedExtensionManifest {
	name: string;
	displayName?: string;
	publisher: string;
	version: string;
	engines: { readonly vscode: string };
	description?: string;
	main?: string;
	browser?: string;
	preview?: boolean;
	// For now this only supports pointing to l10n bundle files
	// but it will be used for package.l10n.json files in the future
	l10n?: string;
	icon?: string;
	categories?: string[];
	keywords?: string[];
	activationEvents?: string[];
	extensionDependencies?: string[];
	extensionPack?: string[];
	extensionKind?: ExtensionKind | ExtensionKind[];
	contributes?: IExtensionContributions;
	repository?: { url: string };
	bugs?: { url: string };
	originalEnabledApiProposals?: readonly string[];
	enabledApiProposals?: readonly string[];
	api?: string;
	scripts?: { [key: string]: string };
	capabilities?: IExtensionCapabilities;
}

export type IExtensionManifest = Readonly<IRelaxedExtensionManifest>;

export const enum ExtensionType {
	System,
	User
}

export const enum TargetPlatform {
	WIN32_X64 = 'win32-x64',
	WIN32_ARM64 = 'win32-arm64',

	LINUX_X64 = 'linux-x64',
	LINUX_ARM64 = 'linux-arm64',
	LINUX_ARMHF = 'linux-armhf',

	ALPINE_X64 = 'alpine-x64',
	ALPINE_ARM64 = 'alpine-arm64',

	DARWIN_X64 = 'darwin-x64',
	DARWIN_ARM64 = 'darwin-arm64',

	WEB = 'web',

	UNIVERSAL = 'universal',
	UNKNOWN = 'unknown',
	UNDEFINED = 'undefined',
}

export interface IExtension {
	readonly type: ExtensionType;
	readonly isBuiltin: boolean;
	readonly identifier: IExtensionIdentifier;
	readonly manifest: IExtensionManifest;
	readonly location: URI;
	readonly targetPlatform: TargetPlatform;
	readonly publisherDisplayName?: string;
	readonly readmeUrl?: URI;
	readonly changelogUrl?: URI;
	readonly isValid: boolean;
	readonly validations: readonly [Severity, string][];
}

/**
 * **!Do not construct directly!**
 *
 * **!Only static methods because it gets serialized!**
 *
 * This represents the "canonical" version for an extension identifier. Extension ids
 * have to be case-insensitive (due to the marketplace), but we must ensure case
 * preservation because the extension API is already public at this time.
 *
 * For example, given an extension with the publisher `"Hello"` and the name `"World"`,
 * its canonical extension identifier is `"Hello.World"`. This extension could be
 * referenced in some other extension's dependencies using the string `"hello.world"`.
 *
 * To make matters more complicated, an extension can optionally have an UUID. When two
 * extensions have the same UUID, they are considered equal even if their identifier is different.
 */
export class ExtensionIdentifier {
	public readonly value: string;

	/**
	 * Do not use directly. This is public to avoid mangling and thus
	 * allow compatibility between running from source and a built version.
	 */
	readonly _lower: string;

	constructor(value: string) {
		this.value = value;
		this._lower = value.toLowerCase();
	}

	public static equals(a: ExtensionIdentifier | string | null | undefined, b: ExtensionIdentifier | string | null | undefined) {
		if (typeof a === 'undefined' || a === null) {
			return (typeof b === 'undefined' || b === null);
		}
		if (typeof b === 'undefined' || b === null) {
			return false;
		}
		if (typeof a === 'string' || typeof b === 'string') {
			// At least one of the arguments is an extension id in string form,
			// so we have to use the string comparison which ignores case.
			const aValue = (typeof a === 'string' ? a : a.value);
			const bValue = (typeof b === 'string' ? b : b.value);
			return strings.equalsIgnoreCase(aValue, bValue);
		}

		// Now we know both arguments are ExtensionIdentifier
		return (a._lower === b._lower);
	}

	/**
	 * Gives the value by which to index (for equality).
	 */
	public static toKey(id: ExtensionIdentifier | string): string {
		if (typeof id === 'string') {
			return id.toLowerCase();
		}
		return id._lower;
	}
}

export class ExtensionIdentifierSet {

	private readonly _set = new Set<string>();

	public get size(): number {
		return this._set.size;
	}

	constructor(iterable?: Iterable<ExtensionIdentifier | string>) {
		if (iterable) {
			for (const value of iterable) {
				this.add(value);
			}
		}
	}

	public add(id: ExtensionIdentifier | string): void {
		this._set.add(ExtensionIdentifier.toKey(id));
	}

	public delete(extensionId: ExtensionIdentifier): boolean {
		return this._set.delete(ExtensionIdentifier.toKey(extensionId));
	}

	public has(id: ExtensionIdentifier | string): boolean {
		return this._set.has(ExtensionIdentifier.toKey(id));
	}
}

export class ExtensionIdentifierMap<T> {

	private readonly _map = new Map<string, T>();

	public clear(): void {
		this._map.clear();
	}

	public delete(id: ExtensionIdentifier | string): void {
		this._map.delete(ExtensionIdentifier.toKey(id));
	}

	public get(id: ExtensionIdentifier | string): T | undefined {
		return this._map.get(ExtensionIdentifier.toKey(id));
	}

	public has(id: ExtensionIdentifier | string): boolean {
		return this._map.has(ExtensionIdentifier.toKey(id));
	}

	public set(id: ExtensionIdentifier | string, value: T): void {
		this._map.set(ExtensionIdentifier.toKey(id), value);
	}

	public values(): IterableIterator<T> {
		return this._map.values();
	}

	forEach(callbackfn: (value: T, key: string, map: Map<string, T>) => void): void {
		this._map.forEach(callbackfn);
	}

	[Symbol.iterator](): IterableIterator<[string, T]> {
		return this._map[Symbol.iterator]();
	}
}

export interface IRelaxedExtensionDescription extends IRelaxedExtensionManifest {
	id?: string;
	identifier: ExtensionIdentifier;
	uuid?: string;
	publisherDisplayName?: string;
	targetPlatform: TargetPlatform;
	isBuiltin: boolean;
	isUserBuiltin: boolean;
	isUnderDevelopment: boolean;
	extensionLocation: URI;
}

export type IExtensionDescription = Readonly<IRelaxedExtensionDescription>;

export function isApplicationScopedExtension(manifest: IExtensionManifest): boolean {
	return isLanguagePackExtension(manifest);
}

export function isLanguagePackExtension(manifest: IExtensionManifest): boolean {
	return manifest.contributes && manifest.contributes.localizations ? manifest.contributes.localizations.length > 0 : false;
}

export function isAuthenticationProviderExtension(manifest: IExtensionManifest): boolean {
	return manifest.contributes && manifest.contributes.authentication ? manifest.contributes.authentication.length > 0 : false;
}

export function isResolverExtension(manifest: IExtensionManifest, remoteAuthority: string | undefined): boolean {
	if (remoteAuthority) {
		const activationEvent = `onResolveRemoteAuthority:${getRemoteName(remoteAuthority)}`;
		return !!manifest.activationEvents?.includes(activationEvent);
	}
	return false;
}

export function parseApiProposals(enabledApiProposals: string[]): { proposalName: string; version?: number }[] {
	return enabledApiProposals.map(proposal => {
		const [proposalName, version] = proposal.split('@');
		return { proposalName, version: version ? parseInt(version) : undefined };
	});
}

export function parseEnabledApiProposalNames(enabledApiProposals: string[]): string[] {
	return enabledApiProposals.map(proposal => proposal.split('@')[0]);
}

export const IBuiltinExtensionsScannerService = createDecorator<IBuiltinExtensionsScannerService>('IBuiltinExtensionsScannerService');
export interface IBuiltinExtensionsScannerService {
	readonly _serviceBrand: undefined;
	scanBuiltinExtensions(): Promise<IExtension[]>;
}
