/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatCollapsibleInputOutputContentPart } from '../../../../browser/widget/chatContentParts/chatToolInputOutputContentPart.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';

suite('ChatCollapsibleInputOutputContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes title file widgets before rerendering title widgets', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		let registerCalls = 0;
		let disposeCalls = 0;

		instantiationService.stub(IChatMarkdownAnchorService, {
			_serviceBrand: undefined,
			lastFocusedAnchor: undefined,
			register: () => {
				registerCalls++;
				return {
					dispose: () => {
						disposeCalls++;
					}
				};
			}
		});

		const context: IChatContentPartRenderContext = {
			element: { sessionResource: URI.parse('vscode-chat://session/test') } as IChatContentPartRenderContext['element'],
			elementIndex: 0,
			container: mainWindow.document.createElement('div'),
			content: [],
			contentIndex: 0,
			editorPool: {} as IChatContentPartRenderContext['editorPool'],
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			diffEditorPool: {} as IChatContentPartRenderContext['diffEditorPool'],
			codeBlockModelCollection: {} as IChatContentPartRenderContext['codeBlockModelCollection'],
			currentWidth: observableValue('test', 300),
			onDidChangeVisibility: Event.None,
			inlineTextModels: {} as IChatContentPartRenderContext['inlineTextModels'],
		};

		const part = store.add(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			new MarkdownString('Reading [test.txt](file:///project/test.txt?vscodeLinkType=file)', { supportThemeIcons: true, isTrusted: { enabledCommands: [] } }),
			undefined,
			undefined,
			context,
			{ kind: 'code', data: '{}', languageId: 'json', codeBlockIndex: 0, ownerMarkdownPartId: 'test', options: {} },
			undefined,
			false,
			false,
		));

		assert.strictEqual(registerCalls, 1);
		assert.strictEqual(disposeCalls, 0);

		part.title = new MarkdownString('Reading [other.txt](file:///project/other.txt?vscodeLinkType=file)', { supportThemeIcons: true, isTrusted: { enabledCommands: [] } });

		assert.strictEqual(registerCalls, 2);
		assert.strictEqual(disposeCalls, 1);
	});
});
