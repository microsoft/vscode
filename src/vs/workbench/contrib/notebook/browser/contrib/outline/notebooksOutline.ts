/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, IDisposable, Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IOutline, IOutlineCreator, IOutlineService, OutlineTreeConfiguration } from 'vs/workbench/services/outline/browser/outline';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorPane } from 'vs/workbench/common/editor';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Iterable } from 'vs/base/common/iterator';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class OutlineEntry {
	constructor(
		readonly cell: ICellViewModel,
		readonly label: string,
		readonly icon: ThemeIcon
	) { }
}

class NotebookOutlineTemplate {

	static readonly templateId = 'NotebookOutlineRenderer';

	constructor(
		readonly iconLabel: IconLabel,
		readonly iconClass: HTMLElement,
	) { }
}

class NotebookOutlineRenderer implements ITreeRenderer<OutlineEntry, FuzzyScore, NotebookOutlineTemplate> {

	templateId: string = NotebookOutlineTemplate.templateId;

	renderTemplate(container: HTMLElement): NotebookOutlineTemplate {
		const iconClass = dom.$('span.outline-element-icon');
		// container.append(iconClass); todo@jrieken find a better way for icons
		const iconLabel = new IconLabel(container);

		return new NotebookOutlineTemplate(iconLabel, iconClass);
	}

	renderElement(element: ITreeNode<OutlineEntry, FuzzyScore>, _index: number, templateData: NotebookOutlineTemplate, _height: number | undefined): void {
		templateData.iconClass.classList.add(...ThemeIcon.asClassNameArray(element.element.icon));
		templateData.iconLabel.setLabel(element.element.label);
	}

	disposeTemplate(templateData: NotebookOutlineTemplate): void {
		templateData.iconLabel.dispose();
	}
}

class NotebookOutlineAccessibility implements IListAccessibilityProvider<OutlineEntry> {
	getAriaLabel(element: OutlineEntry): string | null {
		return element.label;
	}
	getWidgetAriaLabel(): string {
		return '';
	}
}

class NotebookOutlineVirtualDelegate implements IListVirtualDelegate<OutlineEntry> {

	getHeight(_element: OutlineEntry): number {
		return 22;
	}

	getTemplateId(_element: OutlineEntry): string {
		return NotebookOutlineTemplate.templateId;
	}
}

class NotebookCellOutline implements IOutline<OutlineEntry> {

	private readonly _dispoables = new DisposableStore();

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private readonly _onDidChangeActiveEntry = new Emitter<this>();
	readonly onDidChangeActiveEntry: Event<this> = this._onDidChangeActiveEntry.event;

	private _activeEntry?: OutlineEntry;
	private _entries: OutlineEntry[] = [];
	private readonly _entriesDisposables = new DisposableStore();

	readonly treeConfig: OutlineTreeConfiguration<OutlineEntry>;

	constructor(
		private readonly _editor: NotebookEditor,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		const selectionListener = new MutableDisposable();
		this._dispoables.add(selectionListener);
		const installSelectionListener = () => {
			if (!_editor.viewModel) {
				selectionListener.clear();
			} else {
				selectionListener.value = combinedDisposable(
					_editor.viewModel.onDidChangeSelection(() => this._computeActive()),
					_editor.viewModel.onDidChangeViewCells(() => {
						this._computeEntries();
						this._computeActive();
					}));
			}
		};

		this._dispoables.add(_editor.onDidChangeModel(() => {
			this._computeEntries();
			this._computeActive();
			installSelectionListener();
		}));

		this._computeEntries();
		this._computeActive();
		installSelectionListener();

		this.treeConfig = new OutlineTreeConfiguration<OutlineEntry>(
			{ getBreadcrumbElements: (element) => Iterable.single(element) },
			{ getQuickPickElements: () => this._entries.map(entry => ({ element: entry, label: `$(${entry.icon.id}) ${entry.label}`, ariaLabel: entry.label })) },
			{ getChildren: parent => parent === this ? this._entries : [] },
			new NotebookOutlineVirtualDelegate(),
			[new NotebookOutlineRenderer()],
			{ getId: element => element.cell.handle },
			{
				collapseByDefault: true,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				accessibilityProvider: new NotebookOutlineAccessibility()
			}
		);
	}

	dispose(): void {
		this._dispoables.dispose();
	}

	// TODO@jrieken recompute entries on demand, not eagerly
	private _computeEntries(): void {
		this._entriesDisposables.clear();
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
						matches[j].replace(/^[ \t]*(\#+)/, '').trim(),
						cell.cellKind === CellKind.Markdown ? Codicon.markdown : Codicon.code
					));
				}
			}

			// send an event whenever any of the cells change
			this._entriesDisposables.add(cell.model.onDidChangeContent(() => {
				this._computeEntries();
				this._computeActive();
				this._onDidChange.fire(this);
			}));
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

	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get activeEntry(): OutlineEntry | undefined {
		return this._activeEntry;
	}

	async revealInEditor(entry: OutlineEntry, options: IEditorOptions, sideBySide: boolean): Promise<void> {
		//todo@jrieken focus cell
		// const widget = this._editor.getControl();
		// if (widget) {
		// 	widget.revealInCenterIfOutsideViewport(entry.cell);
		// 	widget.selectElement(entry.cell);
		// 	widget.focusNotebookCell(entry.cell, entry.cell.cellKind === CellKind.Markdown ? 'container' : 'editor');
		// }

		await this._editorService.openEditor({
			resource: entry.cell.uri,
			options: { ...options }
		}, sideBySide ? SIDE_GROUP : undefined);
	}

	previewInEditor(entry: OutlineEntry): IDisposable {
		const widget = this._editor.getControl();
		if (!widget) {
			return Disposable.None;
		}
		widget.revealInCenterIfOutsideViewport(entry.cell);
		widget.selectElement(entry.cell);
		const ids = widget.deltaCellDecorations([], [{
			handle: entry.cell.handle,
			options: { className: 'nb-symbolHighlight', outputClassName: 'nb-symbolHighlight' }
		}]);
		return toDisposable(() => { widget.deltaCellDecorations(ids, []); });

	}

	getParent(_entry: OutlineEntry): OutlineEntry | undefined {
		return undefined;
	}
}

class NotebookOutlineCreator implements IOutlineCreator<NotebookEditor, OutlineEntry> {

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is NotebookEditor {
		return candidate.getId() === NotebookEditor.ID;
	}

	async createOutline(editor: NotebookEditor): Promise<IOutline<OutlineEntry> | undefined> {
		return this._instantiationService.createInstance(NotebookCellOutline, editor);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);
