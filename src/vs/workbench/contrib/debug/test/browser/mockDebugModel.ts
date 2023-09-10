/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullLogService } from 'vs/platform/log/common/log';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { DebugModel } from 'vs/workbench/contrib/debug/common/debugModel';
import { MockDebugStorage } from 'vs/workbench/contrib/debug/test/common/mockDebug';
import { TestFileService } from 'vs/workbench/test/browser/workbenchTestServices';

const fileService = new TestFileService();
export const mockUriIdentityService = new UriIdentityService(fileService);

export function createMockDebugModel(): DebugModel {
	return new DebugModel(new MockDebugStorage(), <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService());
}
