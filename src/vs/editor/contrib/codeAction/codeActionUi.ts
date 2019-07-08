/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeAction } from 'vs/editor/common/modes';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CodeActionsState } from './codeActionModel';
import { CodeActionAutoApply } from './codeActionTrigger';
import { CodeActionWidget } from './codeActionWidget';
import { LightBulbWidget } from './lightBulbWidget';


export class CodeActionUi extends Disposable {

	private readonly _codeActionWidget: CodeActionWidget;
	private readonly _lightBulbWidget: LightBulbWidget;

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
				this.delegate.applyCodeAction(action, /* retrigger */true);
			}
		}));
		this._lightBulbWidget = this._register(new LightBulbWidget(this._editor, quickFixActionId, keybindingService));

		this._register(this._lightBulbWidget.onClick(this._handleLightBulbSelect, this));
	}

	public update(newState: CodeActionsState.State): void {
		if (newState.type === CodeActionsState.Type.Triggered) {
			newState.actions.then(actions => {
				if (!actions.actions.length && newState.trigger.context) {
					MessageController.get(this._editor).showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
					actions.dispose();
				}
			});

			if (newState.trigger.type === 'manual') {
				if (newState.trigger.filter && newState.trigger.filter.kind) {
					// Triggered for specific scope
					newState.actions.then(async codeActions => {
						if (codeActions.actions.length > 0) {
							// Apply if we only have one action or requested autoApply
							if (newState.trigger.autoApply === CodeActionAutoApply.First || (newState.trigger.autoApply === CodeActionAutoApply.IfSingle && codeActions.actions.length === 1)) {
								try {
									await this.delegate.applyCodeAction(codeActions.actions[0], false);
								} finally {
									codeActions.dispose();
								}
								return;
							}
						}
						this._codeActionWidget.show(newState.actions, newState.position);
					}).catch(onUnexpectedError);
				} else {
					this._codeActionWidget.show(newState.actions, newState.position);
				}
			} else {
				// auto magically triggered
				// * update an existing list of code actions
				// * manage light bulb
				if (this._codeActionWidget.isVisible) {
					this._codeActionWidget.show(newState.actions, newState.position);
				} else {
					this._lightBulbWidget.tryShow(newState);
				}
			}
		} else {
			this._lightBulbWidget.hide();
		}
	}

	private _handleLightBulbSelect(e: { x: number, y: number, state: CodeActionsState.Triggered }): void {
		this._codeActionWidget.show(e.state.actions, e);
	}
}
