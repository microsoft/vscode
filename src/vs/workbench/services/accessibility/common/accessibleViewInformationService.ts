/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX } from '../../../../platform/accessibility/common/accessibility.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';

export interface IAccessibleViewInformationService {
	_serviceBrand: undefined;
	hasShownAccessibleView(viewId: string): boolean;
}

export const IAccessibleViewInformationService = createDecorator<IAccessibleViewInformationService>('accessibleViewInformationService');

export class AccessibleViewInformationService extends Disposable implements IAccessibleViewInformationService {
	declare readonly _serviceBrand: undefined;
	constructor(@IStorageService private readonly _storageService: IStorageService) {
		super();
	}
	hasShownAccessibleView(viewId: string): boolean {
		return this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${viewId}`, StorageScope.APPLICATION, false) === true;
	}
}
