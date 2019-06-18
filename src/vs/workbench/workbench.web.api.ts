/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents } from 'vs/base/common/uri';

export interface IWorkbenchConstructionOptions {
	remoteAuthority: string;

	userDataUri: UriComponents;

	webviewEndpoint?: string;

	folderUri?: UriComponents;
	workspaceUri?: UriComponents;
}

function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {
	return main(domElement, options);
}

export {
	create
};