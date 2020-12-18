/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IOutline, IOutlineCreator, IOutlineService } from 'vs/workbench/services/outline/common/outline';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorPane } from 'vs/workbench/common/editor';

class OutlineEntry {
	constructor(
		readonly cell: ICellViewModel,
		readonly label: string,
		readonly icon: ThemeIcon
	) { }
}

class NotebookOutline implements IOutline<OutlineEntry> {

	private readonly _dispoables = new DisposableStore();

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private readonly _onDidChangeActiveEntry = new Emitter<this>();
	readonly onDidChangeActiveEntry: Event<this> = this._onDidChangeActiveEntry.event;

	private _activeEntry?: OutlineEntry;
	private _entries: OutlineEntry[] = [];

	constructor(
		private readonly _editor: NotebookEditor
	) {
		this._dispoables.add(_editor.onDidChangeModel(() => {
			this._computeEntries();
			this._computeActive();
		}));
		this._computeEntries();
		this._computeActive();
	}

	dispose(): void {
		this._dispoables.dispose();
	}

	private _computeEntries(): void {
		this._entries.length = 0;

		const { viewModel } = this._editor;
		if (!viewModel) {
			return;
		}
		for (const cell of viewModel.viewCells) {
			const content = cell.getText();
			const regexp = cell.cellKind === CellKind.Markdown
				? /^[ \t]*(\#+)(.+)$/gm // md: header
				: /^.*\w+.*\w*$/m;		// code: none empty line

			const matches = content.match(regexp);
			if (matches && matches.length) {
				for (let j = 0; j < matches.length; j++) {
					this._entries.push(new OutlineEntry(
						cell,
						matches[j].replace(/^[ \t]*(\#+)/, ''),
						cell.cellKind === CellKind.Markdown ? Codicon.markdown : Codicon.code
					));
				}
			}
		}
		this._onDidChange.fire(this);
	}

	private _computeActive(): void {
		let newActive: OutlineEntry | undefined;
		if (this._editor.viewModel) {
			const [first] = this._editor.viewModel.selectionHandles;
			newActive = typeof first === 'number'
				? this._entries.find(candidate => candidate.cell.handle === first)
				: undefined;
		}
		if (this._activeEntry !== newActive) {
			this._activeEntry = newActive;
			this._onDidChangeActiveEntry.fire(this);
		}
	}

	get activeEntry(): OutlineEntry | undefined {
		return this._activeEntry;
	}

	revealInEditor(entry: OutlineEntry): void | Promise<void> {
		const widget = this._editor.getControl();
		if (widget) {
			widget.revealInCenterIfOutsideViewport(entry.cell);
			widget.selectElement(entry.cell);
		}
	}

	getParent(_entry: OutlineEntry): OutlineEntry | undefined {
		return undefined;
	}
}

class NotebookOutlineCreator implements IOutlineCreator<NotebookEditor, OutlineEntry> {

	readonly dispose: () => void;

	constructor(@IOutlineService outlineService: IOutlineService) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is NotebookEditor {
		return candidate.getId() === NotebookEditor.ID;
	}

	async createOutline(editor: NotebookEditor): Promise<IOutline<OutlineEntry> | undefined> {
		return new NotebookOutline(editor);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);
