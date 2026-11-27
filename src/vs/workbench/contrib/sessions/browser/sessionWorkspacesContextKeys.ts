/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey, observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SESSIONS_WORKSPACES_ENABLED_SETTING } from '../common/sessionConfig.js';
import { SessionWorkspacesEnabledContext } from '../common/contextkeys.js';

/** Binds {@link SessionWorkspacesEnabledContext} to its setting, without creating the workspaces service. */
export class SessionWorkspacesContextKeys extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionWorkspacesContextKeys';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const enabled = observableConfigValue(SESSIONS_WORKSPACES_ENABLED_SETTING, false, configurationService);
		this._register(bindContextKey(SessionWorkspacesEnabledContext, contextKeyService, reader => enabled.read(reader)));
	}
}
