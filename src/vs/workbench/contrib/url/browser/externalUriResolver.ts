/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';

export class ExternalUriResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.externalUriResolver';

	constructor(
		@IOpenerService _openerService: IOpenerService,
		@IBrowserWorkbenchEnvironmentService _workbenchEnvironmentService: IBrowserWorkbenchEnvironmentService,
	) {
		super();

		if (_workbenchEnvironmentService.options?.resolveExternalUri) {
			this._register(_openerService.registerExternalUriResolver({
				resolveExternalUri: async (resource) => {
					return {
						resolved: await _workbenchEnvironmentService.options!.resolveExternalUri!(resource),
						dispose: () => {
							// TODO@mjbvz - do we need to do anything here?
						}
					};
				}
			}));
		}
	}
}
