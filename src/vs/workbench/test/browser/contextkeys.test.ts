/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import '../../browser/actions/layoutActions.js';
import '../../browser/parts/auxiliarybar/auxiliaryBarActions.js';
import { ChatPartEnabledContext } from '../../common/contextkeys.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../browser/parts/editor/editor.js';
import { WorkbenchContextKeysHandler } from '../../browser/contextkeys.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { TestLayoutService, workbenchInstantiationService } from './workbenchTestServices.js';

suite('Workbench Context Keys - Editor Area Hidden For Chat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class ChatLayoutService extends TestLayoutService {
		readonly emitter = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		override readonly onDidChangePartVisibility = this.emitter.event;
		chatVisible = true;
		editorHidden = false;
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
		instantiationService.stub(IEditorGroupsService, 'partOptions', { ...DEFAULT_EDITOR_PART_OPTIONS });
		disposables.add(instantiationService.createInstance(WorkbenchContextKeysHandler));
		return contextKeyService;
	}

	const maximizeActionShown = (contextKeyService: ContextKeyService) => MenuRegistry.getMenuItems(MenuId.AuxiliaryBarTitle)
		.some(item => isIMenuItem(item) && item.command.id === 'workbench.action.toggleMaximizedAuxiliaryBar' && (!item.when || item.when.evaluate(contextKeyService.getContext(null))));

	const snapshot = (contextKeyService: ContextKeyService) => ({
		chatPartVisible: contextKeyService.getContextKeyValue('chatPartVisible'),
		editorAreaHiddenByChat: contextKeyService.getContextKeyValue('editorAreaHiddenByChat'),
		mainEditorAreaVisible: contextKeyService.getContextKeyValue('mainEditorAreaVisible'),
	});

	test('the keys follow a chat part that the layout creates visible, without an event, once the window restored, and then follow it', async () => {
		const layoutService = new ChatLayoutService();
		let restored!: () => void;
		layoutService.whenRestored = new Promise<void>(resolve => restored = resolve);
		layoutService.chatVisible = false;
		layoutService.editorHidden = true;
		const contextKeyService = create(layoutService);
		const atConstruction = { ...snapshot(contextKeyService), maximizeActionShown: maximizeActionShown(contextKeyService) };
		const chatPartEnabled = ChatPartEnabledContext.bindTo(contextKeyService);

		// The layout creates the chat part from its stored state, visible, and fires no visibility event
		// and normalizes a stale hidden editor area to visible, also without an event
		layoutService.chatVisible = true;
		layoutService.editorHidden = false;
		restored();
		await layoutService.whenRestored;
		await Promise.resolve();
		// A feature enables the chat area, and later turns it off again
		chatPartEnabled.set(true);
		const restoredKeys = { ...snapshot(contextKeyService), maximizeActionShown: maximizeActionShown(contextKeyService) };
		chatPartEnabled.set(false);
		const disabledAgain = maximizeActionShown(contextKeyService);
		const paletteEnabled = !!MenuRegistry.getCommand('workbench.action.toggleEditorVisibility')?.precondition?.evaluate(contextKeyService.getContext(null));

		layoutService.chatVisible = false;
		layoutService.emitter.fire({ partId: Parts.CHAT_PART, visible: false });
		const hiddenChat = snapshot(contextKeyService);

		layoutService.chatVisible = true;
		layoutService.editorHidden = true;
		layoutService.emitter.fire({ partId: Parts.EDITOR_PART, visible: false });

		assert.deepStrictEqual({ atConstruction, restoredKeys, disabledAgain, paletteEnabled, hiddenChat, editorHidden: snapshot(contextKeyService) }, {
			atConstruction: { chatPartVisible: false, editorAreaHiddenByChat: true, mainEditorAreaVisible: false, maximizeActionShown: true },
			restoredKeys: { chatPartVisible: true, editorAreaHiddenByChat: false, mainEditorAreaVisible: true, maximizeActionShown: false },
			disabledAgain: true,
			paletteEnabled: true,
			hiddenChat: { chatPartVisible: false, editorAreaHiddenByChat: false, mainEditorAreaVisible: true },
			editorHidden: { chatPartVisible: true, editorAreaHiddenByChat: true, mainEditorAreaVisible: false },
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
