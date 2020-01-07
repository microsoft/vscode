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

interface IWorkbenchConstructionOptions {

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
	 * A handler for opening workspaces and providing the initial workspace.
	 */
	readonly workspaceProvider?: IWorkspaceProvider;

	/**
	 * The user data provider is used to handle user specific application
	 * state like settings, keybindings, UI state (e.g. opened editors) and snippets.
	 */
	userDataProvider?: IFileSystemProvider;

	/**
	 * A factory for web sockets.
	 */
	readonly webSocketFactory?: IWebSocketFactory;

	/**
	 * A provider for resource URIs.
	 */
	readonly resourceUriProvider?: IResourceUriProvider;

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
	 * Resolves an external uri before it is opened.
	 */
	readonly resolveExternalUri?: IExternalUriResolver;

	/**
	 * Current logging level. Default is `LogLevel.Info`.
	 */
	readonly logLevel?: LogLevel;

	/**
	 * Whether to enable the smoke test driver.
	 */
	readonly driver?: boolean;
}

/**
 * Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {
	return main(domElement, options);
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
	IExternalUriResolver
};
