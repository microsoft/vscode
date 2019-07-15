/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeAction } from 'vs/editor/common/modes';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/codeAction';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CodeActionsState } from './codeActionModel';
import { CodeActionAutoApply } from './codeActionTrigger';
import { CodeActionWidget } from './codeActionWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { IPosition } from 'vs/editor/common/core/position';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';

export class CodeActionUi extends Disposable {

	private readonly _codeActionWidget: CodeActionWidget;
	private readonly _lightBulbWidget: LightBulbWidget;
	private readonly _activeCodeActions = this._register(new MutableDisposable<CodeActionSet>());

	constructor(
		private readonly _editor: ICodeEditor,
		quickFixActionId: string,
		private readonly delegate: {
			applyCodeAction: (action: CodeAction, regtriggerAfterApply: boolean) => void
		},
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		this._codeActionWidget = this._register(new CodeActionWidget(this._editor, contextMenuService, {
			onSelectCodeAction: async (action) => {
				this.delegate.applyCodeAction(action, /* retrigger */ true);
			}
		}));
		this._lightBulbWidget = this._register(new LightBulbWidget(this._editor, quickFixActionId, keybindingService));

		this._register(this._lightBulbWidget.onClick(this._handleLightBulbSelect, this));
	}

	public async update(newState: CodeActionsState.State): Promise<void> {
		if (newState.type !== CodeActionsState.Type.Triggered) {
			this._lightBulbWidget.hide();
			return;
		}

		let actions: CodeActionSet;
		try {
			actions = await newState.actions;
		} catch (e) {
			onUnexpectedError(e);
			return;
		}

		this._lightBulbWidget.update(actions, newState.position);

		if (!actions.actions.length && newState.trigger.context) {
			MessageController.get(this._editor).showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
			this._activeCodeActions.value = actions;
			return;
		}

		if (newState.trigger.type === 'manual') {
			if (newState.trigger.filter && newState.trigger.filter.kind) {
				// Triggered for specific scope
				if (actions.actions.length > 0) {
					// Apply if we only have one action or requested autoApply
					if (newState.trigger.autoApply === CodeActionAutoApply.First || (newState.trigger.autoApply === CodeActionAutoApply.IfSingle && actions.actions.length === 1)) {
						try {
							await this.delegate.applyCodeAction(actions.actions[0], false);
						} finally {
							actions.dispose();
						}
						return;
					}
				}
			}
			this._activeCodeActions.value = actions;
			this._codeActionWidget.show(actions, newState.position);
		} else {
			// auto magically triggered
			if (this._codeActionWidget.isVisible) {
				// TODO: Figure out if we should update the showing menu?
				actions.dispose();
			} else {
				this._activeCodeActions.value = actions;
			}
		}
	}

	public async showCodeActionList(actions: CodeActionSet, at?: IAnchor | IPosition): Promise<void> {
		this._codeActionWidget.show(actions, at);
	}

	private _handleLightBulbSelect(e: { x: number, y: number, actions: CodeActionSet }): void {
		this._codeActionWidget.show(e.actions, e);
	}
}
