/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IReader, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { markOnboardingTarget, ONBOARDING_TARGET_PULSE_CLASS } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { NewSessionTourContribution } from '../../browser/newSessionTourContribution.js';
import { NEW_SESSION_TOUR_ID } from '../../browser/tours/newSessionTour.js';

suite('NewSessionTourContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const allowed of [false, true]) {
		test(`pulse follows onboarding eligibility (${allowed}) after the visibility delay`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const button = mainWindow.document.createElement('button');
			button.textContent = 'New Session';
			mainWindow.document.body.appendChild(button);
			disposables.add(toDisposable(() => button.remove()));
			disposables.add(markOnboardingTarget(button, 'sessions.newSession.button'));
			const requests = disposables.add(new Emitter<ISession>());
			const session = new class extends mock<IActiveSession>() {
				override readonly sessionId = 'session';
			}();
			const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []);
			const nudgeChecks: string[] = [];
			const onboardingService = new class extends mock<IOnboardingScenarioService>() {
				override hasBeenShown(): boolean { return false; }
				override shouldShowNudge(id: string): boolean {
					nudgeChecks.push(id);
					return allowed;
				}
			}();
			disposables.add(new NewSessionTourContribution(
				new class extends mock<ISessionsManagementService>() {
					override readonly onWillSendRequest = requests.event;
				}(),
				onboardingService,
				new class extends mock<ISessionsService>() {
					override readonly visibleSessions = visibleSessions;
				}(),
				disposables.add(new InMemoryStorageService()),
				new TestConfigurationService(),
			));
			const isPulsing = () => button.classList.contains(ONBOARDING_TARGET_PULSE_CLASS);

			requests.fire(session);
			await timeout(5_000);
			const hidden = { pulsing: isPulsing(), checks: nudgeChecks.length };
			visibleSessions.set([session], undefined);
			requests.fire(session);
			await timeout(4_999);
			const beforeDelay = { pulsing: isPulsing(), checks: nudgeChecks.length };
			await timeout(1);
			const afterDelay = isPulsing();
			button.click();
			const trigger = onboardingScenarioRegistry.getScenario(NEW_SESSION_TOUR_ID)!.trigger;

			assert.deepStrictEqual({
				hidden,
				beforeDelay,
				afterDelay,
				nudgeChecks,
				afterClick: isPulsing(),
				triggered: trigger.kind === 'observable' && trigger.signal.get(),
			}, {
				hidden: { pulsing: false, checks: 0 },
				beforeDelay: { pulsing: false, checks: 0 },
				afterDelay: allowed,
				nudgeChecks: [NEW_SESSION_TOUR_ID],
				afterClick: false,
				triggered: allowed,
			});
		}));
	}

	for (const state of ['visible', 'hidden', 'superseded', 'disposed'] as const) {
		test(`delayed assignment only pulses for a current visible request (${state})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const button = mainWindow.document.createElement('button');
			button.textContent = 'New Session';
			mainWindow.document.body.appendChild(button);
			disposables.add(toDisposable(() => button.remove()));
			disposables.add(markOnboardingTarget(button, 'sessions.newSession.button'));
			const requests = disposables.add(new Emitter<ISession>());
			const session = new class extends mock<IActiveSession>() {
				override readonly sessionId = 'session';
			}();
			const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', [session]);
			const allowed = observableValue('allowed', false);
			const contribution = disposables.add(new NewSessionTourContribution(
				new class extends mock<ISessionsManagementService>() {
					override readonly onWillSendRequest = requests.event;
				}(),
				new class extends mock<IOnboardingScenarioService>() {
					override hasBeenShown(): boolean { return false; }
					override shouldShowNudge(_id: string, reader?: IReader): boolean { return allowed.read(reader); }
				}(),
				new class extends mock<ISessionsService>() {
					override readonly visibleSessions = visibleSessions;
				}(),
				disposables.add(new InMemoryStorageService()),
				new TestConfigurationService(),
			));
			const isPulsing = () => button.classList.contains(ONBOARDING_TARGET_PULSE_CLASS);
			requests.fire(session);
			await timeout(5_000);
			const beforeResolution = isPulsing();
			if (state === 'hidden') {
				visibleSessions.set([], undefined);
			} else if (state === 'superseded') {
				requests.fire(session);
			} else if (state === 'disposed') {
				contribution.dispose();
			}
			allowed.set(true, undefined);
			const afterResolution = isPulsing();
			await timeout(5_000);
			assert.deepStrictEqual({
				beforeResolution, afterResolution, afterNextDelay: isPulsing(),
			}, {
				beforeResolution: false,
				afterResolution: state === 'visible',
				afterNextDelay: state === 'visible' || state === 'superseded',
			});
		}));
	}
});
