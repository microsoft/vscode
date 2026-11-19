/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TestExperimentTriggerTelemetryService } from '../../../telemetry/test/common/experimentTriggerTestUtils.js';
import { observeAgentsWindowTitleBarIconExposure } from '../../browser/agentsWindowTitleBarIcons.js';
import { AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING } from '../../common/chatSettings.js';

suite('Agents window title bar icon exposure', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const setting = AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING;

	async function waitForObservation(element: HTMLElement): Promise<boolean> {
		await Promise.resolve();
		return new Promise(resolve => {
			const observer = new mainWindow.IntersectionObserver(entries => {
				observer.disconnect();
				resolve(entries[0].isIntersecting);
			});
			observer.observe(element);
		});
	}

	for (const useCodicons of [false, true]) {
		test(`waits until a hidden button is shown after resetting to ${useCodicons}`, async () => {
			const configuration = new class extends TestConfigurationService {
				usingDefault = false;
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return key === setting && this.usingDefault ? { ...inspected, userValue: undefined, userLocalValue: undefined } : inspected;
				}
			}({ [setting]: !useCodicons });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const telemetry = new TestExperimentTriggerTelemetryService();
			const root = append(mainWindow.document.body, $('div'));
			root.style.cssText = 'position: fixed; top: 0; left: 0';
			store.add(toDisposable(() => root.remove()));
			const icon = append(root, $('div'));
			icon.style.cssText = 'width: 16px; height: 16px';
			store.add(observeAgentsWindowTitleBarIconExposure(icon, configuration, telemetry));
			assert.strictEqual(await waitForObservation(icon), true);
			assert.strictEqual(telemetry.triggers.length, 0);

			root.style.display = 'none';
			assert.strictEqual(await waitForObservation(icon), false);
			await configuration.setUserConfiguration(setting, useCodicons);
			configuration.usingDefault = true;
			const change = new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === setting;
				}
			}();
			configuration.onDidChangeConfigurationEmitter.fire(change);
			assert.strictEqual(await waitForObservation(icon), false);
			assert.strictEqual(telemetry.triggers.length, 0);

			const triggered = Event.toPromise(telemetry.onDidTrigger);
			root.style.display = '';
			// Revealing an unpainted element does not schedule an intersection update in headless WebKit.
			await Promise.all([triggered, waitForObservation(icon)]);
			configuration.onDidChangeConfigurationEmitter.fire(change);
			await waitForObservation(icon);
			assert.deepStrictEqual(telemetry.triggers, [`config.${setting}`]);
		});
	}

	test('stops observing when disposed', async () => {
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(key: string) {
				const inspected = super.inspect<T>(key);
				return key === setting ? { ...inspected, userValue: undefined, userLocalValue: undefined } : inspected;
			}
		}({ [setting]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const telemetry = new TestExperimentTriggerTelemetryService();
		const root = append(mainWindow.document.body, $('div'));
		root.style.cssText = 'position: fixed; top: 0; left: 0; display: none';
		store.add(toDisposable(() => root.remove()));
		const icon = append(root, $('div'));
		icon.style.cssText = 'width: 16px; height: 16px';
		const observer = store.add(observeAgentsWindowTitleBarIconExposure(icon, configuration, telemetry));
		assert.strictEqual(await waitForObservation(icon), false);
		observer.dispose();
		root.style.display = '';
		assert.strictEqual(await waitForObservation(icon), true);
		assert.strictEqual(telemetry.triggers.length, 0);
	});
});
