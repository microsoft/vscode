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

export function registerExternalSessionsFilterMenu(parentMenuId: MenuId, submenuId: MenuId, group: string): IDisposable {
	const disposables = new DisposableStore();
	disposables.add(MenuRegistry.appendMenuItem(parentMenuId, {
		submenu: submenuId,
		title: localize2('agentSessions.filter.external', "External"),
		group,
		order: 0,
	}));

	for (let index = 0; index < externalSessionOptions.length; index++) {
		const option = externalSessionOptions[index];
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.external.${option.mode}.${submenuId.id.toLowerCase()}`,
					title: option.title,
					toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ShowExternalAgentSessions}`, option.mode),
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
