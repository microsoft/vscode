/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IsSessionsWindowContext, ResourceContextKey } from '../../../../common/contextkeys.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../browser/fileConstants.js';
import '../../electron-browser/fileActions.contribution.js';

suite('Chat file reveal menus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const menu of [MenuId.ChatAttachmentsContext, MenuId.ChatInlineResourceAnchorContext, MenuId.ChatInputResourceAttachmentContext, MenuId.ChatImageContext]) {
		test(`offers OS reveal only for local files in ${menu.id}`, () => {
			const context = store.add(new MockContextKeyService());
			const scheme = ResourceContextKey.Scheme.bindTo(context);
			const items = MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => item.command.id === 'revealFileInOS');
			assert.deepStrictEqual({
				count: items.length,
				title: items[0]?.command.title,
				visible: [Schemas.file, Schemas.vscodeUserData, Schemas.vscodeRemote, AGENT_HOST_SCHEME, Schemas.https, Schemas.untitled].map(value => {
					scheme.set(value);
					return items.some(item => item.when?.evaluate({ getValue: key => context.getContextKeyValue(key) }));
				}),
			}, {
				count: 1,
				title: isWindows ? 'Reveal in File Explorer' : isMacintosh ? 'Reveal in Finder' : 'Open Containing Folder',
				visible: [true, false, false, false, false, false],
			});
		});
	}

	for (const menu of [MenuId.ChatAttachmentsContext, MenuId.ChatInlineResourceAnchorContext, MenuId.ChatInputResourceAttachmentContext]) {
		test(`offers Explorer reveal for local and remote files in ${menu.id}`, () => {
			const items = MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter(item => item.command.id === REVEAL_IN_EXPLORER_COMMAND_ID);
			const visibleTitles = (isSessionsWindow: boolean) => {
				const context = store.add(new MockContextKeyService());
				const scheme = ResourceContextKey.Scheme.bindTo(context);
				ResourceContextKey.IsFileSystemResource.bindTo(context).set(true);
				IsSessionsWindowContext.bindTo(context).set(isSessionsWindow);
				return [Schemas.file, Schemas.vscodeRemote, AGENT_HOST_SCHEME].map(value => {
					scheme.set(value);
					return items.filter(item => item.when?.evaluate({ getValue: key => context.getContextKeyValue(key) })).map(item => item.command.title);
				});
			};
			assert.deepStrictEqual({
				workbench: visibleTitles(false),
				agentsWindow: visibleTitles(true),
			}, {
				workbench: [['Reveal in Explorer View'], ['Reveal in Explorer View'], ['Reveal in Explorer View']],
				agentsWindow: [['Reveal in Files View'], ['Reveal in Files View'], ['Reveal in Files View']],
			});
		});
	}
});
