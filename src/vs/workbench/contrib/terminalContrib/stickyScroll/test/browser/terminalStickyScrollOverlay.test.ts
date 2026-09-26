/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { deepStrictEqual, ok } from 'assert';
import { SinonFakeTimersConfig, useFakeTimers } from 'sinon';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { Orientation, SplitView } from '../../../../../../base/browser/ui/splitview/splitview.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandDetectionCapability, ITerminalCommand, TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalInstance, IXtermTerminal } from '../../../../terminal/browser/terminal.js';
import { ITerminalContributionContext } from '../../../../terminal/browser/terminalExtensions.js';
import { XtermAddonImporter } from '../../../../terminal/browser/xterm/xtermAddonImporter.js';
import { TerminalStickyScrollContribution } from '../../browser/terminalStickyScrollContribution.js';
import '../../../../terminal/browser/media/terminal.css';
import '../../../../terminal/browser/media/xterm.css';
import '../../../../modernUI/browser/media/padding.css';

suite('TerminalStickyScrollOverlay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let TerminalCtor: typeof Terminal;

	suiteSetup(async () => {
		TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		const importer = new XtermAddonImporter();
		await Promise.all([importer.importAddon('serialize'), importer.importAddon('ligatures')]);
	});

	async function createOverlay(modernUI: boolean, {
		promptRowCount = 1,
		show = true,
		location = 'panel',
		fontSize = 14
	}: {
		promptRowCount?: number;
		show?: boolean;
		location?: 'panel' | 'side' | 'editor' | 'fixed' | 'upper split';
		fontSize?: number;
	} = {}) {
		const configurationService = new TestConfigurationService({
			terminal: {
				integrated: {
					gpuAcceleration: 'off',
					stickyScroll: { enabled: true, maxLineCount: 5, ignoredCommands: [] }
				}
			}
		});
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override getViewLocationById() { return location === 'side' ? ViewContainerLocation.Sidebar : ViewContainerLocation.Panel; }
		});
		const root = $('.monaco-workbench');
		root.classList.toggle('modern-ui', modernUI);
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-spacing-size200', '20px');
		const part = root.appendChild($(location === 'side' ? '.part.sidebar' : '.part.panel'));
		const pane = part.appendChild($(location === 'editor' ? '.terminal-editor' : '.pane-body.integrated-terminal'));
		pane.classList.toggle('terminal-side-view', location === 'side');
		pane.style.width = '800px';
		pane.style.height = '237px';
		const splitView = store.add(new SplitView(pane, { orientation: Orientation.VERTICAL }));
		const wrapper = $('.terminal-wrapper');
		wrapper.classList.toggle('fixed-dims', location === 'fixed');
		splitView.addView({
			element: wrapper,
			minimumSize: 0,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: () => { }
		}, 237);
		if (location === 'upper split') {
			splitView.addView({
				element: $('.terminal-wrapper'),
				minimumSize: 0,
				maximumSize: Number.POSITIVE_INFINITY,
				onDidChange: Event.None,
				layout: () => { }
			}, 100);
		}
		splitView.layout(237);
		const host = wrapper.appendChild($('.terminal-xterm-host'));
		getWindow(root).document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const clockOptions: Partial<SinonFakeTimersConfig> & { shouldClearNativeTimers: boolean } = {
			toFake: ['setTimeout', 'clearTimeout'],
			shouldClearNativeTimers: true
		};
		const clock = useFakeTimers(clockOptions);
		store.add(toDisposable(() => clock.restore()));
		const raw = store.add(new TerminalCtor({
			allowProposedApi: true,
			cols: 80,
			rows: 10,
			fontSize,
			fontFamily: 'monospace',
			logger: TestXtermLogger
		}));
		raw.open(host);

		async function write(data: string) {
			const written = new Promise<void>(resolve => raw.write(data, resolve));
			await clock.tickAsync(0);
			await written;
		}

		const promptStartMarker = raw.registerMarker();
		ok(promptStartMarker);
		await write('prompt\r\n'.repeat(promptRowCount - 1));
		const marker = raw.registerMarker();
		ok(marker);
		await write('command\r\n' + 'output\r\n'.repeat(40));
		const endMarker = raw.registerMarker();
		ok(endMarker);
		await write('next command\r\n' + 'next output\r\n'.repeat(20));
		raw.scrollToLine(10);

		const command = new class extends mock<ITerminalCommand>() {
			override readonly command = 'command';
			override readonly marker = marker;
			override readonly promptStartMarker = promptStartMarker;
			override readonly endMarker = endMarker;
			override hasOutput() { return true; }
			override getPromptRowCount() { return promptRowCount; }
			override getCommandRowCount() { return 1; }
		};
		const commandDetection = new class extends mock<ICommandDetectionCapability>() {
			override readonly hasRichCommandDetection = true;
			override getCommandForLine() { return command; }
		};
		const capabilities = store.add(new TerminalCapabilityStore());
		capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly capabilities = capabilities;
			override readonly targetRef = store.add({ object: location === 'editor' ? TerminalLocation.Editor : TerminalLocation.Panel, dispose: () => { } });
			override readonly onDidChangeTarget = Event.None;
			override readonly onDidChangeVisibility = Event.None;
		};
		const xterm = new class extends mock<IXtermTerminal & { raw: Terminal }>() {
			override readonly raw = raw;
			override getXtermTheme() { return {}; }
		};
		const context = new class extends mock<ITerminalContributionContext>() {
			override readonly instance = instance;
		};
		const contribution = store.add(instantiationService.createInstance(TerminalStickyScrollContribution, context));
		contribution.xtermReady(xterm);
		await clock.tickAsync(show ? 100 : 0);

		const element = host.querySelector<HTMLElement>('.terminal-sticky-scroll');
		ok(element);
		const screen = element.querySelector<HTMLElement>('.xterm-screen');
		ok(screen);
		ok(raw.screenElement);

		function layout(height: number) {
			pane.style.height = `${height}px`;
			splitView.layout(height);
			contribution.layout();
		}

		return { raw, contribution, root, pane, element, screen, terminalScreen: raw.screenElement, endMarker, clock, write, layout };
	}

	for (const modernUI of [false, true]) {
		suite(modernUI ? 'Modern UI' : 'Classic UI', () => {
			test('positions the header on its first show', async () => {
				const { raw, pane, element, screen, terminalScreen } = await createOverlay(modernUI);
				ok(raw.dimensions);
				ok(pane.clientHeight % raw.dimensions.css.cell.height !== 0, 'The pane must not fit an integral number of rows');
				deepStrictEqual({
					visible: element.classList.contains('visible'),
					offset: screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top
				}, {
					visible: true,
					offset: 0
				});
			});

			test('keeps the header aligned after scrolling', async () => {
				const { raw, screen, terminalScreen, clock } = await createOverlay(modernUI);
				raw.scrollToLine(11);
				await clock.tickAsync(100);
				deepStrictEqual(screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top, 0);
			});

			test('keeps the header aligned after a layout without a row count change', async () => {
				const { raw, layout, screen, terminalScreen, clock } = await createOverlay(modernUI);
				layout(240);
				await clock.tickAsync(100);
				deepStrictEqual({
					rows: raw.rows,
					offset: screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top
				}, {
					rows: 10,
					offset: 0
				});
			});

			test('pushes a multiline header out by cell heights at the next command', async () => {
				const { raw, screen, terminalScreen, endMarker, clock } = await createOverlay(modernUI, { promptRowCount: 3 });
				raw.scrollToLine(endMarker.line - 1);
				await clock.tickAsync(100);
				ok(raw.dimensions);
				deepStrictEqual({
					height: screen.getBoundingClientRect().height,
					offset: screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top
				}, {
					height: 3 * raw.dimensions.css.cell.height,
					offset: -2 * raw.dimensions.css.cell.height
				});
			});

			test('cancels the delayed first show when scrolling back to the prompt', async () => {
				const { raw, element, clock } = await createOverlay(modernUI, { show: false });
				const initiallyVisible = element.classList.contains('visible');
				raw.scrollToTop();
				await clock.tickAsync(100);
				deepStrictEqual({
					initiallyVisible,
					visible: element.classList.contains('visible')
				}, {
					initiallyVisible: false,
					visible: false
				});
			});

			test('keeps the header hidden when laying out the alternate buffer', async () => {
				const { raw, contribution, element, clock, write } = await createOverlay(modernUI);
				await write('\x1b[?1049h');
				contribution.layout();
				await clock.tickAsync(100);
				deepStrictEqual({
					buffer: raw.buffer.active.type,
					visible: element.classList.contains('visible')
				}, {
					buffer: 'alternate',
					visible: false
				});
			});

			test('cancels a pending show in the alternate buffer and restores it on return', async () => {
				const { raw, contribution, element, screen, terminalScreen, clock, write } = await createOverlay(modernUI, { show: false });
				await write('\x1b[?1049h');
				contribution.layout();
				await clock.tickAsync(100);
				const visibleInAlternateBuffer = element.classList.contains('visible');
				await write('\x1b[?1049l');
				raw.scrollToLine(10);
				await clock.tickAsync(100);
				deepStrictEqual({
					visibleInAlternateBuffer,
					buffer: raw.buffer.active.type,
					visible: element.classList.contains('visible'),
					offset: screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top
				}, {
					visibleInAlternateBuffer: false,
					buffer: 'normal',
					visible: true,
					offset: 0
				});
			});

			for (const location of ['side', 'editor', 'fixed', 'upper split'] as const) {
				test(`keeps the header aligned in the ${location} terminal`, async () => {
					const { raw, element, screen, terminalScreen, layout, clock } = await createOverlay(modernUI, { location });
					ok(raw.element);
					ok(raw.element.offsetParent);
					deepStrictEqual(element.offsetParent, raw.element.offsetParent);
					const initialOffset = screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
					layout(240);
					await clock.tickAsync(100);
					deepStrictEqual({
						initialOffset,
						resizedOffset: screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top
					}, {
						initialOffset: 0,
						resizedOffset: 0
					});
				});
			}

			test('keeps the header aligned when toggling Modern UI', async () => {
				const { root, contribution, screen, terminalScreen, clock } = await createOverlay(modernUI);
				root.classList.toggle('modern-ui', !modernUI);
				contribution.layout();
				await clock.tickAsync(100);
				deepStrictEqual(screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top, 0);
			});

			test('keeps fractional font and zoom geometry within one CSS pixel', async () => {
				const { root, contribution, screen, terminalScreen, clock } = await createOverlay(modernUI, { fontSize: 13.5 });
				root.style.zoom = '1.25';
				contribution.layout();
				await clock.tickAsync(100);
				const offset = screen.getBoundingClientRect().top - terminalScreen.getBoundingClientRect().top;
				ok(Math.abs(offset) <= 1, `Header offset: ${offset}px`);
			});
		});
	}
});
