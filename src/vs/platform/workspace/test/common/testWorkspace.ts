/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

export const TestWorkspace: IWorkspace = {
	resource: URI.file('C:\\testWorkspace'),
	name: 'Test Workspace',
	uid: Date.now()
};
