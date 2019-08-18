/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents } from 'vs/base/common/uri';
import { IFileSystemProvider } from 'vs/platform/files/common/files';
import { IWebSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { ICredentialsProvider } from 'vs/workbench/services/credentials/browser/credentialsService';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

export interface IWorkbenchConstructionOptions {

	/**
	 * Experimental: the remote authority is the IP:PORT from where the workbench is served
	 * from. It is for example being used for the websocket connections as address.
	 */
	remoteAuthority: string;

	/**
	 * The connection token to send to the server.
	 */
	connectionToken?: string;

	/**
	 * Experimental: An endpoint to serve iframe content ("webview") from. This is required
	 * to provide full security isolation from the workbench host.
	 */
	webviewEndpoint?: string;

	/**
	 * Experimental: An optional folder that is set as workspace context for the workbench.
	 */
	folderUri?: UriComponents;

	/**
	 * Experimental: An optional workspace that is set as workspace context for the workbench.
	 */
	workspaceUri?: UriComponents;

	/**
	 * Experimental: The userDataProvider is used to handle user specific application
	 * state like settings, keybindings, UI state (e.g. opened editors) and snippets.
	 */
	userDataProvider?: IFileSystemProvider;

	/**
	 * A factory for web sockets.
	 */
	webSocketFactory?: IWebSocketFactory;

	/**
	 * Experimental: Whether to enable the smoke test driver.
	 */
	driver?: boolean;

	/**
	 * Experimental: The credentials provider to store and retrieve secrets.
	 */
	credentialsProvider?: ICredentialsProvider;

	/**
	 * Experimental: Add static extensions that cannot be uninstalled but only be disabled.
	 */
	staticExtensions?: { packageJSON: IExtensionManifest, extensionLocation: UriComponents }[];
}

/**
 * Experimental: Creates the workbench with the provided options in the provided container.
 *
 * @param domElement the container to create the workbench in
 * @param options for setting up the workbench
 */
function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {
	return main(domElement, options);
}

export {
	create
};
