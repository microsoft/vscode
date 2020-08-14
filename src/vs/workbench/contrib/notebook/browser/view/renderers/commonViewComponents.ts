/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { renderCodicons } from 'vs/base/common/codicons';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICellViewModel, INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ChangeCellLanguageAction } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const $ = DOM.$;

export class CodiconActionViewItem extends MenuEntryActionViewItem {
	constructor(
		readonly _action: MenuItemAction,
		keybindingService: IKeybindingService,
		notificationService: INotificationService,
		contextMenuService: IContextMenuService
	) {
		super(_action, keybindingService, notificationService, contextMenuService);
	}
	updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.innerHTML = renderCodicons(this._commandAction.label ?? '');
		}
	}
}


export class CellLanguageStatusBarItem extends Disposable {
	private readonly labelElement: HTMLElement;

	private cell: ICellViewModel | undefined;
	private editor: INotebookEditor | undefined;

	private cellDisposables: DisposableStore;

	constructor(
		readonly container: HTMLElement,
		@IModeService private readonly modeService: IModeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.labelElement = DOM.append(container, $('.cell-language-picker'));
		this.labelElement.tabIndex = 0;

		this._register(DOM.addDisposableListener(this.labelElement, DOM.EventType.CLICK, () => {
			this.instantiationService.invokeFunction(accessor => {
				new ChangeCellLanguageAction().run(accessor, { notebookEditor: this.editor!, cell: this.cell! });
			});
		}));
		this._register(this.cellDisposables = new DisposableStore());
	}

	update(cell: ICellViewModel, editor: INotebookEditor): void {
		this.cellDisposables.clear();
		this.cell = cell;
		this.editor = editor;

		this.render();
		this.cellDisposables.add(this.cell.model.onDidChangeLanguage(() => this.render()));
	}

	private render(): void {
		const modeId = this.cell?.cellKind === CellKind.Markdown ? 'markdown' : this.modeService.getModeIdForLanguageName(this.cell!.language) || this.cell!.language;
		this.labelElement.textContent = this.modeService.getLanguageName(modeId) || this.modeService.getLanguageName('plaintext');
		this.labelElement.title = localize('notebook.cell.status.language', "Select Cell Language Mode");
	}
}
