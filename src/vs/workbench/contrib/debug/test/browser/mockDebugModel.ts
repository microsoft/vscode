/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { TestFileService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DebugModel } from '../../common/debugModel.js';
import { MockDebugStorage } from '../common/mockDebug.js';

const fileService = new TestFileService();
export const mockUriIdentityService = new UriIdentityService(fileService);

export function createMockDebugModel(disposable: Pick<DisposableStore, 'add'>): DebugModel {
	const storage = disposable.add(new TestStorageService());
	const debugStorage = disposable.add(new MockDebugStorage(storage));
	return disposable.add(new DebugModel(debugStorage, upcastPartial<ITextFileService>({ isDirty: (e: unknown) => false }), mockUriIdentityService, new NullLogService()));
}
