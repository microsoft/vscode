/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { OpenWindowSessionLogFileAction } from '../common/logsActions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { LogsDataCleaner } from '../common/logsDataCleaner.js';

class WebLogOutputChannels extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.webLogOutputChannels';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerWebContributions();
	}

	private registerWebContributions(): void {
		this.instantiationService.createInstance(LogsDataCleaner);

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: OpenWindowSessionLogFileAction.ID,
					title: OpenWindowSessionLogFileAction.TITLE,
					category: Categories.Developer,
					f1: true
				});
			}
			run(servicesAccessor: ServicesAccessor): Promise<void> {
				return servicesAccessor.get(IInstantiationService).createInstance(OpenWindowSessionLogFileAction, OpenWindowSessionLogFileAction.ID, OpenWindowSessionLogFileAction.TITLE.value).run();
			}
		}));

	}

}

registerWorkbenchContribution2(WebLogOutputChannels.ID, WebLogOutputChannels, WorkbenchPhase.AfterRestored);
