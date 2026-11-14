/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import '../../browser/actions/layoutActions.js';
import { WorkbenchContextKeysHandler } from '../../browser/contextkeys.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from './workbenchTestServices.js';

suite('Workbench Context Keys - Editor Area Hidden For Chat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class ChatLayoutService extends TestLayoutService {
		readonly emitter = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		override readonly onDidChangePartVisibility = this.emitter.event;
		chatVisible = true;
		editorHidden = false;
		chatEnabled = true;
		override hasChatPart(): boolean {
			return this.chatEnabled;
		}
		override isVisible(part: Parts): boolean {
			return part === Parts.CHAT_PART ? this.chatVisible : part === Parts.EDITOR_PART ? !this.editorHidden : true;
		}
		override isEditorHiddenByChat(): boolean {
			return this.editorHidden;
		}
	}

	function create(layoutService: ChatLayoutService) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		disposables.add(instantiationService.createInstance(WorkbenchContextKeysHandler));
		return contextKeyService;
	}

	const snapshot = (contextKeyService: ContextKeyService) => ({
		chatPartVisible: contextKeyService.getContextKeyValue('chatPartVisible'),
		editorAreaHiddenByChat: contextKeyService.getContextKeyValue('editorAreaHiddenByChat'),
		chatPartEnabled: contextKeyService.getContextKeyValue('chatPartEnabled'),
	});

	test('the keys are set at construction with a visible chat part and follow it', () => {
		const layoutService = new ChatLayoutService();
		layoutService.chatEnabled = false;
		const contextKeyService = create(layoutService);
		const atConstruction = snapshot(contextKeyService);

		// The chat part joins the layout after the handler was created
		layoutService.chatEnabled = true;
		layoutService.chatVisible = false;
		layoutService.emitter.fire({ partId: Parts.CHAT_PART, visible: false });
		const hiddenChat = snapshot(contextKeyService);

		layoutService.chatVisible = true;
		layoutService.editorHidden = true;
		layoutService.emitter.fire({ partId: Parts.EDITOR_PART, visible: false });

		assert.deepStrictEqual({ atConstruction, hiddenChat, editorHidden: snapshot(contextKeyService) }, {
			atConstruction: { chatPartVisible: true, editorAreaHiddenByChat: false, chatPartEnabled: false },
			hiddenChat: { chatPartVisible: false, editorAreaHiddenByChat: false, chatPartEnabled: true },
			editorHidden: { chatPartVisible: true, editorAreaHiddenByChat: true, chatPartEnabled: true },
		});
	});

	test('the editor area toggle follows the layout', async () => {
		const calls: string[] = [];
		const state = { chatVisible: false, editorHidden: false };
		const layoutService = new class extends TestLayoutService {
			override isVisible(part: Parts): boolean { return part === Parts.CHAT_PART ? state.chatVisible : true; }
			override isEditorHiddenByChat(): boolean { return state.editorHidden; }
			override setEditorHiddenByChat(hidden: boolean): void { calls.push(`setEditorHiddenByChat(${hidden})`); }
			override toggleMaximizedPanel(): void { calls.push('toggleMaximizedPanel'); }
		};
		const accessor = { get: () => layoutService } as unknown as ServicesAccessor;
		const run = (id: string) => CommandsRegistry.getCommand(id)!.handler(accessor);

		await run('workbench.action.toggleEditorVisibility');
		state.chatVisible = true;
		await run('workbench.action.toggleEditorVisibility');
		state.editorHidden = true;
		await run('workbench.action.toggleEditorVisibility');

		assert.deepStrictEqual(calls, [
			'toggleMaximizedPanel',
			'setEditorHiddenByChat(true)',
			'setEditorHiddenByChat(false)',
		]);
	});
});
