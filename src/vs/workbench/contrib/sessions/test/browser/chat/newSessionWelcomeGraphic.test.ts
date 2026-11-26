/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../../platform/chat/common/agentsWindowInvitation.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { NewSessionWelcomeGraphic } from '../../../browser/chat/newSessionWelcomeGraphic.js';
import { NEW_SESSION_WELCOME_GRAPHIC_SETTING, NEW_SESSION_WELCOME_GRAPHICS } from '../../../common/chatConstants.js';

suite('NewSessionWelcomeGraphic', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(graphic: string, sessionCount: number, visible: IObservable<boolean> = constObservable(true)) {
		const storageService = store.add(new InMemoryStorageService());
		const setSessionCount = (count: number) => storageService.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, count, StorageScope.APPLICATION, StorageTarget.MACHINE);
		setSessionCount(sessionCount);
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const content = mainWindow.document.createElement('div');
		const widget = store.add(new NewSessionWelcomeGraphic(
			{ content, layoutRoot: content, visible, composing: constObservable(false) },
			new TestConfigurationService({ [NEW_SESSION_WELCOME_GRAPHIC_SETTING]: graphic }),
			storageService,
			telemetryService,
		));
		const state = () => ({ shown: !widget.element.hidden, hasLabel: widget.element.hasAttribute('aria-label') });
		return { state, setSessionCount, telemetryService };
	}

	test('shows the configured graphic only until the user has started two sessions', () => {
		const configured = [...NEW_SESSION_WELCOME_GRAPHICS, 'unknown'].map(graphic => ({ graphic, ...create(graphic, 0).state() }));

		const overview = create('windowOverview', 1);
		const bySessionCount = [overview.state()];
		overview.setSessionCount(2);
		bySessionCount.push(overview.state());

		assert.deepStrictEqual({ configured, bySessionCount }, {
			configured: [
				{ graphic: 'none', shown: false, hasLabel: false },
				{ graphic: 'windowOverview', shown: true, hasLabel: true },
				{ graphic: 'windowOverviewStatic', shown: true, hasLabel: true },
				{ graphic: 'workingCopies', shown: true, hasLabel: true },
				{ graphic: 'workingCopiesStatic', shown: true, hasLabel: true },
				{ graphic: 'windowComparison', shown: true, hasLabel: true },
				{ graphic: 'unknown', shown: false, hasLabel: false },
			],
			bySessionCount: [
				{ shown: true, hasLabel: true },
				{ shown: false, hasLabel: false },
			],
		});
	});

	test('logs the experiment trigger in every arm once a new user sees the new-session view', () => {
		const results = ['none', 'windowComparison'].map(graphic => {
			const visible = observableValue('visible', false);
			const newUser = create(graphic, 1, visible);
			const whileHidden = [...newUser.telemetryService.triggers];
			visible.set(true, undefined);
			const returningUser = create(graphic, 2);
			return { graphic, whileHidden, newUser: newUser.telemetryService.triggers, returningUser: returningUser.telemetryService.triggers };
		});

		assert.deepStrictEqual(results, [
			{ graphic: 'none', whileHidden: [], newUser: [`config.${NEW_SESSION_WELCOME_GRAPHIC_SETTING}`], returningUser: [] },
			{ graphic: 'windowComparison', whileHidden: [], newUser: [`config.${NEW_SESSION_WELCOME_GRAPHIC_SETTING}`], returningUser: [] },
		]);
	});
});
