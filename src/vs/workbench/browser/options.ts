/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { UriComponents, URI } from 'vs/base/common/uri';
import { IFileSystemProvider } from 'vs/platform/files/common/files';
import { IWebSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { ICredentialsProvider } from 'vs/workbench/services/credentials/browser/credentialsService';
import { IURLCallbackProvider } from 'vs/workbench/services/url/browser/urlService';
import { LogLevel } from 'vs/platform/log/common/log';
import { IUpdateProvider } from 'vs/workbench/services/update/browser/updateService';
import { IWorkspaceProvider } from 'vs/workbench/services/host/browser/browserHostService';
import { IProductConfiguration } from 'vs/platform/product/common/productService';
import { IWorkbenchConstructionOptions } from 'vs/workbench/common/options';

export interface IResourceUriProvider {
	(uri: URI): URI;
}

export interface ICommonTelemetryPropertiesResolver {
	(): { [key: string]: any };
}

export interface IExternalUriResolver {
	(uri: URI): Promise<URI>;
}

export interface ICommand {

	/**
	 * An identifier for the command. Commands can be executed from extensions
	 * using the `vscode.commands.executeCommand` API using that command ID.
	 */
	id: string,

	/**
	 * A function that is being executed with any arguments passed over. The
	 * return type will be send back to the caller.
	 *
	 * Note: arguments and return type should be serializable so that they can
	 * be exchanged across processes boundaries.
	 */
	handler: (...args: any[]) => unknown;
}

export interface IHomeIndicator {

	/**
	 * The link to open when clicking the home indicator.
	 */
	href: string;

	/**
	 * The icon name for the home indicator. This needs to be one of the existing
	 * icons from our Codicon icon set. For example `sync`.
	 */
	icon: string;

	/**
	 * A tooltip that will appear while hovering over the home indicator.
	 */
	title: string;
}

export interface IDefaultSideBarLayout {
	visible?: boolean;
	containers?: ({
		id: 'explorer' | 'run' | 'scm' | 'search' | 'extensions' | 'remote' | string;
		active: true;
		order?: number;
		views?: {
			id: string;
			order?: number;
			visible?: boolean;
			collapsed?: boolean;
		}[];
	} | {
		id: 'explorer' | 'run' | 'scm' | 'search' | 'extensions' | 'remote' | string;
		active?: false;
		order?: number;
		visible?: boolean;
		views?: {
			id: string;
			order?: number;
			visible?: boolean;
			collapsed?: boolean;
		}[];
	})[];
}

export interface IDefaultPanelLayout {
	visible?: boolean;
	containers?: ({
		id: 'terminal' | 'debug' | 'problems' | 'output' | 'comments' | string;
		order?: number;
		active: true;
	} | {
		id: 'terminal' | 'debug' | 'problems' | 'output' | 'comments' | string;
		order?: number;
		active?: false;
		visible?: boolean;
	})[];
}

export interface IDefaultView {
	readonly id: string;
}

export interface IDefaultEditor {
	readonly uri: UriComponents;
	readonly openOnlyIfExists?: boolean;
	readonly openWith?: string;
}

export interface IDefaultLayout {
	/** @deprecated Use views instead (TODO@eamodio remove eventually) */
	readonly sidebar?: IDefaultSideBarLayout;
	/** @deprecated Use views instead (TODO@eamodio remove eventually) */
	readonly panel?: IDefaultPanelLayout;
	readonly views?: IDefaultView[];
	readonly editors?: IDefaultEditor[];
}

export interface IProductQualityChangeHandler {

	/**
	 * Handler is being called when the user wants to switch between
	 * `insider` or `stable` product qualities.
	 */
	(newQuality: 'insider' | 'stable'): void;
}

export interface IBrowserWorkbenchConstructionOptions extends IWorkbenchConstructionOptions {

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
	 * Session id of the current authenticated user
	 */
	readonly authenticationSessionId?: string;

	/**
	 * Enables user data sync by default and syncs into the current authenticated user account using the provided [authenticationSessionId}(#authenticationSessionId).
	 */
	readonly enableSyncByDefault?: boolean;

	/**
	 * The credentials provider to store and retrieve secrets.
	 */
	readonly credentialsProvider?: ICredentialsProvider;

	/**
	 * Service end-point hosting builtin extensions
	 */
	readonly builtinExtensionsServiceUrl?: string;

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
	 * Optional default layout to apply on first time the workspace is opened.
	 */
	readonly defaultLayout?: IDefaultLayout;

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
	 * Optional home indicator to appear above the hamburger menu in the activity bar.
	 */
	readonly homeIndicator?: IHomeIndicator;

	/**
	 * Optional override for the product configuration properties.
	 */
	readonly productConfiguration?: Partial<IProductConfiguration>;

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
