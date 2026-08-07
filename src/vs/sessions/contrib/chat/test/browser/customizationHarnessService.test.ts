/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IPromptsService } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { SessionsCustomizationHarnessService } from '../../browser/customizationHarnessService.js';

suite('SessionsCustomizationHarnessService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPromptsService(): IPromptsService {
		return new class extends mock<IPromptsService>() {
			override readonly onDidChangeSlashCommands = Event.None;
			override readonly onDidChangeCustomAgents = Event.None;
		}();
	}

	test('does not register the Local harness', () => {
		const service = disposables.add(new SessionsCustomizationHarnessService(createPromptsService()));

		assert.deepStrictEqual({
			availableHarnesses: service.availableHarnesses.get().map(harness => harness.id),
			localHarness: service.findHarnessById(SessionType.Local),
		}, {
			availableHarnesses: [],
			localHarness: undefined,
		});
	});

	test('activates the first provider harness', () => {
		const service = disposables.add(new SessionsCustomizationHarnessService(createPromptsService()));
		disposables.add(service.registerExternalHarness({
			id: 'copilotcli',
			label: 'Copilot CLI',
			icon: Codicon.copilot,
		}));

		assert.deepStrictEqual({
			activeHarness: service.activeHarness.get(),
			availableHarnesses: service.availableHarnesses.get().map(harness => harness.id),
		}, {
			activeHarness: 'copilotcli',
			availableHarnesses: ['copilotcli'],
		});
	});
});
