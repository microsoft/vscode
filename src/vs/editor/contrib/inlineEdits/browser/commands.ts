/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { transaction } from 'vs/base/common/observable';
import { asyncTransaction } from 'vs/base/common/observableInternal/base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { inlineEditCommitId, inlineEditVisible, isPinnedContextKey, showNextInlineEditActionId, showPreviousInlineEditActionId } from 'vs/editor/contrib/inlineEdits/browser/consts';
import { InlineEditsController } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsController';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ShowNextInlineEditAction extends EditorAction {
	public static ID = showNextInlineEditActionId;
	constructor() {
		super({
			id: ShowNextInlineEditAction.ID,
			label: nls.localize('action.inlineEdits.showNext', "Show Next Inline Edit"),
			alias: 'Show Next Inline Edit',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, inlineEditVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketRight,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		controller?.model.get()?.next();
	}
}

export class ShowPreviousInlineEditAction extends EditorAction {
	public static ID = showPreviousInlineEditActionId;
	constructor() {
		super({
			id: ShowPreviousInlineEditAction.ID,
			label: nls.localize('action.inlineEdits.showPrevious', "Show Previous Inline Edit"),
			alias: 'Show Previous Inline Edit',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, inlineEditVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketLeft,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		controller?.model.get()?.previous();
	}
}

export class TriggerInlineEditAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdits.trigger',
			label: nls.localize('action.inlineEdits.trigger', "Trigger Inline Edit"),
			alias: 'Trigger Inline Edit',
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		await asyncTransaction(async tx => {
			/** @description triggerExplicitly from command */
			await controller?.model.get()?.triggerExplicitly(tx);
		});
	}
}

export class AcceptInlineEdit extends EditorAction {
	constructor() {
		super({
			id: inlineEditCommitId,
			label: nls.localize('action.inlineEdits.accept', "Accept Inline Edit"),
			alias: 'Accept Inline Edit',
			precondition: inlineEditVisible,
			menuOpts: {
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('inlineEditsActions', "Accept Inline Edit"),
				group: 'primary',
				order: 1,
				icon: Codicon.check,
			},
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.Space,
				weight: 20000,
				kbExpr: inlineEditVisible,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		if (controller) {
			controller.model.get()?.accept(controller.editor);
			controller.editor.focus();
		}
	}
}

export class PinInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdits.pin',
			label: nls.localize('action.inlineEdits.pin', "Pin Inline Edit"),
			alias: 'Pin Inline Edit',
			precondition: inlineEditVisible,
			kbOpts: {
				primary: KeyMod.Shift | KeyCode.Space,
				weight: 20000,
				kbExpr: inlineEditVisible,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		if (controller) {
			controller.model.get()?.togglePin();
		}
	}
}

MenuRegistry.appendMenuItem(MenuId.InlineEditsActions, {
	command: {
		id: 'editor.action.inlineEdits.pin',
		title: nls.localize('Pin', "Pin"),
		icon: Codicon.pin,
	},
	group: 'primary',
	order: 1,
	when: isPinnedContextKey.negate(),
});

MenuRegistry.appendMenuItem(MenuId.InlineEditsActions, {
	command: {
		id: 'editor.action.inlineEdits.unpin',
		title: nls.localize('Unpin', "Unpin"),
		icon: Codicon.pinned,
	},
	group: 'primary',
	order: 1,
	when: isPinnedContextKey,
});

export class HideInlineEdit extends EditorAction {
	public static ID = 'editor.action.inlineEdits.hide';

	constructor() {
		super({
			id: HideInlineEdit.ID,
			label: nls.localize('action.inlineEdits.hide', "Hide Inline Edit"),
			alias: 'Hide Inline Edit',
			precondition: inlineEditVisible,
			kbOpts: {
				weight: 100,
				primary: KeyCode.Escape,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		transaction(tx => {
			controller?.model.get()?.stop(tx);
		});
	}
}
