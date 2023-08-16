/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { NullLogService } from 'vs/platform/log/common/log';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { DebugModel } from 'vs/workbench/contrib/debug/common/debugModel';
import { MockDebugStorage } from 'vs/workbench/contrib/debug/test/common/mockDebug';
import { TestFileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

const fileService = new TestFileService();
export const mockUriIdentityService = new UriIdentityService(fileService);

export function createMockDebugModel(disposable: DisposableStore): DebugModel {
	const storage = disposable.add(new TestStorageService());
	const debugStorage = disposable.add(new MockDebugStorage(storage));
	return disposable.add(new DebugModel(debugStorage, <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService()));
}
