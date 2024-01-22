/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ILocalizedString } from 'vs/platform/action/common/action';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';

export const USER_MANIFEST_CACHE_FILE = 'extensions.user.cache';
export const BUILTIN_MANIFEST_CACHE_FILE = 'extensions.builtin.cache';
export const UNDEFINED_PUBLISHER = 'undefined_publisher';

export interface ICommand {
	/**
	 * Identifier of the command to execute
	 */
	command: string;
	/**
	 * Title by which the command is represented in the UI
	 */
	title: string | ILocalizedString;
	/**
	 * (Optional) Category string by which the command is grouped in the UI
	 */
	category?: string | ILocalizedString;
}

export interface IConfigurationProperty {
	description: string;
	type: string | string[];
	default?: any;
}

export interface IConfiguration {
	id?: string;
	/**
	 * When specified, gives the order of this category of settings relative to other categories.
	 */
	order?: number;
	/**
	 * A title for the current category of settings. This label will be rendered in the Settings editor as a subheading. If the title is the same as the extension display name, then the category will be grouped under the main extension heading.
	 */
	title?: string;
	/**
	 * Description of the configuration properties.
	 */
	properties: { [key: string]: IConfigurationProperty };
}

export interface IDebugger {
	/**
	 * Display name for this debug adapter.
	 */
	label?: string;
	/**
	 * Unique identifier for this debug adapter.
	 */
	type: string;
	/**
	 * Optional runtime in case the program attribute is not an executable but requires a runtime.
	 */
	runtime?: string;
}

export interface IGrammar {
	/**
	 * Language identifier for which this syntax is contributed to.
	 */
	language: string;
}

export interface IJSONValidation {
	/**
	 * The file pattern (or an array of patterns) to match, for example "package.json" or "*.launch". Exclusion patterns start with '!'
	 */
	fileMatch: string | string[];
	/**
	 * A schema URL ('http:', 'https:') or relative path to the extension folder ('./').
	 */
	url: string;
}

export interface IKeyBinding {
	/**
	 * Identifier of the command to run when keybinding is triggered.
	 */
	command: string;
	/**
	 * Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord).
	 */
	key: string;
	/**
	 * Condition when the key is active.
	 */
	when?: string;
	/**
	 * Mac specific key or key sequence.
	 */
	mac?: string;
	/**
	 * Linux specific key or key sequence.
	 */
	linux?: string;
	/**
	 * Windows specific key or key sequence.
	 */
	win?: string;
}

export interface ILanguage {
	/**
	 * ID of the language.
	 */
	id: string;
	/**
	 * File extensions associated to the language.
	 */
	extensions: string[];
}

export interface IMenu {
	/**
	 * Identifier of the command to execute. The command must be declared in the 'commands'-section
	 */
	command: string;
	/**
	 * Identifier of an alternative command to execute. The command must be declared in the 'commands'-section
	 */
	alt?: string;
	/**
	 * Condition which must be true to show this item
	 */
	when?: string;
	/**
	 * Group into which this item belongs
	 */
	group?: string;
}

export interface ISnippet {
	/**
	 * Language identifier for which this snippet is contributed to.
	 */
	language: string;
}

export interface ITheme {
	/**
	 * Label of the color theme as shown in the UI.
	 */
	label: string;
}

export interface IViewContainer {
	/**
	 * Unique id used to identify the container in which views can be contributed using 'views' contribution point
	 */
	id: string;
	/**
	 * Human readable string used to render the container
	 */
	title: string;
	/**
	 * Path to the container icon. Icons are 24x24 centered on a 50x40 block and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted.
	 */
	icon: string;
}

export interface IView {
	id: string;
	/**
	 * The human-readable name of the view. Will be shown
	 */
	name: string;
}

export interface IColor {
	/**
	 * The identifier of the themable color
	 */
	id: string;
	/**
	 * The description of the themable color
	 */
	description: string;
	defaults: {
		/**
		 * The default color for light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.
		 */
		light: string;
		/**
		 * The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.
		 */
		dark: string;
		/**
		 * The default color for high contrast dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `dark` color is used as default for high contrast dark themes.
		 */
		highContrast: string;
	};
}

interface IWebviewEditor {
	readonly viewType: string;
	readonly priority: string;
	/**
	 * Set of globs that the custom editor is enabled for.
	 */
	readonly selector: {
		/**
		 * Glob that the custom editor is enabled for.
		 */
		readonly filenamePattern?: string;
	}[];
}

export interface ICodeActionContributionAction {
	readonly kind: string;
	/**
	 * Label for the code action used in the UI.
	 */
	readonly title: string;
	/**
	 * Description of what the code action does.
	 */
	readonly description?: string;
}

export interface ICodeActionContribution {
	/**
	 * Language modes that the code actions are enabled for.
	 */
	readonly languages: readonly string[];
	readonly actions: readonly ICodeActionContributionAction[];
}

export interface IAuthenticationContribution {
	/**
	 * The id of the authentication provider.
	 */
	readonly id: string;
	/**
	 * The human readable name of the authentication provider.
	 */
	readonly label: string;
}

export interface IWalkthroughStep {
	/**
	 * Unique identifier for this step. This is used to keep track of which steps have been completed.
	 */
	readonly id: string;
	/**
	 * Title of step.
	 */
	readonly title: string;
	/**
	 * Description of step. Supports ``preformatted``, __italic__, and **bold** text. Use markdown-style links for commands or external links: [Title](command:myext.command), [Title](command:toSide:myext.command), or [Title](https://aka.ms). Links on their own line will be rendered as buttons.
	 */
	readonly description: string | undefined;
	/**
	 * Media to show alongside this step, either an image or markdown content.
	 */
	readonly media: {
		path?: {
			[k: string]: unknown;
		};
		/**
		 * Path to an image - or object consisting of paths to light, dark, and hc images - relative to extension directory. Depending on context, the image will be displayed from 400px to 800px wide, with similar bounds on height. To support HIDPI displays, the image will be rendered at 1.5x scaling, for example a 900 physical pixels wide image will be displayed as 600 logical pixels wide.
		 */
		image: string | {
			/**
			 * Path to the image for dark themes, relative to extension directory.
			 */
			dark: string;
			/**
			 * Path to the image for light themes, relative to extension directory.
			 */
			light: string;
			/**
			 * Path to the image for hc themes, relative to extension directory.
			 */
			hc: string;
			/**
			 * Path to the image for hc light themes, relative to extension directory.
			 */
			hcLight: string;
		};
		/**
		 * Alternate text to display when the image cannot be loaded or in screen readers.
		 */
		altText: string;
		markdown?: never;
		svg?: never;
	} | {
		/**
		 * Path to an svg, color tokens are supported in variables to support theming to match the workbench.
		 */
		svg: string;
		/**
		 * Alternate text to display when the image cannot be loaded or in screen readers.
		 */
		altText: string;
		image?: never;
		markdown?: never;
	} | {
		path?: {
			[k: string]: unknown;
		};
		/**
		 * Path to the markdown document, relative to extension directory.
		 */
		markdown: string;
		image?: never;
		svg?: never;
	};
	/**
	 * Events that should trigger this step to become checked off. If empty or not defined, the step will check off when any of the step's buttons or links are clicked; if the step has no buttons or links it will check on when it is selected.
	 */
	readonly completionEvents?: string[];
	/**
	 * Signal to mark step as complete.
	 * @deprecated use `completionEvents: 'onCommand:...'`
	 **/
	readonly doneOn?: { command: string };
	/**
	 * Context key expression to control the visibility of this step.
	 */
	readonly when?: string;
}

export interface IWalkthrough {
	/**
	 * Unique identifier for this walkthrough.
	 */
	readonly id: string;
	/**
	 * Title of walkthrough.
	 */
	readonly title: string;
	/**
	 * Relative path to the icon of the walkthrough. The path is relative to the extension location. If not specified, the icon defaults to the extension icon if available.
	 */
	readonly icon?: string;
	/**
	 * Description of walkthrough.
	 */
	readonly description: string;
	readonly steps: IWalkthroughStep[];
	/**
	 * Walkthroughs that match one of these glob patterns appear as 'featured' in workspaces with the specified files. For example, a walkthrough for TypeScript projects might specify `tsconfig.json` here.
	 */
	readonly featuredFor: string[] | undefined;
	/**
	 * Context key expression to control the visibility of this walkthrough.
	 */
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
	/**
	 * Type of the notebook.
	 */
	readonly type: string;
	/**
	 * Human readable name of the notebook.
	 */
	readonly displayName: string;
}

export interface INotebookRendererContribution {
	/**
	 * Unique identifier of the notebook output renderer.
	 */
	readonly id: string;
	/**
	 * Human readable name of the notebook output renderer.
	 */
	readonly displayName: string;
	/**
	 * Set of globs that the notebook is for.
	 */
	readonly mimeTypes: string[];
}

export interface IDebugVisualizationContribution {
	readonly id: string;
	readonly when: string;
}

export interface ITranslation {
	/**
	 * Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`.
	 */
	id: string;
	/**
	 * A relative path to a file containing translations for the language.
	 */
	path: string;
}

export interface ILocalizationContribution {
	/**
	 * Id of the language into which the display strings are translated.
	 */
	languageId: string;
	/**
	 * Name of the language in English.
	 */
	languageName?: string;
	/**
	 * Name of the language in contributed language.
	 */
	localizedLanguageName?: string;
	/**
	 *
	 */
	translations: ITranslation[];
	minimalTranslations?: { [key: string]: string };
}

export interface IExtensionContributions {
	/**
	 * Contributes commands to the command palette.
	 */
	commands?: ICommand[];
	/**
	 * Contributes configuration settings.
	 */
	configuration?: IConfiguration | IConfiguration[];
	/**
	 * Contributes debug adapters.
	 */
	debuggers?: IDebugger[];
	/**
	 * Contributes textmate tokenizers.
	 */
	grammars?: IGrammar[];
	/**
	 * Contributes json schema configuration.
	 */
	jsonValidation?: IJSONValidation[];
	/**
	 * Contributes keybindings.
	 */
	keybindings?: IKeyBinding[];
	/**
	 * Contributes language declarations.
	 */
	languages?: ILanguage[];
	/**
	 * Contributes menu items to the editor
	 */
	menus?: { [context: string]: IMenu[] };
	/**
	 * Contributes snippets.
	 */
	snippets?: ISnippet[];
	/**
	 * Contributes textmate color themes.
	 */
	themes?: ITheme[];
	/**
	 * Contributes file icon themes.
	 */
	iconThemes?: ITheme[];
	/**
	 * Contributes product icon themes.
	 */
	productIconThemes?: ITheme[];
	/**
	 * Contributes views containers to the editor
	 */
	viewsContainers?: { [location: string]: IViewContainer[] };
	/**
	 * Contributes views to the editor
	 */
	views?: { [location: string]: IView[] };
	/**
	 * Contributes extension defined themable colors
	 */
	colors?: IColor[];
	/**
	 * Contributes localizations to the editor
	 */
	localizations?: ILocalizationContribution[];
	/**
	 * Contributed custom editors.
	 */
	readonly customEditors?: readonly IWebviewEditor[];
	readonly codeActions?: readonly ICodeActionContribution[];
	/**
	 * Contributes authentication
	 */
	authentication?: IAuthenticationContribution[];
	/**
	 * Contribute walkthroughs to help users getting started with your extension.
	 */
	walkthroughs?: IWalkthrough[];
	startEntries?: IStartEntry[];
	/**
	 * Contributes notebook document provider.
	 */
	readonly notebooks?: INotebookEntry[];
	/**
	 * Contributes notebook output renderer provider.
	 */
	readonly notebookRenderer?: INotebookRendererContribution[];
	readonly debugVisualizers?: IDebugVisualizationContribution[];
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
	'Azure',
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

export const IBuiltinExtensionsScannerService = createDecorator<IBuiltinExtensionsScannerService>('IBuiltinExtensionsScannerService');
export interface IBuiltinExtensionsScannerService {
	readonly _serviceBrand: undefined;
	scanBuiltinExtensions(): Promise<IExtension[]>;
}
