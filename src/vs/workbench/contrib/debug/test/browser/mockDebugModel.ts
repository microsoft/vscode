/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { DebugModel } from '../../common/debugModel.js';
import { MockDebugStorage } from '../common/mockDebug.js';
import { TestFileService } from '../../../../test/browser/workbenchTestServices.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

const fileService = new TestFileService();
export const mockUriIdentityService = new UriIdentityService(fileService);

export function createMockDebugModel(disposable: Pick<DisposableStore, 'add'>): DebugModel {
	const storage = disposable.add(new TestStorageService());
	const debugStorage = disposable.add(new MockDebugStorage(storage));
	return disposable.add(new DebugModel(debugStorage, <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService()));
}
