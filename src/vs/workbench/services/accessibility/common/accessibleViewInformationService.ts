/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX } from 'vs/platform/accessibility/common/accessibility';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

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
