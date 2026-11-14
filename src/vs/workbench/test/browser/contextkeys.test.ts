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
import { getCustomizeLayoutVisibilityItems } from '../../browser/actions/layoutActions.js';
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
		override hasChatPart(): boolean {
			return true;
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
	});

	test('the keys are set at construction with a visible chat part and follow it', () => {
		const layoutService = new ChatLayoutService();
		const contextKeyService = create(layoutService);
		const atConstruction = snapshot(contextKeyService);

		layoutService.chatVisible = false;
		layoutService.emitter.fire({ partId: Parts.CHAT_PART, visible: false });
		const hiddenChat = snapshot(contextKeyService);

		layoutService.chatVisible = true;
		layoutService.editorHidden = true;
		layoutService.emitter.fire({ partId: Parts.EDITOR_PART, visible: false });

		assert.deepStrictEqual({ atConstruction, hiddenChat, editorHidden: snapshot(contextKeyService) }, {
			atConstruction: { chatPartVisible: true, editorAreaHiddenByChat: false },
			hiddenChat: { chatPartVisible: false, editorAreaHiddenByChat: false },
			editorHidden: { chatPartVisible: true, editorAreaHiddenByChat: true },
		});
	});

	test('the Customize Layout picker offers the editor area only with the chat part visible, outside the Agents window', () => {
		const visibilityItems = (context: Record<string, boolean>) => getCustomizeLayoutVisibilityItems({ getValue: <T>(key: string) => context[key] as T | undefined })
			.filter(item => item.label === 'Editor Area' || item.label === 'Chat');
		const editorArea = (active: boolean) => ({ id: 'workbench.action.toggleEditorAreaForChat', label: 'Editor Area', active });
		const chat = (active: boolean) => ({ id: 'workbench.action.agentsView.toggleChatPart', label: 'Chat', active });

		assert.deepStrictEqual({
			noChatPart: visibilityItems({ mainEditorAreaVisible: true }),
			hiddenChat: visibilityItems({ chatPartEnabled: true, mainEditorAreaVisible: true }),
			shownChat: visibilityItems({ chatPartEnabled: true, chatPartVisible: true, mainEditorAreaVisible: true }),
			editorHidden: visibilityItems({ chatPartEnabled: true, chatPartVisible: true, mainEditorAreaVisible: false }),
			agentsWindow: visibilityItems({ chatPartEnabled: true, chatPartVisible: true, mainEditorAreaVisible: true, isSessionsWindow: true }),
		}, {
			noChatPart: [],
			hiddenChat: [chat(false)],
			shownChat: [editorArea(true), chat(true)],
			editorHidden: [editorArea(false), chat(true)],
			agentsWindow: [],
		});
	});

	test('the toggle commands show and hide the chat part, and toggle the editor area', async () => {
		const calls: string[] = [];
		const state = { chatVisible: false };
		const layoutService = new class extends TestLayoutService {
			override isVisible(part: Parts): boolean { return part === Parts.CHAT_PART ? state.chatVisible : true; }
			override async setPartHidden(hidden: boolean, part: Parts): Promise<void> { calls.push(`setPartHidden(${hidden}, ${part})`); state.chatVisible = !hidden; }
			override isEditorHiddenByChat(): boolean { return true; }
			override setEditorHiddenByChat(hidden: boolean): void { calls.push(`setEditorHiddenByChat(${hidden})`); }
		};
		const accessor = { get: () => layoutService } as unknown as ServicesAccessor;
		const run = (id: string) => CommandsRegistry.getCommand(id)!.handler(accessor);

		await run('workbench.action.toggleChatPartVisibility');
		await run('workbench.action.toggleChatPartVisibility');
		await run('workbench.action.toggleEditorAreaForChat');

		assert.deepStrictEqual(calls, [`setPartHidden(false, ${Parts.CHAT_PART})`, `setPartHidden(true, ${Parts.CHAT_PART})`, 'setEditorHiddenByChat(false)']);
	});
});
