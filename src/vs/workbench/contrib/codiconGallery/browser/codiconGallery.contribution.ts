/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { showCodiconGallery } from './codiconGalleryManager.js';

class OpenCodiconDebugGalleryAction extends Action2 {

	static readonly ID = 'workbench.action.openCodiconDebugGallery';

	constructor() {
		super({
			id: OpenCodiconDebugGalleryAction.ID,
			title: localize2('openCodiconDebugGallery', 'Open Codicon Debug Gallery'),
			category: Categories.Developer,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await showCodiconGallery(accessor.get(IInstantiationService));
	}
}

registerAction2(OpenCodiconDebugGalleryAction);
