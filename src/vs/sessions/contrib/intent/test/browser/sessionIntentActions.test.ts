/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../browser/sessionIntent.contribution.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsBoardService, ISessionsBoardView } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('Dashboard intent command routing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('New Work needs only the dashboard host while the other presentation is absent', async () => {
		const instantiation = store.add(new TestInstantiationService());
		let starts = 0;
		instantiation.stub(ISessionsService, { isSessionBoardVisible: constObservable(true) });
		instantiation.stub(ISessionsBoardService, {
			activeView: constObservable(new class extends mock<ISessionsBoardView>() {
				override async startNewWork(): Promise<void> { starts++; }
			}())
		});
		await CommandsRegistry.getCommand('sessions.intent.newWork')!.handler(instantiation);
		assert.strictEqual(starts, 1);
	});

	test('does not expose a workspace command that reopens the retired conversation panel', () => {
		assert.strictEqual(CommandsRegistry.getCommand('sessions.intent.findWorkspace'), undefined);
	});

	test('an unavailable dashboard host never falls back to ordinary chat navigation', async () => {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ISessionsService, { isSessionBoardVisible: constObservable(true) });
		instantiation.stub(ISessionsBoardService, { activeView: constObservable(undefined) });
		await assert.rejects(async () => CommandsRegistry.getCommand('sessions.intent.newWork')!.handler(instantiation), /dashboard is not ready/);
	});
});
