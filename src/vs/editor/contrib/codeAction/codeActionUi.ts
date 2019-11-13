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
import { CodeActionAutoApply } from './types';
import { CodeActionWidget } from './codeActionWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { IPosition } from 'vs/editor/common/core/position';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Lazy } from 'vs/base/common/lazy';

export class CodeActionUi extends Disposable {

	private readonly _codeActionWidget: Lazy<CodeActionWidget>;
	private readonly _lightBulbWidget: Lazy<LightBulbWidget>;
	private readonly _activeCodeActions = this._register(new MutableDisposable<CodeActionSet>());

	constructor(
		private readonly _editor: ICodeEditor,
		quickFixActionId: string,
		preferredFixActionId: string,
		private readonly delegate: {
			applyCodeAction: (action: CodeAction, regtriggerAfterApply: boolean) => Promise<void>
		},
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		this._codeActionWidget = new Lazy(() => {
			return this._register(new CodeActionWidget(this._editor, contextMenuService, keybindingService, {
				onSelectCodeAction: async (action) => {
					this.delegate.applyCodeAction(action, /* retrigger */ true);
				}
			}));
		});

		this._lightBulbWidget = new Lazy(() => {
			const widget = this._register(new LightBulbWidget(this._editor, quickFixActionId, preferredFixActionId, keybindingService));
			this._register(widget.onClick(e => this.showCodeActionList(e.actions, e)));
			return widget;
		});
	}

	public async update(newState: CodeActionsState.State): Promise<void> {
		if (newState.type !== CodeActionsState.Type.Triggered) {
			this._lightBulbWidget.rawValue?.hide();
			return;
		}

		let actions: CodeActionSet;
		try {
			actions = await newState.actions;
		} catch (e) {
			onUnexpectedError(e);
			return;
		}

		this._lightBulbWidget.getValue().update(actions, newState.position);

		if (!actions.actions.length && newState.trigger.context) {
			MessageController.get(this._editor).showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
			this._activeCodeActions.value = actions;
			return;
		}

		if (newState.trigger.type === 'manual') {
			if (newState.trigger.filter && newState.trigger.filter.include) {
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
			this._codeActionWidget.getValue().show(actions, newState.position);
		} else {
			// auto magically triggered
			if (this._codeActionWidget.getValue().isVisible) {
				// TODO: Figure out if we should update the showing menu?
				actions.dispose();
			} else {
				this._activeCodeActions.value = actions;
			}
		}
	}

	public async showCodeActionList(actions: CodeActionSet, at: IAnchor | IPosition): Promise<void> {
		this._codeActionWidget.getValue().show(actions, at);
	}
}
