/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, reset } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupMenuIds, IEditorGroupView } from './editor.js';

export class EditorHeaderControl extends Disposable {

	static readonly HEIGHT = 29;

	private readonly headerContainer: HTMLElement;
	readonly breadcrumbsContainer: HTMLElement;
	private readonly primaryActionsContainer: HTMLElement;
	private readonly secondaryActionsContainer: HTMLElement;
	private readonly headerActions = this._register(new MutableDisposable());
	private breadcrumbsVisible = false;
	private visible = false;

	get height(): number { return this.visible ? EditorHeaderControl.HEIGHT : 0; }

	constructor(
		parent: HTMLElement,
		private readonly groupView: IEditorGroupView,
		private readonly menuIds: IEditorGroupMenuIds | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.headerContainer = append(parent, $('.editor-group-header'));
		const headerContentContainer = append(this.headerContainer, $('.editor-group-header-content.editor-group-header-toolbars'));
		const primaryContainer = append(headerContentContainer, $('.editor-group-header-primary.breadcrumbs-in-header'));
		const secondaryContainer = append(headerContentContainer, $('.editor-group-header-secondary'));
		this.breadcrumbsContainer = primaryContainer;
		this.primaryActionsContainer = append(primaryContainer, $('.editor-group-header-primary-actions.has-no-actions'));
		this.secondaryActionsContainer = append(secondaryContainer, $('.editor-group-header-secondary-actions.has-no-actions'));
		this._register(toDisposable(() => this.headerContainer.remove()));
		this._register(this.groupView.onDidActiveEditorChange(() => this.renderActions(true)));
		this.renderActions(false);
	}

	updateBreadcrumbsVisibility(container: HTMLElement, visible: boolean, relayout: boolean): void {
		this.breadcrumbsVisible = visible;
		container.classList.toggle('hidden', !visible);
		this.updateVisibility(relayout);
	}

	private updateVisibility(relayout: boolean): void {
		const hasMenuActions = !this.primaryActionsContainer.classList.contains('has-no-actions')
			|| !this.secondaryActionsContainer.classList.contains('has-no-actions');
		this.visible = this.breadcrumbsVisible || hasMenuActions;
		this.headerContainer.style.display = this.visible ? '' : 'none';
		if (relayout) {
			this.groupView.relayout();
		}
	}

	private renderActions(relayout: boolean): void {
		this.headerActions.clear();
		reset(this.primaryActionsContainer);
		reset(this.secondaryActionsContainer);
		this.primaryActionsContainer.classList.add('has-no-actions');
		this.secondaryActionsContainer.classList.add('has-no-actions');

		const headerPrimaryMenuId = this.menuIds?.headerPrimary;
		const headerSecondaryMenuId = this.menuIds?.headerSecondary;
		if (!headerPrimaryMenuId && !headerSecondaryMenuId) {
			this.updateVisibility(relayout);
			return;
		}

		const store = new DisposableStore();
		const scopedInstantiationService = this.groupView.activeEditorPane?.scopedInstantiationService ?? this.instantiationService;
		const toolbarOptions = {
			menuOptions: { shouldForwardArgs: true },
			highlightToggledItems: true,
			toolbarOptions: { primaryGroup: (group: string) => group !== 'secondary', useSeparatorsInPrimaryActions: true }
		};
		if (headerPrimaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.primaryActionsContainer, headerPrimaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		if (headerSecondaryMenuId) {
			const toolbar = store.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryActionsContainer, headerSecondaryMenuId, toolbarOptions));
			store.add(toolbar.onDidChangeMenuItems(() => this.updateVisibility(true)));
		}
		this.headerActions.value = store;
		this.updateVisibility(relayout);
	}
}
