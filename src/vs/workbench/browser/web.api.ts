/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PerformanceMark } from '../../base/common/performance.js';
import type { UriComponents, URI } from '../../base/common/uri.js';
import type { IWebSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import type { IURLCallbackProvider } from '../services/url/browser/urlService.js';
import type { LogLevel } from '../../platform/log/common/log.js';
import type { IUpdateProvider } from '../services/update/browser/updateService.js';
import type { Event } from '../../base/common/event.js';
import type { IProductConfiguration } from '../../base/common/product.js';
import type { ISecretStorageProvider } from '../../platform/secrets/common/secrets.js';
import type { TunnelProviderFeatures } from '../../platform/tunnel/common/tunnel.js';
import type { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressStep, IProgressWindowOptions } from '../../platform/progress/common/progress.js';
import type { ITextEditorOptions } from '../../platform/editor/common/editor.js';
import type { IFolderToOpen, IWorkspaceToOpen } from '../../platform/window/common/window.js';
import type { EditorGroupLayout } from '../services/editor/common/editorGroupsService.js';
import type { IEmbedderTerminalOptions } from '../services/terminal/common/embedderTerminalService.js';
import type { IAuthenticationProvider } from '../services/authentication/common/authentication.js';

/**
 * The `IWorkbench` interface is the API facade for web embedders
 * to call into the workbench.
 *
 * Note: Changes to this interface need to be announced and adopted.
 */
export interface IWorkbench {

	commands: {

		/**
		 * Allows to execute any command if known with the provided arguments.
		 *
		 * @param command Identifier of the command to execute.
		 * @param rest Parameters passed to the command function.
		 * @return A promise that resolves to the returned value of the given command.
		 */
		executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
	};

	logger: {

		/**
		 * Logging for embedder.
		 *
		 * @param level The log level of the message to be printed.
		 * @param message Message to be printed.
		 */
		log(level: LogLevel, message: string): void;
	};

	env: {

		/**
		 * @returns the scheme to use for opening the associated desktop
		 * experience via protocol handler.
		 */
		getUriScheme(): Promise<string>;

		/**
		 * Retrieve performance marks that have been collected during startup. This function
		 * returns tuples of source and marks. A source is a dedicated context, like
		 * the renderer or an extension host.
		 *
		 * *Note* that marks can be collected on different machines and in different processes
		 * and that therefore "different clocks" are used. So, comparing `startTime`-properties
		 * across contexts should be taken with a grain of salt.
		 *
		 * @returns A promise that resolves to tuples of source and marks.
		 */
		retrievePerformanceMarks(): Promise<[string, readonly PerformanceMark[]][]>;

		/**
		 * Allows to open a target Uri with the standard opener service of the
		 * workbench.
		 */
		openUri(target: URI | UriComponents): Promise<boolean>;
	};

	window: {

		/**
		 * Show progress in the editor. Progress is shown while running the given callback
		 * and while the promise it returned isn't resolved nor rejected.
		 *
		 * @param task A callback returning a promise.
		 * @return A promise that resolves to the returned value of the given task result.
		 */
		withProgress<R>(
			options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
			task: (progress: IProgress<IProgressStep>) => Promise<R>
		): Promise<R>;

		/**
		 * Creates a terminal with limited capabilities that is intended for
		 * writing output from the embedder before the workbench has finished
		 * loading. When an embedder terminal is created it will automatically
		 * show to the user.
		 *
		 * @param options The definition of the terminal, this is similar to
		 * `ExtensionTerminalOptions` in the extension API.
		 */
		createTerminal(options: IEmbedderTerminalOptions): Promise<void>;

		/**
		 * Show an information message to users. Optionally provide an array of items which will be presented as
		 * clickable buttons.
		 *
		 * @param message The message to show.
		 * @param items A set of items that will be rendered as actions in the message.
		 * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
		 */
		showInformationMessage<T extends string>(message: string, ...items: T[]): Promise<T | undefined>;
	};

	workspace: {
		/**
		 * Resolves once the remote authority has been resolved.
		 */
		didResolveRemoteAuthority(): Promise<void>;

		/**
		 * Forwards a port. If the current embedder implements a tunnelFactory then that will be used to make the tunnel.
		 * By default, openTunnel only support localhost; however, a tunnelFactory can be used to support other ips.
		 *
		 * @throws When run in an environment without a remote.
		 *
		 * @param tunnelOptions The `localPort` is a suggestion only. If that port is not available another will be chosen.
		 */
		openTunnel(tunnelOptions: ITunnelOptions): Promise<ITunnel>;
	};

	/**
	 * Triggers shutdown of the workbench programmatically. After this method is
	 * called, the workbench is not usable anymore and the page needs to reload
	 * or closed.
	 *
	 * This will also remove any `beforeUnload` handlers that would bring up a
	 * confirmation dialog.
	 *
	 * The returned promise should be awaited on to ensure any data to persist
	 * has been persisted.
	 */
	shutdown: () => Promise<void>;
}

export interface IWorkbenchConstructionOptions {

	//#region Connection related configuration

	/**
	 * The remote authority is the IP:PORT from where the workbench is served
	 * from. It is for example being used for the websocket connections as address.
	 */
	readonly remoteAuthority?: string;

	/**
	 * The server base path is the path where the workbench is served from.
	 * The path must be absolute (start with a slash).
	 * Corresponds to option `server-base-path` on the server side.
	 */
	readonly serverBasePath?: string;

	/**
	 * The connection token to send to the server.
	 */
	readonly connectionToken?: string | Promise<string>;

	/**
	 * An endpoint to serve iframe content ("webview") from. This is required
	 * to provide full security isolation from the workbench host.
	 */
	readonly webviewEndpoint?: string;

	/**
	 * A factory for web sockets.
	 */
	readonly webSocketFactory?: IWebSocketFactory;

	/**
	 * A provider for resource URIs.
	 *
	 * *Note*: This will only be invoked after the `connectionToken` is resolved.
	 */
	readonly resourceUriProvider?: IResourceUriProvider;

	/**
	 * Resolves an external uri before it is opened.
	 */
	readonly resolveExternalUri?: IExternalUriResolver;

	/**
	 * A provider for supplying tunneling functionality,
	 * such as creating tunnels and showing candidate ports to forward.
	 */
	readonly tunnelProvider?: ITunnelProvider;

	/**
	 * Endpoints to be used for proxying authentication code exchange calls in the browser.
	 */
	readonly codeExchangeProxyEndpoints?: { [providerId: string]: string };

	/**
	 * The identifier of an edit session associated with the current workspace.
	 */
	readonly editSessionId?: string;

	/**
	 * Resource delegation handler that allows for loading of resources when
	 * using remote resolvers.
	 *
	 * This is exclusive with {@link resourceUriProvider}. `resourceUriProvider`
	 * should be used if a {@link webSocketFactory} is used, and will be preferred.
	 */
	readonly remoteResourceProvider?: IRemoteResourceProvider;

	//#endregion


	//#region Workbench configuration

	/**
	 * A handler for opening workspaces and providing the initial workspace.
	 */
	readonly workspaceProvider?: IWorkspaceProvider;

	/**
	 * Settings sync options
	 */
	readonly settingsSyncOptions?: ISettingsSyncOptions;

	/**
	 * The secret storage provider to store and retrieve secrets.
	 */
	readonly secretStorageProvider?: ISecretStorageProvider;

	/**
	 * Additional builtin extensions those cannot be uninstalled but only be disabled.
	 * It can be one of the following:
	 * 	- an extension in the Marketplace
	 * 	- location of the extension where it is hosted.
	 */
	readonly additionalBuiltinExtensions?: readonly (MarketplaceExtension | UriComponents)[];

	/**
	 * List of extensions to be enabled if they are installed.
	 * Note: This will not install extensions if not installed.
	 */
	readonly enabledExtensions?: readonly ExtensionId[];

	/**
	 * Additional domains allowed to open from the workbench without the
	 * link protection popup.
	 */
	readonly additionalTrustedDomains?: string[];

	/**
	 * Enable workspace trust feature for the current window
	 */
	readonly enableWorkspaceTrust?: boolean;

	/**
	 * Urls that will be opened externally that are allowed access
	 * to the opener window. This is primarily used to allow
	 * `window.close()` to be called from the newly opened window.
	 */
	readonly openerAllowedExternalUrlPrefixes?: string[];

	/**
	 * Support for URL callbacks.
	 */
	readonly urlCallbackProvider?: IURLCallbackProvider;

	/**
	 * Support adding additional properties to telemetry.
	 */
	readonly resolveCommonTelemetryProperties?: ICommonTelemetryPropertiesResolver;

	/**
	 * A set of optional commands that should be registered with the commands
	 * registry.
	 *
	 * Note: commands can be called from extensions if the identifier is known!
	 */
	readonly commands?: readonly ICommand[];

	/**
	 * Optional default layout to apply on first time the workspace is opened
	 * (unless `force` is specified). This includes visibility of views and
	 * editors including editor grid layout.
	 */
	readonly defaultLayout?: IDefaultLayout;

	/**
	 * Optional configuration default overrides contributed to the workbench.
	 */
	readonly configurationDefaults?: Record<string, unknown>;

	//#endregion

	//#region Profile options

	/**
	 * Profile to use for the workbench.
	 */
	readonly profile?: { readonly name: string; readonly contents?: string | UriComponents };

	/**
	 * URI of the profile to preview.
	 */
	readonly profileToPreview?: UriComponents;

	//#endregion


	//#region Update/Quality related

	/**
	 * Support for update reporting
	 */
	readonly updateProvider?: IUpdateProvider;

	/**
	 * Support for product quality switching
	 */
	readonly productQualityChangeHandler?: IProductQualityChangeHandler;

	//#endregion


	//#region Branding

	/**
	 * Optional welcome banner to appear above the workbench. Can be dismissed by the
	 * user.
	 */
	readonly welcomeBanner?: IWelcomeBanner;

	/**
	 * Optional override for the product configuration properties.
	 */
	readonly productConfiguration?: Partial<IProductConfiguration>;

	/**
	 * Optional override for properties of the window indicator in the status bar.
	 */
	readonly windowIndicator?: IWindowIndicator;

	/**
	 * Specifies the default theme type (LIGHT, DARK..) and allows to provide initial colors that are shown
	 * until the color theme that is specified in the settings (`editor.colorTheme`) is loaded and applied.
	 * Once there are persisted colors from a last run these will be used.
	 *
	 * The idea is that the colors match the main colors from the theme defined in the `configurationDefaults`.
	 */
	readonly initialColorTheme?: IInitialColorTheme;

	//#endregion


	//#region IPC

	readonly messagePorts?: ReadonlyMap<ExtensionId, MessagePort>;

	//#endregion

	//#region Authentication Providers

	/**
	 * Optional authentication provider contributions. These take precedence over
	 * any authentication providers contributed via extensions.
	 */
	readonly authenticationProviders?: readonly IAuthenticationProvider[];

	//#endregion

	//#region Development options

	readonly developmentOptions?: IDevelopmentOptions;

	//#endregion

}


/**
 * A workspace to open in the workbench can either be:
 * - a workspace file with 0-N folders (via `workspaceUri`)
 * - a single folder (via `folderUri`)
 * - empty (via `undefined`)
 */
export type IWorkspace = IWorkspaceToOpen | IFolderToOpen | undefined;

export interface IWorkspaceProvider {

	/**
	 * The initial workspace to open.
	 */
	readonly workspace: IWorkspace;

	/**
	 * Arbitrary payload from the `IWorkspaceProvider.open` call.
	 */
	readonly payload?: object;

	/**
	 * Return `true` if the provided [workspace](#IWorkspaceProvider.workspace) is trusted, `false` if not trusted, `undefined` if unknown.
	 */
	readonly trusted: boolean | undefined;

	/**
	 * Asks to open a workspace in the current or a new window.
	 *
	 * @param workspace the workspace to open.
	 * @param options optional options for the workspace to open.
	 * - `reuse`: whether to open inside the current window or a new window
	 * - `payload`: arbitrary payload that should be made available
	 * to the opening window via the `IWorkspaceProvider.payload` property.
	 * @param payload optional payload to send to the workspace to open.
	 *
	 * @returns true if successfully opened, false otherwise.
	 */
	open(workspace: IWorkspace, options?: { reuse?: boolean; payload?: object }): Promise<boolean>;
}

export interface IResourceUriProvider {
	(uri: URI): URI;
}

/**
 * The identifier of an extension in the format: `PUBLISHER.NAME`. For example: `vscode.csharp`
 */
export type ExtensionId = string;

export type MarketplaceExtension = ExtensionId | { readonly id: ExtensionId; preRelease?: boolean; migrateStorageFrom?: ExtensionId };

export interface ICommonTelemetryPropertiesResolver {
	(): { [key: string]: unknown };
}

export interface IExternalUriResolver {
	(uri: URI): Promise<URI>;
}

export interface IExternalURLOpener {

	/**
	 * Overrides the behavior when an external URL is about to be opened.
	 * Returning false means that the URL wasn't handled, and the default
	 * handling behavior should be used: `window.open(href, '_blank', 'noopener');`
	 *
	 * @returns true if URL was handled, false otherwise.
	 */
	openExternal(href: string): boolean | Promise<boolean>;
}

export interface ITunnelProvider {

	/**
	 * Support for creating tunnels.
	 */
	tunnelFactory?: ITunnelFactory;

	/**
	 * Support for filtering candidate ports.
	 */
	showPortCandidate?: IShowPortCandidate;

	/**
	 * The features that the tunnel provider supports.
	 */
	features?: TunnelProviderFeatures;
}

export interface ITunnelFactory {
	(tunnelOptions: ITunnelOptions, tunnelCreationOptions: TunnelCreationOptions): Promise<ITunnel> | undefined;
}

export interface ITunnelOptions {

	remoteAddress: { port: number; host: string };

	/**
	 * The desired local port. If this port can't be used, then another will be chosen.
	 */
	localAddressPort?: number;

	label?: string;

	privacy?: string;

	protocol?: string;
}

export interface TunnelCreationOptions {

	/**
	 * True when the local operating system will require elevation to use the requested local port.
	 */
	elevationRequired?: boolean;
}

export interface ITunnel {

	remoteAddress: { port: number; host: string };

	/**
	 * The complete local address(ex. localhost:1234)
	 */
	localAddress: string;

	privacy?: string;

	/**
	 * If protocol is not provided, it is assumed to be http, regardless of the localAddress
	 */
	protocol?: string;

	/**
	 * Implementers of Tunnel should fire onDidDispose when dispose is called.
	 */
	readonly onDidDispose: Event<void>;

	dispose(): Promise<void> | void;
}

export interface IShowPortCandidate {
	(host: string, port: number, detail: string): Promise<boolean>;
}

export enum Menu {
	CommandPalette,
	StatusBarWindowIndicatorMenu,
}

export interface ICommand {

	/**
	 * An identifier for the command. Commands can be executed from extensions
	 * using the `vscode.commands.executeCommand` API using that command ID.
	 */
	id: string;

	/**
	 * The optional label of the command. If provided, the command will appear
	 * in the command palette.
	 */
	label?: string;

	/**
	 * The optional menus to append this command to. Only valid if `label` is
	 * provided as well.
	 * @default Menu.CommandPalette
	 */
	menu?: Menu | Menu[];

	/**
	 * A function that is being executed with any arguments passed over. The
	 * return type will be send back to the caller.
	 *
	 * Note: arguments and return type should be serializable so that they can
	 * be exchanged across processes boundaries.
	 */
	handler: (...args: unknown[]) => unknown;
}

export interface IWelcomeBanner {

	/**
	 * Welcome banner message to appear as text.
	 */
	message: string;

	/**
	 * Optional icon for the banner. This is either the URL to an icon to use
	 * or the name of one of the existing icons from our Codicon icon set.
	 *
	 * If not provided a default icon will be used.
	 */
	icon?: string | UriComponents;

	/**
	 * Optional actions to appear as links after the welcome banner message.
	 */
	actions?: IWelcomeLinkAction[];
}

export interface IWelcomeLinkAction {

	/**
	 * The link to open when clicking. Supports command invocation when
	 * using the `command:<commandId>` value.
	 */
	href: string;

	/**
	 * The label to show for the action link.
	 */
	label: string;

	/**
	 * A tooltip that will appear while hovering over the action link.
	 */
	title?: string;
}

export interface IWindowIndicator {

	/**
	 * Triggering this event will cause the window indicator to update.
	 */
	readonly onDidChange?: Event<void>;

	/**
	 * Label of the window indicator may include octicons
	 * e.g. `$(remote) label`
	 */
	label: string;

	/**
	 * Tooltip of the window indicator should not include
	 * octicons and be descriptive.
	 */
	tooltip: string;

	/**
	 * If provided, overrides the default command that
	 * is executed when clicking on the window indicator.
	 */
	command?: string;
}

export enum ColorScheme {
	DARK = 'dark',
	LIGHT = 'light',
	HIGH_CONTRAST_LIGHT = 'hcLight',
	HIGH_CONTRAST_DARK = 'hcDark'
}

export interface IInitialColorTheme {

	/**
	 * Initial color theme type.
	 */
	readonly themeType: ColorScheme;

	/**
	 * A list of workbench colors to apply initially.
	 */
	readonly colors?: { [colorId: string]: string };
}

export interface IDefaultView {

	/**
	 * The identifier of the view to show by default.
	 */
	readonly id: string;
}

export interface IDefaultEditor {

	/**
	 * The location of the editor in the editor grid layout.
	 * Editors are layed out in editor groups and the view
	 * column is counted from top left to bottom right in
	 * the order of appearance beginning with `1`.
	 *
	 * If not provided, the editor will open in the active
	 * group.
	 */
	readonly viewColumn?: number;

	/**
	 * The resource of the editor to open.
	 */
	readonly uri: UriComponents;

	/**
	 * Optional extra options like which editor
	 * to use or which text to select.
	 */
	readonly options?: ITextEditorOptions;

	/**
	 * Will not open an untitled editor in case
	 * the resource does not exist.
	 */
	readonly openOnlyIfExists?: boolean;
}

export interface IDefaultLayout {

	/**
	 * A list of views to show by default.
	 */
	readonly views?: IDefaultView[];

	/**
	 * A list of editors to show by default.
	 */
	readonly editors?: IDefaultEditor[];

	/**
	 * The layout to use for the workbench.
	 */
	readonly layout?: {

		/**
		 * The layout of the editor area.
		 */
		readonly editors?: EditorGroupLayout;
	};

	/**
	 * Forces this layout to be applied even if this isn't
	 * the first time the workspace has been opened
	 */
	readonly force?: boolean;
}

export interface IProductQualityChangeHandler {

	/**
	 * Handler is being called when the user wants to switch between
	 * `insider` or `stable` product qualities.
	 */
	(newQuality: 'insider' | 'stable'): void;
}

/**
 * Settings sync options
 */
export interface ISettingsSyncOptions {

	/**
	 * Is settings sync enabled
	 */
	readonly enabled: boolean;

	/**
	 * Version of extensions sync state.
	 * Extensions sync state will be reset if version is provided and different from previous version.
	 */
	readonly extensionsSyncStateVersion?: string;

	/**
	 * Handler is being called when the user changes Settings Sync enablement.
	 */
	enablementHandler?(enablement: boolean, authenticationProvider: string): void;

	/**
	 * Authentication provider
	 */
	readonly authenticationProvider?: {

		/**
		 * Unique identifier of the authentication provider.
		 */
		readonly id: string;

		/**
		 * Called when the user wants to signin to Settings Sync using the given authentication provider.
		 * The returned promise should resolve to the authentication session id.
		 */
		signIn(): Promise<string>;
	};
}

export interface IDevelopmentOptions {

	/**
	 * Current logging level. Default is `LogLevel.Info`.
	 */
	readonly logLevel?: LogLevel;

	/**
	 * Extension log level.
	 */
	readonly extensionLogLevel?: [string, LogLevel][];

	/**
	 * Location of a module containing extension tests to run once the workbench is open.
	 */
	readonly extensionTestsPath?: UriComponents;

	/**
	 * Add extensions under development.
	 */
	readonly extensions?: readonly UriComponents[];

	/**
	 * Whether to enable the smoke test driver.
	 */
	readonly enableSmokeTestDriver?: boolean;
}

/**
 * Utility provided in the {@link WorkbenchOptions} which allows loading resources
 * when remote resolvers are used in the web.
 */
export interface IRemoteResourceProvider {

	/**
	 * Path the workbench should delegate requests to. The embedder should
	 * install a service worker on this path and emit {@link onDidReceiveRequest}
	 * events when requests come in for that path.
	 */
	readonly path: string;

	/**
	 * Event that should fire when requests are made on the {@link pathPrefix}.
	 */
	readonly onDidReceiveRequest: Event<IRemoteResourceRequest>;
}

/**
 * todo@connor4312: this may eventually gain more properties like method and
 * headers, but for now we only deal with GET requests.
 */
export interface IRemoteResourceRequest {

	/**
	 * Request URI. Generally will begin with the current
	 * origin and {@link IRemoteResourceProvider.pathPrefix}.
	 */
	uri: URI;

	/**
	 * A method called by the editor to issue a response to the request.
	 */
	respondWith(statusCode: number, body: Uint8Array, headers: Record<string, string>): void;
}
