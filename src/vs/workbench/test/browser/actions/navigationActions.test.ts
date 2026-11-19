/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NAVIGATE_VIEW_COMMANDS } from '../../../browser/actions/navigationActions.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';

suite('Navigate to the view on the left or right', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Navigates from the focused part to its neighbor, in a window whose parts are, from left to right, `order`: the
	 * parts that show. Records what gets focus.
	 */
	async function navigate(order: readonly Parts[], focused: Parts, direction: Direction.Left | Direction.Right): Promise<string[]> {
		const focusCalls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, upcastPartial<IContextKeyService>({ contextMatchesRules: () => false }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			hasFocus: part => part === focused,
			isVisible: part => order.includes(part),
			getVisibleNeighborPart: (part, neighborDirection) => order[order.indexOf(part) + (neighborDirection === Direction.Right ? 1 : -1)],
			focusPart: part => { focusCalls.push(`focusPart ${part}`); },
		}));
		const group = (name: string) => upcastPartial<IEditorGroup>({ focus: () => { focusCalls.push(`focus group ${name}`); } });
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			activeGroup: group('active'),
			findGroup: () => undefined,
		}));
		instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({
			getActivePaneComposite: () => ({ getId: () => 'viewlet' }) as ReturnType<IPaneCompositePartService['getActivePaneComposite']>,
			openPaneComposite: async (id, location) => { focusCalls.push(`open ${location}`); return undefined; },
		}));
		const id = direction === Direction.Right ? NAVIGATE_VIEW_COMMANDS.right : NAVIGATE_VIEW_COMMANDS.left;
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
		return focusCalls;
	}

	test('enters and leaves a visible chat part beside the editor, and skips one that is absent', async () => {
		const withChat = [Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART];
		const withoutChat = [Parts.SIDEBAR_PART, Parts.EDITOR_PART];
		assert.deepStrictEqual({
			sideBarRight: await navigate(withChat, Parts.SIDEBAR_PART, Direction.Right),
			editorLeft: await navigate(withChat, Parts.EDITOR_PART, Direction.Left),
			chatLeft: await navigate(withChat, Parts.CHAT_PART, Direction.Left),
			chatRight: await navigate(withChat, Parts.CHAT_PART, Direction.Right),
			withoutChatSideBarRight: await navigate(withoutChat, Parts.SIDEBAR_PART, Direction.Right),
			withoutChatEditorLeft: await navigate(withoutChat, Parts.EDITOR_PART, Direction.Left),
		}, {
			sideBarRight: [`focusPart ${Parts.CHAT_PART}`],
			editorLeft: [`focusPart ${Parts.CHAT_PART}`],
			chatLeft: [`open ${ViewContainerLocation.Sidebar}`],
			chatRight: [`focusPart ${Parts.EDITOR_PART}`],
			withoutChatSideBarRight: ['focus group active'],
			withoutChatEditorLeft: [`open ${ViewContainerLocation.Sidebar}`],
		});
	});
});
