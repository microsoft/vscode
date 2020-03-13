/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents, URI } from 'vs/base/common/uri';
import { IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, FileChangeType } from 'vs/platform/files/common/files';
import { IWebSocketFactory, IWebSocket } from 'vs/platform/remote/browser/browserSocketFactory';
import { ICredentialsProvider } from 'vs/workbench/services/credentials/browser/credentialsService';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IURLCallbackProvider } from 'vs/workbench/services/url/browser/urlService';
import { LogLevel } from 'vs/platform/log/common/log';
import { IUpdateProvider, IUpdate } from 'vs/workbench/services/update/browser/updateService';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceProvider, IWorkspace } from 'vs/workbench/services/host/browser/browserHostService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

interface IResourceUriProvider {
	(uri: URI): URI;
}

interface IStaticExtension {
	packageJSON: IExtensionManifest;
	extensionLocation: URI;
}

interface ICommontTelemetryPropertiesResolver {
	(): { [key: string]: any };
}

interface IExternalUriResolver {
	(uri: URI): Promise<URI>;
}

interface TunnelOptions {
	remoteAddress: { port: number, host: string };
	/**
	 * The desired local port. If this port can't be used, then another will be chosen.
	 */
	localAddressPort?: number;
	label?: string;
}

interface Tunnel extends IDisposable {
	remoteAddress: { port: number, host: string };
	/**
	 * The complete local address(ex. localhost:1234)
	 */
	localAddress: string;
	/**
	 * Implementers of Tunnel should fire onDidDispose when dispose is called.
	 */
	onDidDispose: Event<void>;
}

interface ITunnelFactory {
	(tunnelOptions: TunnelOptions): Thenable<Tunnel> | undefined;
}

interface IShowCandidate {
	(host: string, port: number, detail: string): Thenable<boolean>;
}

interface IApplicationLink {

	/**
	 * A link that is opened in the OS. If you want to open VSCode it must
	 * follow our expected structure of links:
	 *
	 * <vscode|vscode-insiders>://<file|vscode-remote>/<remote-authority>/<path>
	 *
	 * For example:
	 *
	 * vscode://vscode-remote/vsonline+2005711d/home/vsonline/workspace for
	 * a remote folder in VSO or vscode://file/home/workspace for a local folder.
	 */
	uri: URI;

	/**
	 * A label for the application link to display.
	 */
	label: string;
}

interface ICommand {

	/**
	 * An identifier for the command. Commands can be executed from extensions
	 * using the `vscode.commands.executeCommand` API using that command ID.
	 */
	id: string,

	/**
	 * A function that is being executed with any arguments passed over.
	 */
	handler: (...args: any[]) => void;
}

interface IWorkbenchConstructionOptions {

	//#region Connection related configuration

	/**
	 * The remote authority is the IP:PORT from where the workbench is served
	 * from. It is for example being used for the websocket connections as address.
	 */
	readonly remoteAuthority?: string;

	/**
	 * The connection token to send to the server.
	 */
	readonly connectionToken?: string;

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
	 */
	readonly resourceUriProvider?: IResourceUriProvider;

	/**
	 * Resolves an external uri before it is opened.
	 */
	readonly resolveExternalUri?: IExternalUriResolver;

	/**
	 * Support for creating tunnels.
	 */
	readonly tunnelFactory?: ITunnelFactory;

	/**
	 * Support for filtering candidate ports
	 */
	readonly showCandidate?: IShowCandidate;

	//#endregion


	//#region Workbench configuration

	/**
	 * A handler for opening workspaces and providing the initial workspace.
	 */
	readonly workspaceProvider?: IWorkspaceProvider;

	/**
	 * The user data provider is used to handle user specific application
	 * state like settings, keybindings, UI state (e.g. opened editors) and snippets.
	 */
	userDataProvider?: IFileSystemProvider;

	/**
	 * The credentials provider to store and retrieve secrets.
	 */
	readonly credentialsProvider?: ICredentialsProvider;

	/**
	 * Add static extensions that cannot be uninstalled but only be disabled.
	 */
	readonly staticExtensions?: ReadonlyArray<IStaticExtension>;

	/**
	 * Support for URL callbacks.
	 */
	readonly urlCallbackProvider?: IURLCallbackProvider;

	/**
	 * Support for update reporting.
	 */
	readonly updateProvider?: IUpdateProvider;

	/**
	 * Support adding additional properties to telemetry.
	 */
	readonly resolveCommonTelemetryProperties?: ICommontTelemetryPropertiesResolver;

	/**
	 * Provide entries for the "Open in Desktop" feature.
	 *
	 * Depending on the returned elements the behaviour is:
	 * - no elements: there will not be a "Open in Desktop" affordance
	 * - 1 element: there will be a "Open in Desktop" affordance that opens on click
	 *   and it will use the label provided by the link
	 * - N elements: there will be a "Open in Desktop" affordance that opens
	 *   a picker on click to select which application to open.
	 */
	readonly applicationLinks?: readonly IApplicationLink[];

	/**
	 * A set of optional commands that should be registered with the commands
	 * registry.
	 *
	 * Note: commands can be called from extensions if the identifier is known!
	 */
	readonly commands?: readonly ICommand[];

	//#endregion


	//#region Diagnostics

	/**
	 * Current logging level. Default is `LogLevel.Info`.
	 */
	readonly logLevel?: LogLevel;

	/**
	 * Whether to enable the smoke test driver.
	 */
	readonly driver?: boolean;

	//#endregion
}

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
let created = false;
async function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {

	// Assert that the workbench is not created more than once. We currently
	// do not support this and require a full context switch to clean-up.
	if (created) {
		throw new Error('Unable to create the VSCode workbench more than once.');
	} else {
		created = true;
	}

	// Startup workbench
	await main(domElement, options);

	// Register commands if any
	if (Array.isArray(options.commands)) {
		for (const command of options.commands) {
			CommandsRegistry.registerCommand(command.id, (accessor, ...args) => {
				// we currently only pass on the arguments but not the accessor
				// to the command to reduce our exposure of internal API.
				command.handler(...args);
			});
		}
	}
}

export {

	// Factory
	create,
	IWorkbenchConstructionOptions,


	// Basic Types
	URI,
	UriComponents,
	Event,
	Emitter,
	IDisposable,
	Disposable,

	// Workspace
	IWorkspace,
	IWorkspaceProvider,

	// FileSystem
	IFileSystemProvider,
	FileSystemProviderCapabilities,
	IFileChange,
	FileChangeType,

	// WebSockets
	IWebSocketFactory,
	IWebSocket,

	// Resources
	IResourceUriProvider,

	// Credentials
	ICredentialsProvider,

	// Static Extensions
	IStaticExtension,
	IExtensionManifest,

	// Callbacks
	IURLCallbackProvider,

	// LogLevel
	LogLevel,

	// Updates
	IUpdateProvider,
	IUpdate,

	// Telemetry
	ICommontTelemetryPropertiesResolver,

	// External Uris
	IExternalUriResolver,

	// Protocol Links
	IApplicationLink,

	// Commands
	ICommand
};
