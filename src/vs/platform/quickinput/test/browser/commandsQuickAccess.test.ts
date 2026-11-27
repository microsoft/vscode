/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullCommandService } from '../../../commands/test/common/nullCommandService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AbstractCommandsQuickAccessProvider, ICommandQuickPick } from '../../browser/commandsQuickAccess.js';

class TestCommandsQuickAccessProvider extends AbstractCommandsQuickAccessProvider {

	commandPicks: ICommandQuickPick[] = [];

	protected async getCommandPicks(): Promise<ICommandQuickPick[]> {
		return this.commandPicks;
	}

	protected hasAdditionalCommandPicks(): boolean {
		return false;
	}

	protected async getAdditionalCommandPicks(): Promise<ICommandQuickPick[]> {
		return [];
	}

	async getPicks(filter: string): Promise<string[]> {
		const disposables = new DisposableStore();
		const picks = await this._getPicks(filter, disposables, CancellationToken.None);
		disposables.dispose();
		assert.ok(Array.isArray(picks));
		return picks.map(pick => pick.type === 'separator' ? `--- ${pick.label}` : pick.commandId);
	}
}

function commandPick(commandId: string, label: string, description?: string): ICommandQuickPick {
	return { commandId, label, commandDescription: description ? { value: description, original: description } : undefined };
}

suite('CommandsQuickAccess', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createProvider(): TestCommandsQuickAccessProvider {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ILogService, new NullLogService());
		return disposables.add(new TestCommandsQuickAccessProvider({ showAlias: false }, instantiationService, new MockKeybindingService(), NullCommandService, NullTelemetryService, new TestDialogService()));
	}

	test('similar commands reflect added, removed and changed commands', async () => {
		const provider = createProvider();

		provider.commandPicks = [
			commandPick('format', 'Format Document', 'Beautify the code'),
			commandPick('prettify', 'Prettify JSON', 'Beautify beautify JSON'),
			commandPick('wrap', 'Toggle Word Wrap'),
		];
		const first = await provider.getPicks('beautify');

		provider.commandPicks = [
			commandPick('format', 'Format Document', 'Indent the code'),
			commandPick('wrap', 'Toggle Word Wrap'),
			commandPick('tidy', 'Tidy Markup', 'Beautify markup'),
		];
		const second = await provider.getPicks('beautify');

		assert.deepStrictEqual({ first, second }, {
			first: ['--- similar commands', 'prettify'],
			second: ['--- similar commands', 'tidy'],
		});
	});

	test('similar commands with equal scores are limited in command order', async () => {
		const provider = createProvider();
		const createPicks = (ids: number[]) => ids.map(id => commandPick(`command${id}`, `Command ${id}`, 'Beautify'));

		provider.commandPicks = createPicks([1, 2, 3, 4, 5, 6]);
		const first = await provider.getPicks('beautify');

		provider.commandPicks = createPicks([6, 1, 2, 3, 4, 5]);
		const second = await provider.getPicks('beautify');

		assert.deepStrictEqual({ first, second }, {
			first: ['--- similar commands', 'command1', 'command2', 'command3', 'command4', 'command5'],
			second: ['--- similar commands', 'command1', 'command2', 'command3', 'command4', 'command6'],
		});
	});
});
