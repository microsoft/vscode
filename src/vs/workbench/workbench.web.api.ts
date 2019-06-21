/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/workbench.web.main';
import { main } from 'vs/workbench/browser/web.main';
import { UriComponents } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';

export interface IWorkbenchConstructionOptions {
	remoteAuthority: string;

	webviewEndpoint?: string;

	folderUri?: UriComponents;
	workspaceUri?: UriComponents;

	userData?: {
		read(key: string): Promise<string>;
		write(key: string, value: string): Promise<void>;
		onDidChange: Event<string>;
	};
}

function create(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {
	return main(domElement, options);
}

export {
	create
};