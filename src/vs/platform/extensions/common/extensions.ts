/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
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
	readonly command: string;
	/**
	 * Title by which the command is represented in the UI
	 */
	readonly title: string | ILocalizedString;
	readonly shortTitle?: string;
	/**
	 * (Optional) Category string by which the command is grouped in the UI
	 */
	readonly category?: string | ILocalizedString;
	/**
	 * (Optional) Condition which must be true to enable the command in the UI (menu and keybindings). Does not prevent executing the command by other means, like the `executeCommand`-api.
	 */
	readonly enablement?: string;
	/**
	 * (Optional) Icon which is used to represent the command in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like `\$(zap)`
	 */
	readonly icon?:
	| string
	| {
		/**
		 * Icon path when a light theme is used
		 */
		readonly light?: string;
		/**
		 * Icon path when a dark theme is used
		 */
		readonly dark?: string;
	};
}

export interface IConfiguration {
	/**
	 * When specified, gives the order of this category of settings relative to other categories.
	 */
	readonly order?: number;
	/**
	 * A title for the current category of settings. This label will be rendered in the Settings editor as a subheading. If the title is the same as the extension display name, then the category will be grouped under the main extension heading.
	 */
	readonly title?: string;
	/**
	 * Description of the configuration properties.
	 */
	readonly properties: { [key: string]: IJSONSchema };
}

export interface IDebugger {
	/**
	 * Display name for this debug adapter.
	 */
	readonly label?: string;
	/**
	 * Unique identifier for this debug adapter.
	 */
	readonly type: string;
	/**
	 * Path to the debug adapter program. Path is either absolute or relative to the extension folder.
	 */
	readonly program?: string;
	/**
	 * Optional arguments to pass to the adapter.
	 */
	readonly args?: unknown[];
	/**
	 * Optional runtime in case the program attribute is not an executable but requires a runtime.
	 */
	readonly runtime?: string;
	/**
	 * Optional runtime arguments.
	 */
	readonly runtimeArgs?: unknown[];
	/**
	 * Mapping from interactive variables (e.g. ${action.pickProcess}) in `launch.json` to a command.
	 */
	readonly variables?: {};
	/**
	 * Configurations for generating the initial 'launch.json'.
	 */
	readonly initialConfigurations?: unknown[] | string;
	/**
	 * List of languages for which the debug extension could be considered the "default debugger".
	 */
	readonly languages?: unknown[];
	/**
	 * Snippets for adding new configurations in 'launch.json'.
	 */
	readonly configurationSnippets?: unknown[];
	/**
	 * JSON schema configurations for validating 'launch.json'.
	 */
	readonly configurationAttributes?: {};
	/**
	 * Condition which must be true to enable this type of debugger. Consider using 'shellExecutionSupported', 'virtualWorkspace', 'resourceScheme' or an extension-defined context key as appropriate for this.
	 */
	readonly when?: string;
	/**
	 * When this condition is true, this debugger type is hidden from the debugger list, but is still enabled.
	 */
	readonly hiddenWhen?: string;
	/**
	 * Optional message to mark this debug type as being deprecated.
	 */
	readonly deprecated?: string;
	/**
	 * Windows specific settings.
	 */
	readonly windows?: {
		/**
		 * Runtime used for Windows.
		 */
		runtime?: string;
	};
	/**
	 * macOS specific settings.
	 */
	readonly osx?: {
		/**
		 * Runtime used for macOS.
		 */
		runtime?: string;
	};
	/**
	 * Linux specific settings.
	 */
	readonly linux?: {
		/**
		 * Runtime used for Linux.
		 */
		readonly runtime?: string;
	};
	/**
	 * UI strings contributed by this debug adapter.
	 */
	readonly strings?: {
		/**
		 * When there are unverified breakpoints in a language supported by this debug adapter, this message will appear on the breakpoint hover and in the breakpoints view. Markdown and command links are supported.
		 */
		readonly unverifiedBreakpoints?: string;
	};
}

export interface IGrammar {
	/**
	 * Language identifier for which this syntax is contributed to.
	 */
	readonly language: string;
	/**
	 * Textmate scope name used by the tmLanguage file.
	 */
	readonly scopeName: string;
	/**
	 * Path of the tmLanguage file. The path is relative to the extension folder and typically starts with './syntaxes/'.
	 */
	readonly path: string;
	/**
	 * A map of scope name to language id if this grammar contains embedded languages.
	 */
	readonly embeddedLanguages?: {};
	/**
	 * A map of scope name to token types.
	 */
	readonly tokenTypes?: {
		[k: string]: 'string' | 'comment' | 'other';
	};
	/**
	 * List of language scope names to which this grammar is injected to.
	 */
	readonly injectTo?: string[];
	/**
	 * Defines which scope names contain balanced brackets.
	 */
	readonly balancedBracketScopes?: string[];
	/**
	 * Defines which scope names do not contain balanced brackets.
	 */
	readonly unbalancedBracketScopes?: string[];
}

export interface IJSONValidation {
	/**
	 * The file pattern (or an array of patterns) to match, for example "package.json" or "*.launch". Exclusion patterns start with '!'
	 */
	readonly fileMatch: string | string[];
	/**
	 * A schema URL ('http:', 'https:') or relative path to the extension folder ('./').
	 */
	readonly url: string;
}

export interface IKeyBinding {
	/**
	 * Identifier of the command to run when keybinding is triggered.
	 */
	readonly command: string;
	/**
	 * Arguments to pass to the command to execute.
	 */
	readonly args?: {
		[k: string]: unknown;
	};
	/**
	 * Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord).
	 */
	readonly key: string;
	/**
	 * Condition when the key is active.
	 */
	readonly when?: string;
	/**
	 * Mac specific key or key sequence.
	 */
	readonly mac?: string;
	/**
	 * Linux specific key or key sequence.
	 */
	readonly linux?: string;
	/**
	 * Windows specific key or key sequence.
	 */
	readonly win?: string;
}

export interface ILanguage {
	/**
	 * ID of the language.
	 */
	readonly id: string;
	/**
	 * File extensions associated to the language.
	 */
	readonly extensions?: string[];
	/**
	 * Name aliases for the language.
	 */
	readonly aliases?: string[];
	/**
	 * File names associated to the language.
	 */
	readonly filenames?: string[];
	/**
	 * File name glob patterns associated to the language.
	 */
	readonly filenamePatterns?: string[];
	/**
	 * Mime types associated to the language.
	 */
	readonly mimetypes?: string[];
	/**
	 * A regular expression matching the first line of a file of the language.
	 */
	readonly firstLine?: string;
	/**
	 * A relative path to a file containing configuration options for the language.
	 */
	readonly configuration?: string;
	/**
	 * A icon to use as file icon, if no icon theme provides one for the language.
	 */
	readonly icon?: {
		/**
		 * Icon path when a light theme is used
		 */
		readonly light?: string;
		/**
		 * Icon path when a dark theme is used
		 */
		readonly dark?: string;
	};
}

export interface IMenu {
	/**
	 * Identifier of the command to execute. The command must be declared in the 'commands'-section
	 */
	readonly command: string;
	/**
	 * Identifier of an alternative command to execute. The command must be declared in the 'commands'-section
	 */
	readonly alt?: string;
	/**
	 * Condition which must be true to show this item
	 */
	readonly when?: string;
	/**
	 * Group into which this item belongs
	 */
	readonly group?: string;
}

export interface ISubMenu {
	/**
	 * Identifier of the submenu to display in this item.
	 */
	readonly submenu: string;
	/**
	 * Condition which must be true to show this item
	 */
	readonly when?: string;
	/**
	 * Group into which this item belongs
	 */
	readonly group?: string;
}

export interface ISnippet {
	/**
	 * Language identifier for which this snippet is contributed to.
	 */
	readonly language: string;
	/**
	 * Path of the snippets file. The path is relative to the extension folder and typically starts with './snippets/'.
	 */
	readonly path: string;
}

export interface IColorTheme {
	/**
	 * Id of the color theme as used in the user settings.
	 */
	readonly id: string;
	/**
	 * Label of the color theme as shown in the UI.
	 */
	readonly label: string;
	/**
	 * Base theme defining the colors around the editor: 'vs' is the light color theme, 'vs-dark' is the dark color theme. 'hc-black' is the dark high contrast theme, 'hc-light' is the light high contrast theme.
	 */
	readonly uiTheme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
	/**
	 * Path of the tmTheme file. The path is relative to the extension folder and is typically './colorthemes/awesome-color-theme.json'.
	 */
	readonly path: string;
}

export interface IIconTheme {
	/**
	 * Id of the file icon theme as used in the user settings.
	 */
	readonly id: string;
	/**
	 * Label of the file icon theme as shown in the UI.
	 */
	readonly label: string;
	/**
	 * Path of the file icon theme definition file. The path is relative to the extension folder and is typically './fileicons/awesome-icon-theme.json'.
	 */
	readonly path: string;
}

export interface IProductTheme {
	/**
	 * Id of the product icon theme as used in the user settings.
	 */
	readonly id: string;
	/**
	 * Label of the product icon theme as shown in the UI.
	 */
	readonly label: string;
	/**
	 * Path of the product icon theme definition file. The path is relative to the extension folder and is typically './producticons/awesome-product-icon-theme.json'.
	 */
	readonly path: string;
}

export interface IViewContainer {
	/**
	 * Unique id used to identify the container in which views can be contributed using 'views' contribution point
	 */
	readonly id: string;
	/**
	 * Human readable string used to render the container
	 */
	readonly title: string;
	/**
	 * Path to the container icon. Icons are 24x24 centered on a 50x40 block and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted.
	 */
	readonly icon: string;
}

export interface IView {
	readonly type?: 'tree' | 'webview';
	readonly id: string;
	/**
	 * The human-readable name of the view. Will be shown
	 */
	readonly name: string;
	/**
	 * Condition which must be true to show this view
	 */
	readonly when?: string;
	/**
	 * Path to the view icon. View icons are displayed when the name of the view cannot be shown. It is recommended that icons be in SVG, though any image file type is accepted.
	 */
	readonly icon?: string;
	/**
	 * Human-readable context for when the view is moved out of its original location. By default, the view's container name will be used.
	 */
	readonly contextualTitle?: string;
	/**
	 * Initial state of the view when the extension is first installed. Once the user has changed the view state by collapsing, moving, or hiding the view, the initial state will not be used again.
	 */
	readonly visibility?: 'visible' | 'hidden' | 'collapsed';
	/**
	 * The initial size of the view. The size will behave like the css 'flex' property, and will set the initial size when the view is first shown. In the side bar, this is the height of the view. This value is only respected when the same extension owns both the view and the view container.
	 */
	readonly initialSize?: number;
}

export interface IColor {
	/**
	 * The identifier of the themable color
	 */
	readonly id: string;
	/**
	 * The description of the themable color
	 */
	readonly description: string;
	readonly defaults: {
		/**
		 * The default color for light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.
		 */
		readonly light: string;
		/**
		 * The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.
		 */
		readonly dark: string;
		/**
		 * The default color for high contrast dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `dark` color is used as default for high contrast dark themes.
		 */
		readonly highContrast: string;
		/**
		 * The default color for high contrast light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `light` color is used as default for high contrast light themes.
		 */
		readonly highContrastLight?: string;
	};
}

interface IWebviewEditor {
	readonly viewType: string;
	readonly priority: string;
	/**
	 * Human readable name of the custom editor. This is displayed to users when selecting which editor to use.
	 */
	readonly displayName: string;
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
	readonly description?: string;
	readonly button?: {
		[k: string]: unknown;
	};
	/**
	 * Media to show alongside this step, either an image or markdown content.
	 */
	readonly media: {
		readonly path?: {
			[k: string]: unknown;
		};
		/**
		 * Path to an image - or object consisting of paths to light, dark, and hc images - relative to extension directory. Depending on context, the image will be displayed from 400px to 800px wide, with similar bounds on height. To support HIDPI displays, the image will be rendered at 1.5x scaling, for example a 900 physical pixels wide image will be displayed as 600 logical pixels wide.
		 */
		readonly image: string | {
			/**
			 * Path to the image for dark themes, relative to extension directory.
			 */
			readonly dark: string;
			/**
			 * Path to the image for light themes, relative to extension directory.
			 */
			readonly light: string;
			/**
			 * Path to the image for hc themes, relative to extension directory.
			 */
			readonly hc: string;
			/**
			 * Path to the image for hc light themes, relative to extension directory.
			 */
			readonly hcLight: string;
		};
		/**
		 * Alternate text to display when the image cannot be loaded or in screen readers.
		 */
		readonly altText: string;
		readonly markdown?: never;
		readonly svg?: never;
	} | {
		/**
		 * Path to an svg, color tokens are supported in variables to support theming to match the workbench.
		 */
		readonly svg: string;
		/**
		 * Alternate text to display when the image cannot be loaded or in screen readers.
		 */
		readonly altText: string;
		readonly image?: never;
		readonly markdown?: never;
	} | {
		readonly path?: {
			[k: string]: unknown;
		};
		/**
		 * Path to the markdown document, relative to extension directory.
		 */
		readonly markdown: string;
		readonly image?: never;
		readonly svg?: never;
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
	readonly featuredFor?: string[];
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
	/**
	 * Set of globs that the notebook is for.
	 */
	readonly selector: {
		/**
		 * Glob that the notebook is enabled for.
		 */
		readonly filenamePattern?: string;
		/**
		 * Glob that the notebook is disabled for.
		 */
		readonly excludeFileNamePattern?: string;
	}[];
	readonly priority?: 'default' | 'option';
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
	readonly dependencies?: string[];
	readonly optionalDependencies?: string[];
	/**
	 * Defines how and if the renderer needs to communicate with an extension host, via `createRendererMessaging`. Renderers with stronger messaging requirements may not work in all environments.
	 */
	readonly requiresMessaging?: 'always' | 'optional' | 'never';
	/**
	 * Set of globs that the notebook is for.
	 */
	readonly mimeTypes: string[];
	readonly entrypoint: string | {
		readonly extends: string;
		readonly path: string;
	};
}

export interface IDebugVisualizationContribution {
	readonly id: string;
	readonly when: string;
}

export interface ITranslation {
	/**
	 * Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`.
	 */
	readonly id: string;
	/**
	 * A relative path to a file containing translations for the language.
	 */
	readonly path: string;
}

export interface ILocalizationContribution {
	/**
	 * Id of the language into which the display strings are translated.
	 */
	readonly languageId: string;
	/**
	 * Name of the language in English.
	 */
	readonly languageName?: string;
	/**
	 * Name of the language in contributed language.
	 */
	readonly localizedLanguageName?: string;
	/**
	 *
	 */
	readonly translations: ITranslation[];
	readonly minimalTranslations?: { [key: string]: string };
}

export interface ITerminal {
	readonly profiles?: {
		readonly id: string;
		readonly title: string;
		readonly icon?: (string | {
			/**
			 * Icon path when a light theme is used
			 */
			readonly light?: string;
			/**
			 * Icon path when a dark theme is used
			 */
			readonly dark?: string;
			[k: string]: unknown;
		});
	}[];
}

export interface IStatusBarItem {
	readonly id: string;
	/**
	 * The name of the entry, like 'Python Language Indicator', 'Git Status' etc. Try to keep the length of the name short, yet descriptive enough that users can understand what the status bar item is about.
	 */
	readonly name: string;
	/**
	 * The text to show for the entry. You can embed icons in the text by leveraging the `$(<name>)`-syntax, like 'Hello $(globe)!'
	 */
	readonly text: string;
	/**
	 * The tooltip text for the entry.
	 */
	readonly tooltip?: string;
	/**
	 * The command to execute when the status bar entry is clicked.
	 */
	readonly command?: string;
	/**
	 * The alignment of the status bar entry.
	 */
	readonly alignment: 'left' | 'right';
	/**
	 * The priority of the status bar entry. Higher value means the item should be shown more to the left.
	 */
	readonly priority?: number;
	/**
	 * Defines the role and aria label to be used when the status bar entry is focused.
	 */
	readonly accessibilityInformation?: {
		/**
		 * The role of the status bar entry which defines how a screen reader interacts with it. More about aria roles can be found here https://w3c.github.io/aria/#widget_roles
		 */
		readonly role?: string;
		/**
		 * The aria label of the status bar entry. Defaults to the entry's text.
		 */
		readonly label?: string;
	};
}

export interface IRemoteHelp {
	/**
	 * The url, or a command that returns the url, to your project's Getting Started page, or a walkthrough ID contributed by your project's extension
	 */
	readonly getStarted?: string | {
		/**
		 * The ID of a Get Started walkthrough to open.
		 */
		id: string;
	};
	/**
	 * The url, or a command that returns the url, to your project's documentation page
	 */
	readonly documentation?: string;
	/**
	 * The url, or a command that returns the url, to your project's feedback reporter
	 */
	readonly feedback?: string;
	/**
	 * The url, or a command that returns the url, to your project's issue reporter
	 */
	readonly reportIssue?: string;
	/**
	 * The url, or a command that returns the url, to your project's issues list
	 */
	readonly issues?: string;
}

export interface ITaskDefinitions {
	/**
	 * The actual task type. Please note that types starting with a '$' are reserved for internal usage.
	 */
	readonly type?: string;
	readonly required?: string[];
	/**
	 * Additional properties of the task type
	 */
	readonly properties?: {
		[k: string]: IJSONSchema;
	};
	readonly when?: string;
}

export interface IIcon {
	/**
	 * The description of the themable icon
	 */
	readonly description: string;
	/**
	 * The default of the icon. Either a reference to an extisting ThemeIcon or an icon in an icon font.
	 */
	readonly default: string | {
		/**
		 * The path of the icon font that defines the icon.
		 */
		readonly fontPath: string;
		/**
		 * The character for the icon in the icon font.
		 */
		readonly fontCharacter: string;
	};
}

export interface IDocumentationRefactoring {
	/**
	 * Label for the documentation used in the UI.
	 */
	readonly title: string;
	/**
	 * When clause.
	 */
	readonly when: string;
	/**
	 * Command executed.
	 */
	readonly command: string;
}

export interface IDocumentation {
	/**
	 * Contributed documentation for refactorings.
	 */
	readonly refactoring?: IDocumentationRefactoring[];
}

export interface ISubMenu {
	/**
	 * Identifier of the menu to display as a submenu.
	 */
	readonly id: string;
	/**
	 * The label of the menu item which leads to this submenu.
	 */
	readonly label: string;
	/**
	 * (Optional) Icon which is used to represent the submenu in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like `\$(zap)`
	 */
	readonly icon?:
	| string
	| {
		/**
		 * Icon path when a light theme is used
		 */
		readonly light?: string;
		/**
		 * Icon path when a dark theme is used
		 */
		readonly dark?: string;
	};
}

interface IResourceLabelFormatters {
	/**
	 * URI scheme on which to match the formatter on. For example "file". Simple glob patterns are supported.
	 */
	readonly scheme: string;
	/**
	 * URI authority on which to match the formatter on. Simple glob patterns are supported.
	 */
	readonly authority?: string;
	/**
	 * Rules for formatting uri resource labels.
	 */
	readonly formatting: {
		/**
		 * Label rules to display. For example: myLabel:/${path}. ${path}, ${scheme}, ${authority} and ${authoritySuffix} are supported as variables.
		 */
		readonly label?: string;
		/**
		 * Separator to be used in the uri label display. '/' or '' as an example.
		 */
		readonly separator?: string;
		/**
		 * Controls whether `${path}` substitutions should have starting separator characters stripped.
		 */
		readonly stripPathStartingSeparator?: boolean;
		/**
		 * Controls if the start of the uri label should be tildified when possible.
		 */
		readonly tildify?: boolean;
		/**
		 * Suffix appended to the workspace label.
		 */
		readonly workspaceSuffix?: string;
	};
}

export interface ISemanticTokenTypes {
	/**
	 * The identifier of the semantic token type
	 */
	readonly id?: string;
	/**
	 * The super type of the semantic token type
	 */
	readonly superType?: string;
	/**
	 * The description of the semantic token type
	 */
	readonly description?: string;
}

export interface ISemanticTokenModifiers {
	/**
	 * The identifier of the semantic token modifier
	 */
	readonly id?: string;
	/**
	 * The description of the semantic token modifier
	 */
	readonly description?: string;
}

export interface ISemanticTokenScopes {
	/**
	 * Lists the languge for which the defaults are.
	 */
	readonly language?: string;
	/**
	 * Maps a semantic token (described by semantic token selector) to one or more textMate scopes used to represent that token.
	 */
	readonly scopes?: {
		[k: string]: string[];
	};
}

export interface IBreakpoint {
	/**
	 * Allow breakpoints for this language.
	 */
	readonly language?: string;
	/**
	 * Condition which must be true to enable breakpoints in this language. Consider matching this to the debugger when clause as appropriate.
	 */
	readonly when?: string;
}

export interface ITerminalQuickFix {
	/**
	 * The ID of the quick fix provider
	 */
	readonly id: string;
	/**
	 * A regular expression or string to test the command line against
	 */
	readonly commandLineMatcher: string;
	readonly outputMatcher: {
		/**
		 * A regular expression or string to test the command line against
		 */
		readonly lineMatcher: string;
		/**
		 * Where the search should begin in the buffer
		 */
		readonly anchor: 'top' | 'bottom';
		/**
		 * The number of lines vertically from the anchor in the buffer to start matching against
		 */
		readonly offset: number;
		/**
		 * The number of rows to match against, this should be as small as possible for performance reasons
		 */
		readonly length: number;
	};
	/**
	 * The command exit result to match on
	 */
	readonly commandExitResult: 'success' | 'error';
	/**
	 * The kind of the resulting quick fix. This changes how the quick fix is presented. Defaults to `"fix"`.
	 */
	readonly kind?: 'default' | 'explain';
}

export interface IInteractiveSession {
	/**
	 * Unique identifier for this Interactive Session provider.
	 */
	readonly id: string;
	/**
	 * Display name for this Interactive Session provider.
	 */
	readonly label: string;
	/**
	 * An icon for this Interactive Session provider.
	 */
	readonly icon?: string;
	/**
	 * A condition which must be true to enable this Interactive Session provider.
	 */
	readonly when?: string;
}

export interface INotebook {
	/**
	 * Type of the notebook.
	 */
	readonly type: string;
	/**
	 * Human readable name of the notebook.
	 */
	readonly displayName: string;
	/**
	 * Set of globs that the notebook is for.
	 */
	readonly selector: {
		/**
		 * Glob that the notebook is enabled for.
		 */
		readonly filenamePattern?: string;
		/**
		 * Glob that the notebook is disabled for.
		 */
		readonly excludeFileNamePattern?: string;
	}[];
	readonly priority?: 'default' | 'option';
}

export interface NotebookPreload {
	/**
	 * Type of the notebook.
	 */
	readonly type: string;
	/**
	 * Path to file loaded in the webview.
	 */
	readonly entrypoint: string;
	/**
	 * Paths to additional resources that should be allowed in the webview.
	 */
	readonly localResourceRoots?: string[];
}

export interface IViewsWelcome {
	readonly view: string;
	/**
	 * Welcome content to be displayed. The format of the contents is a subset of Markdown, with support for links only.
	 */
	readonly contents: string;
	/**
	 * Condition when the welcome content should be displayed.
	 */
	readonly when?: string;
	/**
	 * Group to which this welcome content belongs. Proposed API.
	 */
	readonly group?: string;
	/**
	 * Condition when the welcome content buttons and command links should be enabled.
	 */
	readonly enablement?: string;
}

export interface IExtensionContributions {
	/**
	 * Contributes commands to the command palette.
	 */
	readonly commands?: ICommand[];
	/**
	 * Contributes configuration settings.
	 */
	readonly configuration?: IConfiguration | IConfiguration[];
	/**
	 * Contributes debug adapters.
	 */
	readonly debuggers?: IDebugger[];
	/**
	 * Contributes breakpoints.
	 */
	readonly breakpoints?: IBreakpoint[];
	/**
	 * Contributes textmate tokenizers.
	 */
	readonly grammars?: IGrammar[];
	/**
	 * Contributes json schema configuration.
	 */
	readonly jsonValidation?: IJSONValidation[];
	/**
	 * Contributes keybindings.
	 */
	readonly keybindings?: IKeyBinding[];
	/**
	 * Contributes language declarations.
	 */
	readonly languages?: ILanguage[];
	/**
	 * Contributes menu items to the editor
	 */
	readonly menus?: { [context: string]: IMenu[] };
	/**
	 * Contributes submenu items to the editor
	 */
	readonly submenus?: ISubMenu[];
	/**
	 * Contributes snippets.
	 */
	readonly snippets?: ISnippet[];
	/**
	 * Contributes textmate color themes.
	 */
	readonly themes?: IColorTheme[];
	/**
	 * Contributes file icon themes.
	 */
	readonly iconThemes?: IIconTheme[];
	/**
	 * Contributes product icon themes.
	 */
	readonly productIconThemes?: IProductTheme[];
	/**
	 * Contributes views containers to the editor
	 */
	readonly viewsContainers?: { [location: string]: IViewContainer[] };
	/**
	 * Contributes views to the editor
	 */
	readonly views?: { [location: string]: IView[] };
	/**
	 * Contributes extension defined themable colors
	 */
	readonly colors?: IColor[];
	/**
	 * Contributes localizations to the editor
	 */
	readonly localizations?: ILocalizationContribution[];
	/**
	 * Contributed custom editors.
	 */
	readonly customEditors?: readonly IWebviewEditor[];
	readonly codeActions?: readonly ICodeActionContribution[];
	/**
	 * Contributes authentication
	 */
	readonly authentication?: IAuthenticationContribution[];
	/**
	 * Contribute walkthroughs to help users getting started with your extension.
	 */
	readonly walkthroughs?: IWalkthrough[];
	readonly startEntries?: IStartEntry[];
	/**
	 * Contributes notebook document provider.
	 */
	readonly notebooks?: INotebookEntry[];
	/**
	 * Contributes notebook output renderer provider.
	 */
	readonly notebookRenderer?: INotebookRendererContribution[];
	readonly debugVisualizers?: IDebugVisualizationContribution[];
	/**
	 * Contributes notebook preloads.
	 */
	readonly notebookPreload?: NotebookPreload[];
	/**
	 * Contributes items to the status bar.
	 */
	readonly statusBarItems?: IStatusBarItem[];
	/**
	 * Contributes help information for Remote
	 */
	readonly remoteHelp?: IRemoteHelp;
	/**
	 * Contributes task kinds
	 */
	readonly taskDefinitions?: ITaskDefinitions[];
	/**
	 * Contributes terminal functionality.
	 */
	readonly terminal?: ITerminal;
	/**
	 * Contributes extension defined themable icons
	 */
	readonly icons?: { [id: string]: IIcon };
	/**
	 * Contributed documentation.
	 */
	readonly documentation?: IDocumentation;
	/**
	 * Contributes resource label formatting rules.
	 */
	readonly resourceLabelFormatters?: IResourceLabelFormatters[];
	readonly configurationDefaults?: { [id: string]: any };
	/**
	 * Contributes semantic token types.
	 */
	readonly semanticTokenTypes?: ISemanticTokenTypes[];
	/**
	 * Contributes semantic token modifiers.
	 */
	readonly semanticTokenModifiers?: ISemanticTokenModifiers[];
	/**
	 * Contributes semantic token scope maps.
	 */
	readonly semanticTokenScopes?: ISemanticTokenScopes[];
	/**
	 * Contributes terminal quick fixes.
	 */
	readonly terminalQuickFixes?: ITerminalQuickFix[];
	/**
	 * Contributes an Interactive Session provider
	 */
	readonly interactiveSession?: IInteractiveSession[];
	/**
	 * Contributed views welcome content. Welcome content will be rendered in tree based views whenever they have no meaningful content to display, ie. the File Explorer when no folder is open. Such content is useful as in-product documentation to drive users to use certain features before they are available. A good example would be a `Clone Repository` button in the File Explorer welcome view.
	 */
	readonly viewsWelcome?: IViewsWelcome[];
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
