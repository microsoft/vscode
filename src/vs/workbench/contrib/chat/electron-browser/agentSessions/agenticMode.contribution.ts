/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationKeyValuePairs, Extensions as WorkbenchExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { LEGACY_AGENTIC_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agenticModeWorkspaceService.js';
import { AgenticModeActive, agenticModeEnabledSetting, CanEnterAgenticMode, ToggleAgenticModeAction } from '../../browser/agentSessions/agenticModeActions.js';
import { AgenticModeAuxiliaryBar } from '../../browser/agentSessions/agenticModeAuxiliaryBar.js';
import { AgenticModeEditorArea } from '../../browser/agentSessions/agenticModeEditorArea.js';
import { AgenticModeButtonActionViewItem } from '../../browser/agentSessions/agenticModeButton.js';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chat.configurationTitle', "Chat"),
	properties: {
		[agenticModeEnabledSetting]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('agenticMode.enabled', "Enable toggling Agentic Mode in a local editor window. A window with a folder or workspace gets its folders back when it leaves the mode. Takes effect in a window after it is reloaded."),
		}
	}
});

const legacyAgenticModeEnabledSetting = LEGACY_AGENTIC_MODE_ENABLED_SETTING;
Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: legacyAgenticModeEnabledSetting,
		migrateFn: (value: unknown, valueAccessor) => {
			const result: ConfigurationKeyValuePairs = [[legacyAgenticModeEnabledSetting, { value: undefined }]];
			if (value !== undefined && valueAccessor(agenticModeEnabledSetting) === undefined) {
				result.push([agenticModeEnabledSetting, { value }]);
			}
			return result;
		}
	}]);

class AgenticModeContribution extends Disposable {
	static readonly ID = 'workbench.contrib.agenticMode';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAgenticModeService agenticModeService: IAgenticModeService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		if (!agenticModeService.isSupported) {
			return;
		}

		this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, ToggleAgenticModeAction.ID, (action, options) => {
			return instantiationService.createInstance(AgenticModeButtonActionViewItem, action, options);
		}));
		this._register(instantiationService.createInstance(AgenticModeEditorArea));
		this._register(instantiationService.createInstance(AgenticModeAuxiliaryBar));

		const canEnterContext = CanEnterAgenticMode.bindTo(contextKeyService);
		const modeActiveContext = AgenticModeActive.bindTo(contextKeyService);
		const update = () => contextKeyService.bufferChangeEvents(() => {
			const isActive = agenticModeService.isActive;
			modeActiveContext.set(isActive);
			canEnterContext.set(!isActive);
		});
		this._register(agenticModeService.onDidChange(update));
		update();
	}
}

registerWorkbenchContribution2(AgenticModeContribution.ID, AgenticModeContribution, WorkbenchPhase.BlockRestore);

registerAction2(ToggleAgenticModeAction);
