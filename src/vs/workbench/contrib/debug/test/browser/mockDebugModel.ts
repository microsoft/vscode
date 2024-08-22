/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle';
import { NullLogService } from '../../../../../platform/log/common/log';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService';
import { DebugModel } from '../../common/debugModel';
import { MockDebugStorage } from '../common/mockDebug';
import { TestFileService } from '../../../../test/browser/workbenchTestServices';
import { TestStorageService } from '../../../../test/common/workbenchTestServices';

const fileService = new TestFileService();
export const mockUriIdentityService = new UriIdentityService(fileService);

export function createMockDebugModel(disposable: Pick<DisposableStore, 'add'>): DebugModel {
	const storage = disposable.add(new TestStorageService());
	const debugStorage = disposable.add(new MockDebugStorage(storage));
	return disposable.add(new DebugModel(debugStorage, <any>{ isDirty: (e: any) => false }, mockUriIdentityService, new NullLogService()));
}
