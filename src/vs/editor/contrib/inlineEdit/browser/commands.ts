/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { inlineEditAcceptId, inlineEditJumpBackId, inlineEditJumpToId, inlineEditRejectId } from './commandIds.js';
import { InlineEditController } from './inlineEditController.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

export class AcceptInlineEdit extends EditorAction {
	constructor() {
		super({
			id: inlineEditAcceptId,
			label: 'Accept Inline Edit',
			alias: 'Accept Inline Edit',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext),
			kbOpts: [
				{
					weight: KeybindingWeight.EditorContrib + 1,
					primary: KeyCode.Tab,
					kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext, InlineEditController.cursorAtInlineEditContext)
				}],
			menuOpts: [{
				menuId: MenuId.InlineEditToolbar,
				title: 'Accept',
				group: 'primary',
				order: 1,
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		await controller?.accept();
	}
}

export class TriggerInlineEdit extends EditorAction {
	constructor() {
		const activeExpr = ContextKeyExpr.and(EditorContextKeys.writable, ContextKeyExpr.not(InlineEditController.inlineEditVisibleKey));
		super({
			id: 'editor.action.inlineEdit.trigger',
			label: 'Trigger Inline Edit',
			alias: 'Trigger Inline Edit',
			precondition: activeExpr,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Equal,
				kbExpr: activeExpr
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.trigger();
	}
}

export class JumpToInlineEdit extends EditorAction {
	constructor() {
		const activeExpr = ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext, ContextKeyExpr.not(InlineEditController.cursorAtInlineEditKey));

		super({
			id: inlineEditJumpToId,
			label: 'Jump to Inline Edit',
			alias: 'Jump to Inline Edit',
			precondition: activeExpr,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 1,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Equal,
				kbExpr: activeExpr
			},
			menuOpts: [{
				menuId: MenuId.InlineEditToolbar,
				title: 'Jump To Edit',
				group: 'primary',
				order: 3,
				when: activeExpr
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.jumpToCurrent();
	}
}

export class JumpBackInlineEdit extends EditorAction {
	constructor() {
		const activeExpr = ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.cursorAtInlineEditContext);

		super({
			id: inlineEditJumpBackId,
			label: 'Jump Back from Inline Edit',
			alias: 'Jump Back from Inline Edit',
			precondition: activeExpr,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib + 10,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Equal,
				kbExpr: activeExpr
			},
			menuOpts: [{
				menuId: MenuId.InlineEditToolbar,
				title: 'Jump Back',
				group: 'primary',
				order: 3,
				when: activeExpr
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		controller?.jumpBack();
	}
}

export class RejectInlineEdit extends EditorAction {
	constructor() {
		const activeExpr = ContextKeyExpr.and(EditorContextKeys.writable, InlineEditController.inlineEditVisibleContext);
		super({
			id: inlineEditRejectId,
			label: 'Reject Inline Edit',
			alias: 'Reject Inline Edit',
			precondition: activeExpr,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				kbExpr: activeExpr
			},
			menuOpts: [{
				menuId: MenuId.InlineEditToolbar,
				title: 'Reject',
				group: 'secondary',
				order: 2,
			}],
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditController.get(editor);
		await controller?.clear();
	}
}

