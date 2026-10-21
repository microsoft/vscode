/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ArtifactRequestPresentation } from '../../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { createTestArtifactRequestPresentation } from '../../../../../../../platform/artifactIntegrations/test/common/artifactIntegrationTestUtils.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IListService, WorkbenchListWidget } from '../../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { chartsGreen } from '../../../../../../../platform/theme/common/colors/chartsColors.js';
import '../../../../../../browser/actions/listCommands.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatArtifactActionContentPart, getArtifactRequestAccessibleText } from '../../../../browser/widget/chatContentParts/chatArtifactActionContentPart.js';

suite('ChatArtifactActionContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(presentation = createTestArtifactRequestPresentation()) {
		const instantiation = workbenchInstantiationService(undefined, store);
		const listService = new class extends mock<IListService>() {
			override lastFocusedList: WorkbenchListWidget | undefined;
			register(widget: WorkbenchListWidget) {
				this.lastFocusedList = widget;
				return toDisposable(() => this.lastFocusedList = undefined);
			}
		}();
		instantiation.stub(IListService, listService);
		instantiation.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover() { return toDisposable(() => { }); }
		}());
		const opened: string[] = [];
		const errors: string[] = [];
		instantiation.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: Parameters<IOpenerService['open']>[0], options?: Parameters<IOpenerService['open']>[1]): Promise<boolean> {
				assert.deepStrictEqual(options, { fromUserGesture: true, allowCommands: false });
				opened.push(resource.toString());
				return true;
			}
		}());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: string | Error) { errors.push(String(error)); }
		}());
		const part = store.add(instantiation.createInstance(ChatArtifactActionContentPart, presentation, 'Model-facing instructions <b>stay plain</b>', undefined));
		const container = dom.$('.monaco-workbench');
		dom.getWindow(container).document.body.append(container);
		store.add(toDisposable(() => container.remove()));
		container.append(part.domNode);
		const button = part.domNode.querySelector<HTMLElement>('.chat-action-request-disclosure')!;
		const enter = () => button.dispatchEvent(new (dom.getWindow(button).KeyboardEvent)('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		return { part, button, enter, opened, errors, instantiation, listService };
	}

	test('starts collapsed and supports keyboard disclosure and the separate unmodified agent message', () => {
		const f = fixture();
		const toggle = f.part.domNode.querySelector<HTMLElement>('.chat-action-request-message-toggle')!;
		const state = () => ({ expanded: f.button.ariaExpanded, raw: f.part.domNode.classList.contains('showing-agent-message'), toggleTabIndex: toggle.tabIndex });
		const before = state();
		f.enter();
		const expanded = state();
		toggle.click();
		const raw = state();
		toggle.click();
		f.enter();
		assert.deepStrictEqual({
			states: [before, expanded, raw, state()],
			label: f.button.ariaLabel,
			message: f.part.domNode.querySelector('.chat-action-request-message')?.textContent,
			html: f.part.domNode.querySelector('b'),
		}, {
			states: [
				{ expanded: 'false', raw: false, toggleTabIndex: -1 },
				{ expanded: 'true', raw: false, toggleTabIndex: 0 },
				{ expanded: 'true', raw: true, toggleTabIndex: 0 },
				{ expanded: 'false', raw: false, toggleTabIndex: -1 },
			],
			label: 'Analyse Scorecard: Experiment 42, Experiments (Automatic)',
			message: 'Model-facing instructions <b>stay plain</b>', html: null,
		});
	});

	test('renders generic facts and opens details through workbench keyboard commands with status colors', async () => {
		const f = fixture();
		f.enter();
		const list = f.part.domNode.querySelector<HTMLElement>('.monaco-list')!;
		list.focus();
		f.instantiation.invokeFunction(CommandsRegistry.getCommand('list.focusDown')!.handler);
		await timeout(0);
		f.instantiation.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
		assert.deepStrictEqual({
			facts: f.part.domNode.querySelector('dl')?.textContent,
			label: f.part.domNode.querySelector('.artifact-details-item-label')?.textContent,
			description: f.part.domNode.querySelector('.artifact-details-item-description')?.textContent,
			color: f.part.domNode.querySelector<HTMLElement>('.artifact-details-item .artifact-icon')?.style.color,
			glyphColor: f.part.domNode.querySelector<HTMLElement>('.artifact-details-item .artifact-icon .codicon')?.style.color,
			focused: f.listService.lastFocusedList?.getFocus(),
			selected: f.listService.lastFocusedList?.getSelection(),
			errors: f.errors,
			opened: f.opened,
		}, {
			facts: 'StateCompleted', label: 'Successful searches', description: '+2.3%',
			color: `var(--vscode-${chartsGreen.replace('.', '-')})`,
			glyphColor: 'inherit',
			focused: [0], selected: [0], errors: [],
			opened: ['https://example.test/experiments/42/scorecard'],
		});
	});

	test('keeps provider text plain and refuses executable resource links', () => {
		const presentation: ArtifactRequestPresentation = createTestArtifactRequestPresentation({
			source: 'manual', artifact: { label: '<img src=x>', resource: 'command:untrusted' },
			details: [{ title: '<b>Details</b>', availability: { kind: 'available' }, links: [], items: [], completeness: 'partial' }],
		});

		const f = fixture(presentation);
		f.enter();
		f.part.domNode.querySelector<HTMLElement>('.chat-pill-button')!.click();
		assert.deepStrictEqual({
			label: f.button.ariaLabel, title: f.part.domNode.querySelector('.chat-artifact-action-section-title')?.textContent,
			html: f.part.domNode.querySelector('img, b'), opened: f.opened, errors: f.errors,
			partial: f.part.domNode.textContent?.includes('Partial snapshot. Open the artifact for more details.'),
		}, {
			label: 'Analyse Scorecard: <img src=x>, Experiments', title: '<b>Details</b>', html: null, opened: [],
			errors: ['Error: This artifact link cannot be opened.'], partial: true,
		});
	});

	test('snapshot descriptions retain their provenance and are safe in visual and accessible views', () => {
		const presentation = createTestArtifactRequestPresentation({
			details: [{
				title: 'Full resource title', description: '**Actual description** with [a link](command:unsafe).', descriptionFormat: 'markdown',
				availability: { kind: 'available' }, links: [], items: [], completeness: 'complete',
			}],
		});
		const f = fixture(presentation);
		f.enter();
		assert.deepStrictEqual({
			text: f.part.domNode.querySelector('.chat-artifact-action-section .chat-artifact-action-description')?.textContent,
			executable: f.part.domNode.querySelectorAll('.chat-artifact-action-description a').length,
			accessible: getArtifactRequestAccessibleText(presentation).includes('Actual description with a link.'),
			snapshot: presentation.details[0].description,
		}, { text: 'Actual description with a link.', executable: 0, accessible: true, snapshot: '**Actual description** with [a link](command:unsafe).' });
	});
});
