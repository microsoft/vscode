/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ClickAnimation } from '../../../base/browser/ui/animations/animations.js';
import { MenuEntryActionViewItem } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../platform/chat/common/sessionArchiveActions.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { createSessionActionViewItemProvider, getSessionArchiveActionViewItemOptions } from '../../browser/sessionActionViewItem.js';

suite('SessionActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createMenuItemAction(id: string): MenuItemAction {
		return new MenuItemAction(
			{ id, title: id },
			undefined,
			undefined,
			undefined,
			undefined,
			new class extends mock<IContextKeyService>() {
				override contextMatchesRules(): boolean { return true; }
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand(): Promise<undefined> { return undefined; }
			}(),
		);
	}

	test('uses confetti for archive actions when enabled', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const expected = Object.create(MenuEntryActionViewItem.prototype) as MenuEntryActionViewItem;
		instantiationService.stubInstance<MenuEntryActionViewItem>(MenuEntryActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, configurationService);

		assert.deepStrictEqual({
			archive: provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}),
			other: provider(createMenuItemAction('sessions.other'), {}),
		}, {
			archive: expected,
			other: undefined,
		});
	});

	test('uses an archive action view item when disabled', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const expected = Object.create(MenuEntryActionViewItem.prototype) as MenuEntryActionViewItem;
		instantiationService.stubInstance<MenuEntryActionViewItem>(MenuEntryActionViewItem, expected);
		const provider = createSessionActionViewItemProvider(instantiationService, new TestConfigurationService());

		assert.strictEqual(provider(createMenuItemAction(ARCHIVE_SESSION_COMMAND_ID), {}), expected);
	});

	test('resolves configured archive animation when clicked', async () => {
		const configurationService = new TestConfigurationService();
		const options = getSessionArchiveActionViewItemOptions({ icon: true }, configurationService);
		const disabled = options.onClickAnimation;
		await configurationService.setUserConfiguration(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING, true);
		const enabled = options.onClickAnimation;

		assert.deepStrictEqual({
			disabled,
			enabled,
		}, {
			disabled: undefined,
			enabled: ClickAnimation.Confetti,
		});
	});
});
