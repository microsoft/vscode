/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenedMainWindow } from '../../../../../../platform/window/common/window.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { AgentsWindowGraphic, AgentsWindowGraphicDesign, renderAgentsWindowGraphic, resolveAgentsWindowGraphicDesign } from '../../../browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration } from '../../../common/constants.js';

suite('AgentsWindowGraphic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const agentSessionsWorkspace = URI.file('/user/agent-sessions.code-workspace');
	const editorWindow = (id: number): IOpenedMainWindow => ({ id, title: `Editor ${id}`, dirty: false });
	const agentsWindow: IOpenedMainWindow = { id: 99, title: 'Agents', dirty: false, workspace: { id: 'agents', configPath: agentSessionsWorkspace } };

	function createGraphic(variant: string, getWindows?: () => Promise<IOpenedMainWindow[]>) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		let openWindows = [editorWindow(1)];
		let windowRequests = 0;
		const hostService = new class extends mock<IHostService>() {
			override async getWindows() {
				windowRequests++;
				return getWindows ? getWindows() : openWindows;
			}
		}();
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override agentSessionsWorkspace = agentSessionsWorkspace;
		}();
		const graphic = store.add(new AgentsWindowGraphic(configurationService, hostService, environmentService));
		const setConfiguration = async (key: string, value: string) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === key;
				}
			}());
			await timeout(0);
		};
		return {
			setVariant: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic, value),
			setSectionStyle: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowSectionStyle, value),
			sectionStyle: () => graphic.sectionStyle.get(),
			setOpenWindows(windows: IOpenedMainWindow[]) {
				openWindows = windows;
			},
			state: () => ({
				shown: graphic.shownDesign.get(),
				display: graphic.element.style.display,
				rendered: graphic.element.querySelector('.agents-window-graphic')?.classList[1],
				captions: [...graphic.element.querySelectorAll('figcaption')].map(caption => caption.textContent),
				windowRequests,
			}),
		};
	}

	test('picks the graphic for each variant', () => {
		const variants = [AgentsWindowGraphicVariant.None, AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.ManyWindowsToOne, AgentsWindowGraphicVariant.Auto];
		assert.deepStrictEqual(
			variants.map(variant => [variant, [undefined, false, true].map(hasMultipleEditorWindows => resolveAgentsWindowGraphicDesign(variant, hasMultipleEditorWindows))]),
			[
				['none', [undefined, undefined, undefined]],
				['windowComparison', ['windowComparison', 'windowComparison', 'windowComparison']],
				['manyWindowsToOne', ['manyWindowsToOne', 'manyWindowsToOne', 'manyWindowsToOne']],
				['auto', [undefined, 'windowComparison', 'manyWindowsToOne']],
			],
		);
	});

	test('shows the configured graphic and counts the open editor windows when the automatic one is shown', async () => {
		const graphic = createGraphic(AgentsWindowGraphicVariant.None);
		const states = [graphic.state()];
		for (const variant of [AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.ManyWindowsToOne, AgentsWindowGraphicVariant.Auto]) {
			await graphic.setVariant(variant);
			states.push(graphic.state());
		}
		for (const windows of [[editorWindow(1), editorWindow(2)], [editorWindow(1), agentsWindow]]) {
			graphic.setOpenWindows(windows);
			await graphic.setVariant(AgentsWindowGraphicVariant.None);
			await graphic.setVariant(AgentsWindowGraphicVariant.Auto);
			states.push(graphic.state());
		}
		await graphic.setVariant('unknown');
		states.push(graphic.state());

		const none = { shown: undefined, display: 'none', rendered: undefined, captions: [] };
		const windowComparison = {
			shown: 'windowComparison', display: '', rendered: 'window-comparison', captions: [
				'Editor windowWork on one task at a time, with AI at your side.',
				'Agents windowNewRun multiple tasks at the same time, isolated from each other.',
			]
		};
		const manyWindowsToOne = { shown: 'manyWindowsToOne', display: '', rendered: 'many-windows-to-one', captions: ['All your projects and agents, in one window.'] };
		assert.deepStrictEqual(states, [
			{ ...none, windowRequests: 0 },
			{ ...windowComparison, windowRequests: 0 },
			{ ...manyWindowsToOne, windowRequests: 0 },
			{ ...windowComparison, windowRequests: 1 },
			{ ...manyWindowsToOne, windowRequests: 2 },
			{ ...windowComparison, windowRequests: 3 },
			{ ...none, windowRequests: 3 },
		]);
	});

	test('reads the section style and updates it when the setting changes', async () => {
		const graphic = createGraphic(AgentsWindowGraphicVariant.WindowComparison);
		const styles = [graphic.sectionStyle()];
		for (const style of [AgentsWindowSectionStyle.None, AgentsWindowSectionStyle.Card, AgentsWindowSectionStyle.Outline, AgentsWindowSectionStyle.Tint, AgentsWindowSectionStyle.Band, AgentsWindowSectionStyle.Separator, 'unknown']) {
			await graphic.setSectionStyle(style);
			styles.push(graphic.sectionStyle());
		}

		assert.deepStrictEqual(styles, ['outline', 'none', 'card', 'outline', 'tint', 'band', 'separator', 'outline']);
	});

	test('ignores a window count that arrives after the setting changed', async () => {
		const requests = [new DeferredPromise<IOpenedMainWindow[]>(), new DeferredPromise<IOpenedMainWindow[]>()];
		let next = 0;
		const graphic = createGraphic(AgentsWindowGraphicVariant.Auto, () => requests[next++].p);
		await graphic.setVariant(AgentsWindowGraphicVariant.None);
		await graphic.setVariant(AgentsWindowGraphicVariant.Auto);
		await requests[1].complete([editorWindow(1)]);
		await requests[0].complete([editorWindow(1), editorWindow(2)]);
		await timeout(0);

		assert.deepStrictEqual(graphic.state().shown, AgentsWindowGraphicVariant.WindowComparison);
	});

	test('hides the drawings from screen readers and gives every clip path a unique id', () => {
		const designs: AgentsWindowGraphicDesign[] = [AgentsWindowGraphicVariant.ManyWindowsToOne, AgentsWindowGraphicVariant.ManyWindowsToOne, AgentsWindowGraphicVariant.WindowComparison];
		const elements = designs.map(design => renderAgentsWindowGraphic(design));
		const drawings = elements.flatMap(element => [...element.querySelectorAll('svg')]);
		const clipPathIds = elements.flatMap(element => [...element.querySelectorAll('clipPath')].map(clipPath => clipPath.id));

		assert.deepStrictEqual(
			{ drawings: drawings.length, hidden: drawings.filter(drawing => drawing.getAttribute('aria-hidden') === 'true').length, clipPaths: clipPathIds.length, unique: new Set(clipPathIds).size },
			{ drawings: 4, hidden: 4, clipPaths: 10, unique: 10 },
		);
	});

	test('renders compact graphics with window titles only', () => {
		const captions = (design: AgentsWindowGraphicDesign) => {
			const element = renderAgentsWindowGraphic(design, { compact: true });
			return { classes: [...element.classList], captions: [...element.querySelectorAll('figcaption')].map(caption => caption.textContent) };
		};
		assert.deepStrictEqual({
			windowComparison: captions(AgentsWindowGraphicVariant.WindowComparison),
			manyWindowsToOne: captions(AgentsWindowGraphicVariant.ManyWindowsToOne),
		}, {
			windowComparison: { classes: ['agents-window-graphic', 'window-comparison', 'compact'], captions: ['Editor window', 'Agents window'] },
			manyWindowsToOne: { classes: ['agents-window-graphic', 'many-windows-to-one', 'compact'], captions: [] },
		});
	});
});
