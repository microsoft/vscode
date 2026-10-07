/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { MobileLayoutController } from './mobileSessionLayoutController.js';

/**
 * Layout contribution of the mobile web entry point. The phone presentation is
 * declared by the entry point, so this always installs the
 * {@link MobileLayoutController}; there is no runtime platform or viewport check.
 */
class MobileSessionsLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mobileSessionsLayoutContribution';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(instantiationService.createInstance(MobileLayoutController));
	}
}

registerWorkbenchContribution2(MobileSessionsLayoutContribution.ID, MobileSessionsLayoutContribution, WorkbenchPhase.BlockRestore);
