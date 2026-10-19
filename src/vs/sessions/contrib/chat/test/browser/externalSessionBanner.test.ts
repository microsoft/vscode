/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ExternalSessionBanner, getExternalSessionBannerSelectedMode, getExternalSessionVisibilityConfirmation, shouldConfirmExternalSessionVisibilityChange } from '../../browser/externalSessionBanner.js';

suite('Sessions - External Session Banner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function externalSession(sessionType: string): ISession {
		return new class extends mock<ISession>() {
			override readonly resource = URI.parse(`test://${sessionType}`);
			override readonly sessionType = sessionType;
			override readonly isExternal = constObservable(true);
			override readonly updatedAt = constObservable(new Date());
		};
	}

	test('explains continuation and subscriptions without visibility controls when sectioning is enabled', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const banner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, $('div'), {}));
		const descriptions = ['codex', 'copilot', 'claude'].map(sessionType => {
			banner.setSession(externalSession(sessionType));
			return {
				visible: banner.visible,
				description: banner.domNode.querySelector('.external-session-banner-description')?.textContent,
				controlsDisplay: banner.domNode.querySelector<HTMLElement>('.external-session-banner-controls')?.style.display,
			};
		});
		assert.deepStrictEqual(descriptions, [
			{
				visible: true,
				description: 'You can continue this session here with your ChatGPT or Copilot subscription. Choose your subscription in the model picker.',
				controlsDisplay: 'none',
			},
			{
				visible: true,
				description: 'You can continue this session here.',
				controlsDisplay: 'none',
			},
			{
				visible: true,
				description: 'You can continue this session here with your Copilot subscription.',
				controlsDisplay: 'none',
			},
		]);
	});

	test('shows visibility controls by default and switches to continuation when sectioning is enabled', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		const banner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, $('div'), {}));
		banner.setSession(externalSession('codex'));
		const snapshot = () => ({
			controlsDisplay: banner.domNode.querySelector<HTMLElement>('.external-session-banner-controls')?.style.display,
			label: banner.domNode.getAttribute('aria-label'),
		});
		const before = snapshot();
		await configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING,
			affectedKeys: new Set([SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING]),
			change: { keys: [SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING], overrides: [] },
			source: ConfigurationTarget.USER,
		});
		assert.deepStrictEqual({ before, after: snapshot() }, {
			before: { controlsDisplay: '', label: 'External session visibility' },
			after: { controlsDisplay: 'none', label: 'External session' },
		});
	});

	test('uses the session content inset for its width', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const container = append(mainWindow.document.body, $('div'));
		container.style.width = '800px';
		container.style.setProperty('--session-view-content-horizontal-padding', '24px');
		container.style.setProperty('--vscode-spacing-size320', '32px');
		disposables.add(toDisposable(() => container.remove()));
		const banner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, container, {}));
		banner.setSession(externalSession('codex'));

		const containerBounds = container.getBoundingClientRect();
		const bannerBounds = banner.domNode.getBoundingClientRect();
		assert.deepStrictEqual({
			containerWidth: containerBounds.width,
			bannerWidth: bannerBounds.width,
		}, {
			containerWidth: 800,
			bannerWidth: 752,
		});
	});

	test('closing permanently dismisses every external session banner and restores focus', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const container = append(mainWindow.document.body, $('div'));
		disposables.add(toDisposable(() => container.remove()));
		let focusRestored = false;
		const banner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, container, {
			onDidDismissWithFocus: () => { focusRestored = true; },
		}));
		banner.setSession(externalSession('codex'));
		const otherBanner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, container, {}));
		otherBanner.setSession(externalSession('claude'));
		const close = banner.domNode.querySelector<HTMLElement>('.action-label')!;
		close.focus();
		close.click();
		banner.setSession(externalSession('copilot'));
		const restoredBanner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, container, {}));
		restoredBanner.setSession(externalSession('codex'));
		assert.deepStrictEqual({
			visible: banner.visible,
			otherVisible: otherBanner.visible,
			restoredVisible: restoredBanner.visible,
			focusRestored,
		}, {
			visible: false,
			otherVisible: false,
			restoredVisible: false,
			focusRestored: true,
		});
	});

	test('hides immediately when the current external session is adopted', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const layoutChanges: boolean[] = [];
		const banner = disposables.add(instantiationService.createInstance(ExternalSessionBanner, $('div'), {
			onDidChangeLayout: visible => layoutChanges.push(visible),
		}));
		const isExternal = observableValue('external', true);
		const session = new class extends mock<ISession>() {
			override readonly resource = URI.parse('test://external');
			override readonly isExternal = isExternal;
			override readonly updatedAt = constObservable(new Date());
		};
		layoutChanges.length = 0;
		banner.setSession(session);
		const before = { visible: banner.visible, hidden: banner.domNode.classList.contains('hidden') };
		isExternal.set(false, undefined);
		assert.deepStrictEqual({
			before,
			after: { visible: banner.visible, hidden: banner.domNode.classList.contains('hidden') },
			layoutChanges,
		}, {
			before: { visible: true, hidden: false },
			after: { visible: false, hidden: true },
			layoutChanges: [true, false],
		});
	});

	test('selects the configured external session visibility mode', () => {
		assert.deepStrictEqual({
			configuredRecent: getExternalSessionBannerSelectedMode(undefined, ChatExternalSessionsMode.Recent),
			configuredLast7Days: getExternalSessionBannerSelectedMode(undefined, ChatExternalSessionsMode.Last7Days),
			initialMode: getExternalSessionBannerSelectedMode(ChatExternalSessionsMode.Last24Hours, ChatExternalSessionsMode.Recent),
		}, {
			configuredRecent: ChatExternalSessionsMode.Recent,
			configuredLast7Days: ChatExternalSessionsMode.Last7Days,
			initialMode: ChatExternalSessionsMode.Last24Hours,
		});
	});

	test('matches external session visibility time boundaries', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual({
			recent: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Recent, new Date(now), now),
			none: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.None, new Date(now), now),
			at30Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last30Days, new Date(now - 30 * day), now),
			olderThan30Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last30Days, new Date(now - 30 * day - 1), now),
			at24Hours: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last24Hours, new Date(now - day), now),
			olderThan24Hours: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last24Hours, new Date(now - day - 1), now),
			at7Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day), now),
			olderThan7Days: shouldConfirmExternalSessionVisibilityChange(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day - 1), now),
		}, {
			recent: true,
			none: true,
			at30Days: false,
			olderThan30Days: true,
			at24Hours: false,
			olderThan24Hours: true,
			at7Days: false,
			olderThan7Days: true,
		});
	});

	test('describes why a time-filtered open session will disappear', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual(
			getExternalSessionVisibilityConfirmation(ChatExternalSessionsMode.Last7Days, new Date(now - 7 * day - 1), now, 'Code - OSS'),
			{
				type: 'warning',
				message: 'This session will no longer appear in Code - OSS',
				detail: 'Only external sessions updated in the last 7 days will be shown. This session was last updated 8 days ago. Are you sure you want to save this change?',
				primaryButton: '&&Save Anyway',
			}
		);
	});

	test('warns that recent may hide the open session', () => {
		const now = Date.UTC(2026, 7, 16, 12);

		assert.deepStrictEqual(
			getExternalSessionVisibilityConfirmation(ChatExternalSessionsMode.Recent, new Date(now), now, 'Code - OSS'),
			{
				type: 'warning',
				message: 'This session may no longer appear in Code - OSS',
				detail: 'Only up to the 2 most recently updated external sessions from the last 7 days will be shown. Are you sure you want to save this change?',
				primaryButton: '&&Save Anyway',
			}
		);
	});
});
