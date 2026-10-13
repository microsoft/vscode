/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { IChatSessionCost } from '../../../../common/model/chatModel.js';
import { MockChatModel } from '../../../common/model/mockChatModel.js';

suite('ChatInputPart', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('session-cost listener updates the usage widget without another turn and detaches on chat switches', () => {
		const first = disposables.add(new MockChatModel(URI.parse('test:/first')));
		const peer = disposables.add(new MockChatModel(URI.parse('test:/peer')));
		const widget = { viewModel: { model: first } };
		const costs: IChatSessionCost[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_contextUsageDisposables: disposables.add(new MutableDisposable()),
			_widget: widget,
			contextUsageWidget: {
				update: () => { },
				updateSessionCost: (credits: number, status?: IChatSessionCost['status']) => costs.push({ credits, status }),
			},
			languageModelsService: { onDidChangeLanguageModels: Event.None },
		}) as { updateContextUsageWidget(): void };

		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 0.6, status: 'complete' });
		widget.viewModel.model = peer;
		inputPart.updateContextUsageWidget();
		first.setSessionCost({ credits: 1.2, status: 'complete' });
		peer.setSessionCost({ credits: 0.25, status: 'partial' });
		assert.deepStrictEqual(costs, [
			{ credits: 0, status: undefined },
			{ credits: 0.6, status: 'complete' },
			{ credits: 0, status: undefined },
			{ credits: 0.25, status: 'partial' },
		]);
	});

	test('uses the Sessions content gutter for composer layout', () => {
		const followupsContainer = dom.$('div');
		const editorLayouts: { width: number; height: number }[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { isSessionsWindow: true },
			inputContainer: dom.$('div'),
			followupsContainer,
			_inputEditor: {
				getScrollWidth: () => 100,
				getContentHeight: () => 20,
				layout: (dimension: { width: number; height: number }) => editorLayouts.push(dimension),
			},
			inputEditorMaxHeight: 250,
			inputEditorMinHeight: undefined,
			singleLineInputEditorHeight: 20,
			inputEditorTrailingSpace: 0,
			ignoreInputEditorContentSizeChanges: false,
		}) as ChatInputPart;

		inputPart.layout(800);

		assert.deepStrictEqual({
			followupsWidth: followupsContainer.style.width,
			editorLayouts,
		}, {
			followupsWidth: '752px',
			editorLayouts: [{ width: 740, height: 20 }],
		});
	});
});
