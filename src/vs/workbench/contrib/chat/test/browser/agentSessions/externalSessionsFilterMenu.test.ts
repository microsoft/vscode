/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ChatExternalSessionsMode } from '../../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../../platform/configuration/common/configuration.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { registerExternalSessionsFilterMenu } from '../../../browser/agentSessions/externalSessionsFilterMenu.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('External Sessions Filter Menu', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const parentMenuId = new MenuId('TestExternalSessionsFilterParent');
	const submenuId = new MenuId('TestExternalSessionsFilterSubmenu');
	let registration: IDisposable;

	suiteSetup(() => {
		registration = registerExternalSessionsFilterMenu(parentMenuId, submenuId, '2_external');
	});

	suiteTeardown(() => registration.dispose());

	test('registers a separated submenu whose checked item follows the setting', () => {
		const parent = MenuRegistry.getMenuItems(parentMenuId).find(isISubmenuItem);
		const options = MenuRegistry.getMenuItems(submenuId).filter(isIMenuItem);

		assert.deepStrictEqual({
			parent: parent && {
				title: typeof parent.title === 'string' ? parent.title : parent.title.value,
				group: parent.group,
				submenu: parent.submenu.id,
			},
			options: options.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				checkedForRecent: getToggledExpression(item.command.toggled)?.evaluate({
					getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => (
						key === `config.${ChatConfiguration.ShowExternalAgentSessions}`
							? ChatExternalSessionsMode.Recent
							: undefined
					) as T,
				}),
			})),
		}, {
			parent: {
				title: 'External',
				group: '2_external',
				submenu: submenuId.id,
			},
			options: [
				{ title: 'None', checkedForRecent: false },
				{ title: 'Recent', checkedForRecent: true },
				{ title: 'Last 24 Hours', checkedForRecent: false },
				{ title: 'Last 7 Days', checkedForRecent: false },
				{ title: 'Last 30 Days', checkedForRecent: false },
			],
		});
	});

	test('updates the external sessions setting from an option', async () => {
		const updates: { key: string; value: unknown; target?: ConfigurationTarget }[] = [];
		const configurationService = new class extends mock<IConfigurationService>() {
			override updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				updates.push({ key, value, target: typeof arg3 === 'number' ? arg3 : undefined });
				return Promise.resolve();
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const noneItem = MenuRegistry.getMenuItems(submenuId)
			.filter(isIMenuItem)
			.find(item => (typeof item.command.title === 'string' ? item.command.title : item.command.title.value) === 'None');
		assert.ok(noneItem);
		const command = CommandsRegistry.getCommand(noneItem.command.id);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual(updates, [{
			key: ChatConfiguration.ShowExternalAgentSessions,
			value: ChatExternalSessionsMode.None,
			target: ConfigurationTarget.USER,
		}]);
	});
});

function getToggledExpression(toggled: ContextKeyExpression | { condition: ContextKeyExpression } | undefined): ContextKeyExpression | undefined {
	return toggled ? (toggled as { condition?: ContextKeyExpression }).condition ?? toggled as ContextKeyExpression : undefined;
}
