/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mockObject, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { EditorAgentHostPolicyContinuationPresenter } from '../../../browser/agentSessions/agentHost/agentHostPolicyContinuationEditor.js';
import { ChatViewId, IChatWidget } from '../../../browser/chat.js';
import { ChatEditorInput } from '../../../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';

suite('Editor Agent Host policy continuation presenter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sourceResource = URI.parse('agent-host-claude:/source');
	const target = URI.parse('agent-host-copilotcli:/copy');

	function setup(sidebar: boolean) {
		const services = store.add(new TestInstantiationService());
		const state = { sourceCurrent: true, leaveWhileOpeningView: false, openFailure: false };
		const navigation: { kind: string; resource: string }[] = [];
		const source = upcastPartial<IChatWidget>({
			viewContext: sidebar ? { viewId: ChatViewId } : {},
			viewModel: upcastPartial<ChatViewModel>({ sessionResource: sourceResource }),
		});
		const editor: ChatEditorInput = Object.create(ChatEditorInput.prototype, { sessionResource: { value: sourceResource } });
		const group = upcastPartial<IEditorGroup>({ editors: [editor] });
		services.stub(IEditorGroupsService, { groups: [group] });
		services.stub(IEditorService, {
			replaceEditors: async (replacements, replacementGroup) => {
				assert.strictEqual(replacementGroup, group);
				assert.strictEqual(replacements[0].editor, editor);
				if (state.openFailure) { throw new Error('Editor unavailable'); }
				const replacement = replacements[0].replacement;
				assert.ok(hasKey(replacement, { resource: true }) && URI.isUri(replacement.resource));
				navigation.push({ kind: 'replace', resource: replacement.resource.toString() });
			},
			openEditor: async () => assert.fail('The source editor must be replaced in place'),
		});
		const views = mockObject<IViewsService>()();
		views.openView.callsFake(async () => {
			if (state.leaveWhileOpeningView) { state.sourceCurrent = false; }
			return upcastPartial<ChatViewPane>({
				loadSession: async resource => {
					navigation.push({ kind: 'sidebar', resource: resource.toString() });
					return undefined;
				},
				focus: () => { },
			});
		});
		services.stub(IViewsService, { openView: views.openView });
		services.stub(IChatService, {});
		services.stub(IChatSessionsService, {});
		services.stub(ICustomizationHarnessService, {});
		services.stub(ILanguageModelToolsService, {});
		services.stub(IAgentHostImportConversationStore, new AgentHostImportConversationStore());
		services.stub(IProgressService, {});
		services.stub(ILogService, new NullLogService());
		const presenter = services.createInstance(EditorAgentHostPolicyContinuationPresenter);
		return {
			state, navigation,
			open: () => presenter.open(target, source, () => {
				if (!state.sourceCurrent) { throw new CancellationError(); }
			}),
		};
	}

	for (const sidebar of [false, true]) {
		test('opens the copy through the normal ' + (sidebar ? 'sidebar' : 'source editor') + ' surface', async () => {
			const { open, navigation } = setup(sidebar);
			await open();
			assert.deepStrictEqual(navigation, [{ kind: sidebar ? 'sidebar' : 'replace', resource: target.toString() }]);
		});
	}

	test('does not replace a newer sidebar selection after the view opens', async () => {
		const { open, state, navigation } = setup(true);
		state.leaveWhileOpeningView = true;
		await assert.rejects(open(), CancellationError);
		const cancelledNavigation = [...navigation];
		state.sourceCurrent = true;
		state.leaveWhileOpeningView = false;
		await open();
		assert.deepStrictEqual({ cancelledNavigation, navigation }, { cancelledNavigation: [], navigation: [{ kind: 'sidebar', resource: target.toString() }] });
	});

	test('reports a failed replacement without claiming presentation', async () => {
		const { open, state, navigation } = setup(false);
		state.openFailure = true;
		await assert.rejects(open(), /Couldn't open the copied conversation/);
		state.openFailure = false;
		await open();
		assert.deepStrictEqual(navigation, [{ kind: 'replace', resource: target.toString() }]);
	});
});
