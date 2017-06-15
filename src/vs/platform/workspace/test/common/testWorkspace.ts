/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workspace } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

export const TestWorkspace = new Workspace(
	URI.file('C:\\testWorkspace'),
	Date.now()
);
