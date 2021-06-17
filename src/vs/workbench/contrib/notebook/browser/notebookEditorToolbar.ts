/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction, Separator } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IMenu, IMenuService, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { toolbarActiveBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { SELECT_KERNEL_ID } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { INotebookEditor, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebooKernelActionViewItem } from 'vs/workbench/contrib/notebook/browser/notebookKernelActionViewItem';
import { ActionViewWithLabel } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellActionView';
import { GlobalToolbar } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';

export class NotebookEditorToolbar extends Disposable {
	// private _editorToolbarContainer!: HTMLElement;
	private _leftToolbarScrollable!: DomScrollableElement;
	private _notebookTopLeftToolbarContainer!: HTMLElement;
	private _notebookTopRightToolbarContainer!: HTMLElement;
	private _notebookGlobalActionsMenu!: IMenu;
	private _notebookLeftToolbar!: ToolBar;
	private _notebookRightToolbar!: ToolBar;
	private _useGlobalToolbar: boolean = false;

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	onDidChangeState: Event<void> = this._onDidChangeState.event;

	get useGlobalToolbar(): boolean {
		return this._useGlobalToolbar;
	}

	private _pendingLayout: IDisposable | undefined;

	constructor(
		readonly notebookEditor: INotebookEditor,
		readonly contextKeyService: IContextKeyService,
		readonly domNode: HTMLElement,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IMenuService readonly menuService: IMenuService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@optional(ITASExperimentService) private readonly experimentService: ITASExperimentService
	) {
		super();

		this._buildBody();

		this._register(this.editorService.onDidActiveEditorChange(() => {
			if (this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
				const notebookEditor = this.editorService.activeEditorPane.getControl() as INotebookEditor;
				if (notebookEditor === this.notebookEditor) {
					// this is the active editor
					this._showNotebookActionsinEditorToolbar();
					return;
				}
			}
		}));

		this._reigsterNotebookActionsToolbar();
	}

	private _buildBody() {
		this._notebookTopLeftToolbarContainer = document.createElement('div');
		this._notebookTopLeftToolbarContainer.classList.add('notebook-toolbar-left');
		this._leftToolbarScrollable = new DomScrollableElement(this._notebookTopLeftToolbarContainer, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			horizontalScrollbarSize: 3,
			useShadows: false,
			scrollYToX: true
		});
		this._register(this._leftToolbarScrollable);

		DOM.append(this.domNode, this._leftToolbarScrollable.getDomNode());
		this._notebookTopRightToolbarContainer = document.createElement('div');
		this._notebookTopRightToolbarContainer.classList.add('notebook-toolbar-right');
		DOM.append(this.domNode, this._notebookTopRightToolbarContainer);
	}

	private _reigsterNotebookActionsToolbar() {
		this._notebookGlobalActionsMenu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.notebookToolbar, this.contextKeyService));
		this._register(this._notebookGlobalActionsMenu);

		this._useGlobalToolbar = this.configurationService.getValue<boolean | undefined>(GlobalToolbar) ?? false;
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(GlobalToolbar)) {
				this._useGlobalToolbar = this.configurationService.getValue<boolean>(GlobalToolbar);
				this._showNotebookActionsinEditorToolbar();
			}
		}));

		const context = {
			ui: true,
			notebookEditor: this.notebookEditor
		};

		const actionProvider = (action: IAction) => {
			if (action.id === SELECT_KERNEL_ID) {
				// 	// this is being disposed by the consumer
				return this.instantiationService.createInstance(NotebooKernelActionViewItem, action, this.notebookEditor);
			}

			return action instanceof MenuItemAction ? this.instantiationService.createInstance(ActionViewWithLabel, action) : undefined;
		};

		this._notebookLeftToolbar = new ToolBar(this._notebookTopLeftToolbarContainer, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: actionProvider,
			renderDropdownAsChildElement: true
		});
		this._register(this._notebookLeftToolbar);
		this._notebookLeftToolbar.context = context;

		this._notebookRightToolbar = new ToolBar(this._notebookTopRightToolbarContainer, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			actionViewItemProvider: actionProvider,
			renderDropdownAsChildElement: true
		});
		this._register(this._notebookRightToolbar);
		this._notebookRightToolbar.context = context;

		this._showNotebookActionsinEditorToolbar();
		this._register(this._notebookGlobalActionsMenu.onDidChange(() => {
			this._showNotebookActionsinEditorToolbar();
		}));

		if (this.experimentService) {
			this.experimentService.getTreatment<boolean>('nbtoolbarineditor').then(treatment => {
				if (treatment === undefined) {
					return;
				}
				if (this._useGlobalToolbar !== treatment) {
					this._useGlobalToolbar = treatment;
					this._showNotebookActionsinEditorToolbar();
				}
			});
		}
	}

	private _showNotebookActionsinEditorToolbar() {
		// when there is no view model, just ignore.
		if (!this.notebookEditor.hasModel()) {
			return;
		}

		if (!this._useGlobalToolbar) {
			this.domNode.style.display = 'none';
		} else {
			this._notebookLeftToolbar.setActions([], []);
			const groups = this._notebookGlobalActionsMenu.getActions({ shouldForwardArgs: true, renderShortTitle: true });
			this.domNode.style.display = 'flex';
			const primaryLeftGroups = groups.filter(group => /^navigation/.test(group[0]));
			let primaryActions: IAction[] = [];
			primaryLeftGroups.sort((a, b) => {
				if (a[0] === 'navigation') {
					return 1;
				}

				if (b[0] === 'navigation') {
					return -1;
				}

				return 0;
			}).forEach((group, index) => {
				primaryActions.push(...group[1]);
				if (index < primaryLeftGroups.length - 1) {
					primaryActions.push(new Separator());
				}
			});
			const primaryRightGroup = groups.find(group => /^status/.test(group[0]));
			const primaryRightActions = primaryRightGroup ? primaryRightGroup[1] : [];
			const secondaryActions = groups.filter(group => !/^navigation/.test(group[0]) && !/^status/.test(group[0])).reduce((prev: (MenuItemAction | SubmenuItemAction)[], curr) => { prev.push(...curr[1]); return prev; }, []);

			this._notebookLeftToolbar.setActions(primaryActions, secondaryActions);
			this._notebookRightToolbar.setActions(primaryRightActions, []);
			this._updateScrollbar();
		}

		this._onDidChangeState.fire();
	}

	layout() {
		this._updateScrollbar();
	}

	private _updateScrollbar() {
		this._pendingLayout?.dispose();

		this._pendingLayout = DOM.measure(() => {
			DOM.measure(() => { // double RAF
				this._leftToolbarScrollable.setRevealOnScroll(false);
				this._leftToolbarScrollable.scanDomNode();
				this._leftToolbarScrollable.setRevealOnScroll(true);
			});
		});
	}

	override dispose() {
		this._pendingLayout?.dispose();
		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const toolbarActiveBackgroundColor = theme.getColor(toolbarActiveBackground);
	if (toolbarActiveBackgroundColor) {
		collector.addRule(`
		.monaco-workbench .notebookOverlay .notebook-toolbar-container .monaco-action-bar:not(.vertical) .action-item.active {
			background-color: ${toolbarActiveBackgroundColor};
		}
		`);
	}
});
