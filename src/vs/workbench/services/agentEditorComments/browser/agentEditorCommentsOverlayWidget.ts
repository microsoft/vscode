/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentEditorCommentsOverlayWidget.css';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IEditorGroup } from '../../editor/common/editorGroupsService.js';

export interface IAgentEditorCommentsOverlayOptions {
	readonly menuId: MenuId;
	readonly submitActionId: string;
	readonly previousActionId: string;
	readonly nextActionId: string;
	readonly navigationBearingActionId: string;
	readonly telemetrySource: string;
}

class SubmitCommentsActionRunner extends ActionRunner {

	constructor(
		private readonly _submitActionId: string,
		private readonly _editorGroup: IEditorGroup,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		const editorToClose = action.id === this._submitActionId ? this._editorGroup.activeEditor : undefined;
		const didSubmit = await action.run(context);
		if (didSubmit === true && editorToClose) {
			await this._editorGroup.closeEditor(editorToClose);
		}
	}
}

class CommentsActionViewItem extends ActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _overlayOptions: IAgentEditorCommentsOverlayOptions,
		private readonly _keybindingService: IKeybindingService,
		private readonly _commentCount: IObservable<number>,
		editorGroup?: IEditorGroup,
	) {
		const isIconOnly = action.id === _overlayOptions.previousActionId || action.id === _overlayOptions.nextActionId;
		super(undefined, action, { ...options, icon: isIconOnly, label: !isIconOnly, keybindingNotRenderedWithLabel: true });
		if (action.id === _overlayOptions.submitActionId && editorGroup) {
			this.actionRunner = this._register(new SubmitCommentsActionRunner(_overlayOptions.submitActionId, editorGroup));
		}
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this._action.id === this._overlayOptions.submitActionId) {
			this.element?.classList.add('primary');
			this._store.add(autorun(reader => {
				this._commentCount.read(reader);
				this.updateLabel();
				this.updateTooltip();
			}));
		}
	}

	protected override updateLabel(): void {
		if (this._action.id === this._overlayOptions.submitActionId && this.label) {
			this.label.textContent = localize('agentEditorComments.submitCountShort', 'Submit {0}', this._commentCount.get());
			return;
		}
		super.updateLabel();
	}

	protected override getTooltip(): string | undefined {
		const value = this._action.id === this._overlayOptions.submitActionId
			? localize('agentEditorComments.submitCount', 'Submit Feedback ({0})', this._commentCount.get())
			: super.getTooltip();
		return value && !this.options.keybinding ? this._keybindingService.appendKeybinding(value, this._action.id) : value;
	}
}

export class AgentEditorCommentsOverlayWidget extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _toolbarNode: HTMLElement;
	private readonly _showStore = this._register(new DisposableStore());
	private readonly _navigationBearings = observableValue<{ activeIdx: number; totalCount: number }>(this, { activeIdx: -1, totalCount: 0 });
	private readonly _commentCount = observableValue(this, 0);

	constructor(
		private readonly _options: IAgentEditorCommentsOverlayOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.classList.add('agent-editor-comments-overlay-widget');
		this._toolbarNode = document.createElement('div');
		this._toolbarNode.classList.add('agent-editor-comments-overlay-toolbar');
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	show(navigationBearings: { activeIdx: number; totalCount: number }, commentCount: number, editorGroup?: IEditorGroup): void {
		this._showStore.clear();
		this._navigationBearings.set(navigationBearings, undefined);
		this._commentCount.set(commentCount, undefined);
		if (!this._domNode.contains(this._toolbarNode)) {
			this._domNode.appendChild(this._toolbarNode);
		}
		const toolbar = this._showStore.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, this._options.menuId, {
			telemetrySource: this._options.telemetrySource,
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true,
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === this._options.navigationBearingActionId) {
					const that = this;
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('label-item');
							this._store.add(autorun(reader => {
								if (this.label) {
									const { activeIdx, totalCount } = that._navigationBearings.read(reader);
									this.label.innerText = totalCount > 0
										? localize('agentEditorComments.nOfM', '{0}/{1}', activeIdx === -1 ? 1 : activeIdx + 1, totalCount)
										: localize('agentEditorComments.zero', '0/0');
								}
							}));
						}
					};
				}
				return new CommentsActionViewItem(action, options, this._options, this._keybindingService, this._commentCount, editorGroup);
			},
		}));
		if (editorGroup) {
			const activeEditor = editorGroup.activeEditor;
			toolbar.context = {
				groupId: editorGroup.id,
				editorIndex: activeEditor ? editorGroup.getIndexOfEditor(activeEditor) : undefined,
			};
		}
		this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
	}

	hide(): void {
		this._showStore.clear();
		this._navigationBearings.set({ activeIdx: -1, totalCount: 0 }, undefined);
		this._commentCount.set(0, undefined);
		this._toolbarNode.remove();
	}
}
