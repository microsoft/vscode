/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatAutoModeResolutionContentPart } from '../../../../browser/widget/chatContentParts/chatAutoModeResolutionContentPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatAutoModeResolutionPart } from '../../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import '../../../../browser/widget/media/chat.css';

suite('ChatAutoModeResolutionContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const context: IChatContentPartRenderContext = {
		element: new class extends mock<IChatResponseViewModel>() {
			override readonly isComplete = true;
		}(),
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};

	test('leads a routed row with the logo of the model\'s provider while model logos are shown', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		const showModelLogos = (value: boolean) => {
			configurationService.setUserConfiguration(ChatConfiguration.ModelLogos, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([ChatConfiguration.ModelLogos]),
				change: { keys: [ChatConfiguration.ModelLogos], overrides: [] },
				affectsConfiguration: key => key === ChatConfiguration.ModelLogos,
			} satisfies IConfigurationChangeEvent);
		};
		const rows = ([
			{ kind: 'autoModeResolution', resolved: { id: 'claude-opus-5.5', name: 'Claude Opus 5.5' }, fusion: true },
			// The routing service wrote this sentence, so the logo cannot go inside it.
			{ kind: 'autoModeResolution', resolved: { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', reason: 'Auto selected gpt-5.4-mini for its fit to your request.' } },
			{ kind: 'autoModeResolution', resolved: { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' } },
		] satisfies IChatAutoModeResolutionPart[]).map(content => store.add(instantiationService.createInstance(ChatAutoModeResolutionContentPart, content, context)).domNode);
		const snapshot = () => rows.map(row => {
			const logo = row.querySelector('.chat-model-provider-logo');
			return logo ? `${logo.className} | ${logo.nextElementSibling?.textContent}` : row.textContent;
		});
		const off = snapshot();
		showModelLogos(true);
		const on = snapshot();
		showModelLogos(false);

		const withoutLogos = ['Copilot Fusion routed task to Claude Opus 5.5', 'Auto selected gpt-5.4-mini for its fit to your request.', 'Auto routed task to DeepSeek V4 Pro'];
		assert.deepStrictEqual({ off, on, offAgain: snapshot() }, {
			off: withoutLogos,
			on: [
				'chat-model-provider-logo codicon codicon-chat-model-provider-claude | Copilot Fusion routed task to Claude Opus 5.5',
				'chat-model-provider-logo codicon codicon-chat-model-provider-openai | Auto selected gpt-5.4-mini for its fit to your request.',
				'Auto routed task to DeepSeek V4 Pro',
			],
			offAgain: withoutLogos,
		});
	});

	test('puts the logo and the text of a routed row in the columns of the tool rows\' icons and text', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.ModelLogos, true);
		const workbench = mainWindow.document.body.appendChild($('.monaco-workbench'));
		store.add(toDisposable(() => workbench.remove()));
		// The gutter a tool row gives its icon and its text: the icon a fifth of its size in, the text 24px in.
		for (const [name, value] of [
			['--vscode-codiconFontSize-compact', '12px'],
			['--vscode-spacing-size240', '24px'],
			['--vscode-spacing-size40', '4px'],
		]) {
			workbench.style.setProperty(name, value);
		}
		const value = append(append(append(workbench, $('.interactive-session')), $('.interactive-item-container.interactive-response')), $('.value'));
		const row = value.appendChild(store.add(instantiationService.createInstance(ChatAutoModeResolutionContentPart, {
			kind: 'autoModeResolution', resolved: { id: 'gpt-6-luna', name: 'GPT-6 Luna' }, fusion: true,
		}, context)).domNode);
		const logo = row.querySelector('.chat-model-provider-logo');
		const offset = (element: Element | null | undefined) => element && Math.round((element.getBoundingClientRect().left - row.getBoundingClientRect().left) * 10) / 10;

		assert.deepStrictEqual({ logo: offset(logo), logoWidth: logo?.getBoundingClientRect().width, text: offset(logo?.nextElementSibling) }, { logo: 2.4, logoWidth: 12, text: 24 });
	});
});
