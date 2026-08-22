/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ForkConversationAction } from '../../../browser/actions/chatForkActions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';

class TestForkConversationAction extends ForkConversationAction {
	openForkedSession(instantiationService: TestInstantiationService, parentSessionResource: URI, forkedSessionResource: URI): Promise<void> {
		return this._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
	}
}

suite('ForkConversationAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a fork with the current session selection reason', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const parentSessionResource = URI.parse('vscode-chat-session://parent');
		const forkedSessionResource = URI.parse('vscode-chat-session://fork');
		let openCall: { resource: URI; usesViewTarget: boolean; options: IChatEditorOptions | undefined } | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			openSession: async (resource, target, options) => {
				openCall = { resource, usesViewTarget: target === ChatViewPaneTarget, options };
				return undefined;
			},
		}));

		await new TestForkConversationAction().openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);

		assert.deepStrictEqual(openCall, {
			resource: forkedSessionResource,
			usesViewTarget: true,
			options: { sessionTypeSelectionReason: 'currentSession' },
		});
	});
});
