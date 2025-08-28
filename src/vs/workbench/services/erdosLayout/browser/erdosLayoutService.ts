/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IErdosLayoutService } from './interfaces/erdosLayoutService.js';
import { CustomErdosLayoutDescription } from '../common/erdosCustomViews.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';


class ErdosLayoutService extends Disposable implements IErdosLayoutService {

	declare readonly _serviceBrand: undefined;

	initialize() {
	}

	constructor(
		@IWorkbenchLayoutService private readonly _workbenchLayoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
	) {
		super();
	}

	setLayout(layout: CustomErdosLayoutDescription) {
		this._viewDescriptorService.loadCustomViewDescriptor(layout);
		this._workbenchLayoutService.enterCustomLayout(layout);
	}
}

registerSingleton(IErdosLayoutService, ErdosLayoutService, InstantiationType.Delayed);
