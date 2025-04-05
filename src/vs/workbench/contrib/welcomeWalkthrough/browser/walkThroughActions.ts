/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorService } from '../../../services/editor/common/editorService.js';
import { WalkThroughPart, WALK_THROUGH_FOCUS } from './walkThroughPart.js';
import { ICommandAndKeybindingRule, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';

export const WalkThroughArrowUp: ICommandAndKeybindingRule = {
	id: 'workbench.action.interactivePlayground.arrowUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.editorTextFocus.toNegated()),
	primary: KeyCode.UpArrow,
	handler: accessor => {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof WalkThroughPart) {
			activeEditorPane.arrowUp();
		}
	}
};

export const WalkThroughArrowDown: ICommandAndKeybindingRule = {
	id: 'workbench.action.interactivePlayground.arrowDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.editorTextFocus.toNegated()),
	primary: KeyCode.DownArrow,
	handler: accessor => {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof WalkThroughPart) {
			activeEditorPane.arrowDown();
		}
	}
};

export const WalkThroughPageUp: ICommandAndKeybindingRule = {
	id: 'workbench.action.interactivePlayground.pageUp',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.editorTextFocus.toNegated()),
	primary: KeyCode.PageUp,
	handler: accessor => {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof WalkThroughPart) {
			activeEditorPane.pageUp();
		}
	}
};

export const WalkThroughPageDown: ICommandAndKeybindingRule = {
	id: 'workbench.action.interactivePlayground.pageDown',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.editorTextFocus.toNegated()),
	primary: KeyCode.PageDown,
	handler: accessor => {
		const editorService = accessor.get(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (activeEditorPane instanceof WalkThroughPart) {
			activeEditorPane.pageDown();
		}
	}
};
