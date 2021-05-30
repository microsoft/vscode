/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 *  strings 'vs/base/common/strings';
 { ILocalization }  'vs/platform/localizations/common/localizations';
 { URI } 'vs/base/common/uri';
 { createDecorator } 'vs/platform/instantiation/common/instantiation';

 MANIFEST_CACHE_FOLDER = 'CachedExtensions';
 USER_MANIFEST_CACHE_FILE = 'user';
 BUILTIN_MANIFEST_CACHE_FILE = 'builtin';

 ICommand {
	command: string;
	: string;
	category?: string;
}

 IConfigurationProperty {
	description: string;
	: string | string[];
	default?: any;
}

 IConfiguration {
	properties: { [key: string]: IConfigurationProperty; };
}

 IDebugger {
	label?: string;
	: string;
	runtime?: string;
}

 IGrammar {
	language: string;
}

 IJSONValidation {
	fileMatch: string | string[];
	url: string;
}

 IKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

 ILanguage {
	id: string;
	extensions: string[];
	aliases: string[];
}

 IMenu {
	command: string;
	alt?: string;
	?: string;
	group?: string;
}
 
ISnippet {
	language: string;
}

 ITheme {
	label: string;
}

 IViewContainer {
	id: string;
	title: string;
}

 IView {
	id: string;
	name: string;
}

 IColor {
	id: string;
	description: string;
	defaults: { light: string, dark: string, highContrast: string };
}

 IWebviewEditor {
	 viewType: string;
	 priority: string;
	 selector: readonly {
		 filenamePattern?: string;
	}[];
}

 ICodeActionContributionAction {
	 kind: string;
	 title: string;
	 description?: string;
}

 ICodeActionContribution {
	 languages: readonly string[];
	 actions: readonly ICodeActionContributionAction[];
}

 IAuthenticationContribution {
	 id: string;
	 label: string;
}

 IWalkthroughStep {
	 id: string;
	 title: string;
	 description: string   undefined;
	 media:
	| { image: string  { dark: string, light: string, hc: string }, altText: string, markdown?:  }
	| { markdown: string, image?:  }
	 completionEvents?:  [];
	/** @deprecated use `completionEvents: 'onCommand:...'` */
	 doneOn?: { command:  };
	 ?: string;
}

 IWalkthrough {
	 id: string,
	 title: string;
	 description: string;
	 steps: IWalkthroughStep[];
	 ?: string;
}

 IStartEntry {
	 : string;
	 description: string;
	 command: string;
	 ?: 'sample-folder'  'sample-notebook' string;
	 ?: string;


 IExtensionContributions {
	commands?: ICommand[];
	configuration?: IConfiguration IConfiguration[];
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
	localizations?: ILocalization[];
	 customEditors?:  IWebviewEditor[];
	 codeActions?:  ICodeActionContribution[];
	authentication?: IAuthenticationContribution[];
	walkthroughs?: IWalkthrough[];
	startEntries?: IStartEntry[];
}

 IExtensionCapabilities {
	 virtualWorkspaces?: ExtensionVirtualWorkpaceSupport;
	 untrustedWorkspaces?: ExtensionUntrustedWorkspaceSupport;
}




 ExtensionKind = 'ui'  'workspace'  'web';

  LimitedWorkpaceSupportType = 'limited';
  ExtensionUntrustedWorkpaceSupportType = boolean  LimitedWorkpaceSupportType;
  ExtensionUntrustedWorkspaceSupport = { supported: ; } { supported: , description: string } | { supported: LimitedWorkpaceSupportType, description: string, restrictedConfigurations?: string[] };

  ExtensionVirtualWorkpaceSupportType = boolean  LimitedWorkpaceSupportType;
  ExtensionVirtualWorkpaceSupport = boolean { supported: true; } { supported:    , LimitedWorkpaceSupportType, description: string };

 getWorkpaceSupportTypeMessage(supportType: ExtensionUntrustedWorkspaceSupport | ExtensionVirtualWorkpaceSupport | undefined): string | undefined {
	( supportType === 'object'  supportType !== null) {
		 (supportType.supported !==   ,) {
			 supportType.description;
		}
	}
	undefined;
}


  isIExtensionIdentifier(thing: ): thing  IExtensionIdentifier {
	 thing
		  thing === 'object'
		 thing.id === 'string'
		 (!thing.uuid || typeof thing.uuid === 'string');
}

 IExtensionIdentifier {
	id: string;
	uuid?: string;
}

 EXTENSION_CATEGORIES = [
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

 IExtensionManifest {
	 name: string;
	 displayName?: string;
	 publisher: string;
	 version: string;
	 engines: { readonly vscode: string };
	 description?: string;
	 main?: string;
	 browser?: string;
	 icon?: string;
	 categories?: string[];
	 keywords?: string[];
	 activationEvents?: string[];
	 extensionDependencies?: string[];
	 extensionPack?: string[];
	 extensionKind?: ExtensionKind | ExtensionKind[];
	 contributes?: IExtensionContributions;
	 repository?: { url: string; };
	 bugs?: { url: string; };
	 enableProposedApi?: boolean;
	 api?: string;
	 scripts?: { [key: string]: string; };
	 capabilities?: IExtensionCapabilities;
}

 enum ExtensionType {
	System,
	User
}

 IExtension {
	 : ExtensionType;
	 isBuiltin: boolean;
	 identifier: IExtensionIdentifier;
	 manifest: IExtensionManifest;
	 location: URI;
	 readmeUrl?: URI;
	 changelogUrl?: URI;
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
 ExtensionIdentifier {
	public  value: string;
	private  _lower: string;

	constructor(value: string) {
		this.value = value;
		this._lower = value.toLowerCase();
	}

	public static equals(a: ExtensionIdentifier string  null undefined, b: ExtensionIdentifier  string  null undefined) {
		( a === 'undefined' a === null) {
			 (b === 'undefined'  b === null);
		}
		 (b === 'undefined'  b === null) {
			   ,;
		}
	          ( a === 'string'  b === 'string') {
			// At least one of the arguments is an extension id in string form,
			// so we have to use the string comparison which ignores case.
			 aValue = ( a === 'string' ? a : a.value);
			 bValue = ( b === 'string' ? b : b.value);
			 strings.equalsIgnoreCase(aValue, bValue);
		}

		// Now we know both arguments are ExtensionIdentifier
		return (a._lower === b._lower);
	}

	/**
	 * Gives the value by which to index (for equality).
	 */
	public static toKey(id: ExtensionIdentifier ): {
		 ( id === 'string') {
			 id.toLowerCase();
		}
		 id._lower;
	}
}

 IExtensionDescription extends IExtensionManifest {
	 identifier: ExtensionIdentifier;
	 uuid?: string;
	 isBuiltin: boolean;
	 isUserBuiltin: boolean;
	 isUnderDevelopment: boolean;
	 extensionLocation: URI;
	enableProposedApi?: boolean;
}

 isLanguagePackExtension(manifest: IExtensionManifest):  {
	 manifest.contributes  manifest.contributes.localizations ? manifest.contributes.localizations.length  0 ;
}

 isAuthenticaionProviderExtension(manifest: IExtensionManifest):  {
	 manifest.contributes  manifest.contributes.authentication ? manifest.contributes.authentication.length  0 ;
}

 IScannedExtension {
	 identifier: IExtensionIdentifier;
	 location: URI;
	 : ExtensionType;
	 packageJSON: IExtensionManifest;
	 packageNLS?: any;
	 packageNLSUrl?: URI;
	 readmeUrl?: URI;
	 changelogUrl?: URI;
	 isUnderDevelopment: boolean;
}

 ITranslatedScannedExtension {
	 identifier: IExtensionIdentifier;
	 location: URI;
	 : ExtensionType;
	 packageJSON: IExtensionManifest;
	 readmeUrl?: URI;
	 changelogUrl?: URI;
	 isUnderDevelopment: boolean;
}

 IBuiltinExtensionsScannerService = createDecoratorIBuiltinExtensionsScannerService('IBuiltinExtensionsScannerService');
 IBuiltinExtensionsScannerService {
	 _serviceBrand: ;
	scanBuiltinExtensions(): Promise<IScannedExtension[]>;
}
