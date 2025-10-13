/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { CHAT_CATEGORY } from './chatActions.js';

export interface IChatMathBlockActionContext {
	latexSource: string;
}

export function isChatMathBlockActionContext(thing: unknown): thing is IChatMathBlockActionContext {
	return typeof thing === 'object' && thing !== null && 'latexSource' in thing;
}

export function registerChatMathActions() {
	registerAction2(class CopyMathBlockAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyMathBlock',
				title: localize2('interactive.copyMathBlock.label', "Copy LaTeX Source"),
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.copy,
				menu: {
					id: MenuId.ChatMathBlock,
					group: 'navigation',
					order: 10
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]) {
			const context = args[0];
			if (!isChatMathBlockActionContext(context)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			clipboardService.writeText(context.latexSource);
		}
	});
}
