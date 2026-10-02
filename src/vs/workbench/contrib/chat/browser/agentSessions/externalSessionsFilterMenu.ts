/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../common/constants.js';

const externalSessionOptions = [
	{ mode: ChatExternalSessionsMode.None, title: localize2('agentSessions.filter.external.none', "None") },
	{ mode: ChatExternalSessionsMode.Recent, title: localize2('agentSessions.filter.external.recent', "Recent") },
	{ mode: ChatExternalSessionsMode.Last24Hours, title: localize2('agentSessions.filter.external.last24Hours', "Last 24 Hours") },
	{ mode: ChatExternalSessionsMode.Last7Days, title: localize2('agentSessions.filter.external.last7Days', "Last 7 Days") },
	{ mode: ChatExternalSessionsMode.Last30Days, title: localize2('agentSessions.filter.external.last30Days', "Last 30 Days") },
] as const;

export function registerExternalSessionsFilterMenu(parentMenuId: MenuId, submenuId: MenuId, group: string, showSelectedValue = false): IDisposable {
	const disposables = new DisposableStore();
	const settingKey = `config.${ChatConfiguration.ShowExternalAgentSessions}`;
	disposables.add(MenuRegistry.appendMenuItem(parentMenuId, {
		submenu: submenuId,
		title: localize2('agentSessions.filter.external', "External"),
		when: showSelectedValue ? ContextKeyExpr.and(...externalSessionOptions.map(option => ContextKeyExpr.notEquals(settingKey, option.mode))) : undefined,
		group,
		order: 0,
	}));

	for (let index = 0; index < externalSessionOptions.length; index++) {
		const option = externalSessionOptions[index];
		const selected = ContextKeyExpr.equals(settingKey, option.mode);
		if (showSelectedValue) {
			disposables.add(MenuRegistry.appendMenuItem(parentMenuId, {
				submenu: submenuId,
				title: localize2('agentSessions.filter.external.selected', "External ({0})", option.title.value),
				when: selected,
				group,
				order: 0,
			}));
		}
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.external.${option.mode}.${submenuId.id.toLowerCase()}`,
					title: option.title,
					toggled: selected,
					menu: {
						id: submenuId,
						group: '1_modes',
						order: index,
					},
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				await accessor.get(IConfigurationService).updateValue(
					ChatConfiguration.ShowExternalAgentSessions,
					option.mode,
					ConfigurationTarget.USER
				);
			}
		}));
	}

	return disposables;
}
