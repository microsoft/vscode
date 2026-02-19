/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorOverlay.css';
import { Disposable, DisposableMap, DisposableStore, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from './agentFeedbackEditorActions.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { getActiveResourceCandidates } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';

class AgentFeedbackActionViewItem extends ActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _keybindingService: IKeybindingService,
		private readonly _primaryActionIds: readonly string[] = [submitFeedbackActionId],
	) {
		const isIconOnly = action.id === navigatePreviousFeedbackActionId || action.id === navigateNextFeedbackActionId;
		super(undefined, action, { ...options, icon: isIconOnly, label: !isIconOnly, keybindingNotRenderedWithLabel: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this._primaryActionIds.includes(this._action.id)) {
			this.element?.classList.add('primary');
		}
	}

	protected override getTooltip(): string | undefined {
		const value = super.getTooltip();
		if (!value || this.options.keybinding) {
			return value;
		}
		return this._keybindingService.appendKeybinding(value, this._action.id);
	}
}

class AgentFeedbackOverlayWidget extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly _toolbarNode: HTMLElement;
	private readonly _showStore = this._store.add(new DisposableStore());
	private readonly _navigationBearings = observableValue<{ activeIdx: number; totalCount: number }>(this, { activeIdx: -1, totalCount: 0 });

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._domNode = document.createElement('div');
		this._domNode.classList.add('agent-feedback-editor-overlay-widget');

		this._toolbarNode = document.createElement('div');
		this._toolbarNode.classList.add('agent-feedback-editor-overlay-toolbar');
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	show(navigationBearings: { activeIdx: number; totalCount: number }): void {
		this._showStore.clear();
		this._navigationBearings.set(navigationBearings, undefined);

		if (!this._domNode.contains(this._toolbarNode)) {
			this._domNode.appendChild(this._toolbarNode);
		}

		this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, Menus.AgentFeedbackEditorContent, {
			telemetrySource: 'agentFeedback.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			menuOptions: { renderShortTitle: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === navigationBearingFakeActionId) {
					const that = this;
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('label-item');

							this._store.add(autorun(r => {
								assertType(this.label);
								const { activeIdx, totalCount } = that._navigationBearings.read(r);
								if (totalCount > 0) {
									const current = activeIdx === -1 ? 1 : activeIdx + 1;
									this.label.innerText = localize('nOfM', '{0}/{1}', current, totalCount);
								} else {
									this.label.innerText = localize('zero', '0/0');
								}
							}));
						}
					};
				}

				return new AgentFeedbackActionViewItem(action, options, this._keybindingService);
			},
		}));
		this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
	}

	hide(): void {
		this._showStore.clear();
		this._navigationBearings.set({ activeIdx: -1, totalCount: 0 }, undefined);
		this._toolbarNode.remove();
	}
}

class AgentFeedbackOverlayController {

	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IAgentFeedbackService agentFeedbackService: IAgentFeedbackService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode.classList.add('agent-feedback-editor-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = '24px';
		this._domNode.style.right = '24px';
		this._domNode.style.zIndex = '100';

		const widget = this._store.add(instaService.createInstance(AgentFeedbackOverlayWidget));
		this._domNode.appendChild(widget.getDomNode());
		this._store.add(toDisposable(() => this._domNode.remove()));

		const show = () => {
			if (!container.contains(this._domNode)) {
				container.appendChild(this._domNode);
			}
		};

		const hide = () => {
			if (container.contains(this._domNode)) {
				widget.hide();
				this._domNode.remove();
			}
		};

		const activeSignal = observableSignalFromEvent(this, Event.any(
			group.onDidActiveEditorChange,
			group.onDidModelChange,
			agentFeedbackService.onDidChangeFeedback,
			agentFeedbackService.onDidChangeNavigation,
		));

		this._store.add(autorun(r => {
			activeSignal.read(r);

			const candidates = getActiveResourceCandidates(group.activeEditorPane?.input);
			let shouldShow = false;
			let navigationBearings = { activeIdx: -1, totalCount: 0 };
			for (const candidate of candidates) {
				const sessionResource = agentFeedbackService.getMostRecentSessionForResource(candidate);
				if (sessionResource && agentFeedbackService.getFeedback(sessionResource).length > 0) {
					shouldShow = true;
					navigationBearings = agentFeedbackService.getNavigationBearing(sessionResource);
					break;
				}
			}

			if (!shouldShow) {
				hide();
				return;
			}

			widget.show(navigationBearings);
			show();
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}

export class AgentFeedbackEditorOverlay implements IWorkbenchContribution {

	static readonly ID = 'chat.agentFeedback.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups
		);

		const overlayWidgets = this._store.add(new DisposableMap<IEditorGroup>());

		this._store.add(autorun(r => {
			const groups = editorGroups.read(r);
			const toDelete = new Set(overlayWidgets.keys());

			for (const group of groups) {
				if (!(group instanceof EditorGroupView)) {
					continue;
				}

				toDelete.delete(group);

				if (!overlayWidgets.has(group)) {
					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

					const ctrl = scopedInstaService.createInstance(AgentFeedbackOverlayController, group.element, group);
					overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
				}
			}

			for (const group of toDelete) {
				overlayWidgets.deleteAndDispose(group);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}
