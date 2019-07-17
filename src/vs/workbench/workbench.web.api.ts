/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents } from 'vs/base/common/uri';
import { IFileSystemProvider } from 'vs/platform/files/common/files';
import { IRequestOptions, IRequestContext } from 'vs/platform/request/common/request';

export interface IWorkbenchConstructionOptions {

	/**
	 * Experimental: the remote authority is the IP:PORT from where the workbench is served
	 * from. It is for example being used for the websocket connections as address.
	 */
	remoteAuthority: string;

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
	 * Experimental: Optional request handler to handle http requests.
	 * In case not provided, workbench uses <code>XMLHttpRequest</code>.
	 */
	requestHandler?: (requestOptions: IRequestOptions) => Promise<IRequestContext>;
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