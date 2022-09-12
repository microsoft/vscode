/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeActionTriggerType } from 'vs/editor/common/languages';
import { CodeActionItem, CodeActionSet } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CodeActionMenu, CodeActionShowOptions } from './codeActionMenu';
import { CodeActionsState } from './codeActionModel';
import { LightBulbWidget } from './lightBulbWidget';
import { CodeActionAutoApply, CodeActionTrigger } from './types';

export class CodeActionUi extends Disposable {

	private readonly _codeActionWidget: Lazy<CodeActionMenu>;
	private readonly _lightBulbWidget: Lazy<LightBulbWidget>;
	private readonly _activeCodeActions = this._register(new MutableDisposable<CodeActionSet>());
	private previewOn: boolean = false;

	#disposed = false;

	constructor(
		private readonly _editor: ICodeEditor,
		quickFixActionId: string,
		preferredFixActionId: string,
		private readonly delegate: {
			applyCodeAction: (action: CodeActionItem, regtriggerAfterApply: boolean, preview: boolean) => Promise<void>;
		},
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._codeActionWidget = new Lazy(() => {
			return this._register(instantiationService.createInstance(CodeActionMenu, this._editor, {
				onSelectCodeAction: async (action, trigger) => {
					if (this.previewOn) {
						this.delegate.applyCodeAction(action, /* retrigger */ true, Boolean(this.previewOn));
					} else {
						this.delegate.applyCodeAction(action, /* retrigger */ true, Boolean(trigger.preview));
					}
					this.previewOn = false;
				}
			}));
		});

		this._lightBulbWidget = new Lazy(() => {
			const widget = this._register(instantiationService.createInstance(LightBulbWidget, this._editor, quickFixActionId, preferredFixActionId));
			this._register(widget.onClick(e => this.showCodeActionList(e.trigger, e.actions, e, { includeDisabledActions: false, fromLightbulb: true })));
			return widget;
		});
	}

	override dispose() {
		this.#disposed = true;
		super.dispose();
	}

	public hideCodeActionWidget() {
		this._codeActionWidget.rawValue?.hideCodeActionWidget();
	}

	public onEnter() {
		this._codeActionWidget.rawValue?.onEnterSet();
	}

	public onPreviewEnter() {
		this.previewOn = true;
		this.onEnter();
	}

	public navigateList(navUp: Boolean) {
		if (navUp) {
			this._codeActionWidget.rawValue?.focusPrevious();
		} else {
			this._codeActionWidget.rawValue?.focusNext();
		}
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

		if (this.#disposed) {
			return;
		}

		this._lightBulbWidget.getValue().update(actions, newState.trigger, newState.position);

		if (newState.trigger.type === CodeActionTriggerType.Invoke) {
			if (newState.trigger.filter?.include) { // Triggered for specific scope
				// Check to see if we want to auto apply.

				const validActionToApply = this.tryGetValidActionToApply(newState.trigger, actions);
				if (validActionToApply) {
					try {
						this._lightBulbWidget.getValue().hide();
						await this.delegate.applyCodeAction(validActionToApply, false, false);
					} finally {
						actions.dispose();
					}
					return;
				}

				// Check to see if there is an action that we would have applied were it not invalid
				if (newState.trigger.context) {
					const invalidAction = this.getInvalidActionThatWouldHaveBeenApplied(newState.trigger, actions);
					if (invalidAction && invalidAction.action.disabled) {
						MessageController.get(this._editor)?.showMessage(invalidAction.action.disabled, newState.trigger.context.position);
						actions.dispose();
						return;
					}
				}
			}

			const includeDisabledActions = !!newState.trigger.filter?.include;
			if (newState.trigger.context) {
				if (!actions.allActions.length || !includeDisabledActions && !actions.validActions.length) {
					MessageController.get(this._editor)?.showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
					this._activeCodeActions.value = actions;
					actions.dispose();
					return;
				}
			}

			this._activeCodeActions.value = actions;
			this._codeActionWidget.getValue().show(newState.trigger, actions, this.toCoords(newState.position), { includeDisabledActions, fromLightbulb: false });
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

	private getInvalidActionThatWouldHaveBeenApplied(trigger: CodeActionTrigger, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.allActions.length) {
			return undefined;
		}

		if ((trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length === 0)
			|| (trigger.autoApply === CodeActionAutoApply.IfSingle && actions.allActions.length === 1)
		) {
			return actions.allActions.find(({ action }) => action.disabled);
		}

		return undefined;
	}

	private tryGetValidActionToApply(trigger: CodeActionTrigger, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.validActions.length) {
			return undefined;
		}

		if ((trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length > 0)
			|| (trigger.autoApply === CodeActionAutoApply.IfSingle && actions.validActions.length === 1)
		) {
			return actions.validActions[0];
		}

		return undefined;
	}

	public async showCodeActionList(trigger: CodeActionTrigger, actions: CodeActionSet, at: IAnchor | IPosition, options: CodeActionShowOptions): Promise<void> {
		const anchor = Position.isIPosition(at) ? this.toCoords(at) : at;
		this._codeActionWidget.getValue().show(trigger, actions, anchor, options);
	}

	private toCoords(position: IPosition): IAnchor {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}

		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
	}
}
