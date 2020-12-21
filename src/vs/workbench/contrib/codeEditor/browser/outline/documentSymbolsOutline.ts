/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IOutline, IOutlineCreator, IOutlineService, OutlineTarget, OutlineTreeConfiguration } from 'vs/workbench/services/outline/browser/outline';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorPane } from 'vs/workbench/common/editor';
import { OutlineAccessibilityProvider, OutlineElementRenderer, OutlineFilter, OutlineGroupRenderer, OutlineIdentityProvider, OutlineItemComparator, OutlineNavigationLabelProvider, OutlineSortOrder, OutlineVirtualDelegate } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { OutlineGroup, OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { TimeoutTimer } from 'vs/base/common/async';
import { equals } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPosition } from 'vs/editor/common/core/position';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { IEditorOptions, TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';

type DocumentSymbolItem = OutlineGroup | OutlineElement;

class DocumentSymbolsOutline implements IOutline<DocumentSymbolItem> {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private readonly _onDidChangeActiveEntry = new Emitter<this>();
	readonly onDidChangeActiveEntry: Event<this> = this._onDidChangeActiveEntry.event;

	private _outlineModel?: OutlineModel;
	private _outlineElementChain: Array<OutlineModel | OutlineGroup | OutlineElement> = [];
	private _outlineDisposables = new DisposableStore();

	readonly config: OutlineTreeConfiguration<DocumentSymbolItem>;

	constructor(
		private readonly _editor: ICodeEditor,
		target: OutlineTarget,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITextResourceConfigurationService private readonly _textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		const sorter = new OutlineItemComparator();
		this.config = new OutlineTreeConfiguration(
			{ getBreadcrumbElements: () => <DocumentSymbolItem[]>this._outlineElementChain.filter(element => !(element instanceof OutlineModel)) },
			{ getQuickPickElements: () => { throw new Error('not implemented'); } },
			{
				getChildren: (parent) => {
					if (parent instanceof OutlineElement || parent instanceof OutlineGroup) {
						return parent.children.values();
					}
					if (parent === this && this._outlineModel) {
						return this._outlineModel.children.values();
					}
					return [];
				}
			},
			new OutlineVirtualDelegate(),
			[new OutlineGroupRenderer(), instantiationService.createInstance(OutlineElementRenderer)],
			{
				collapseByDefault: true,
				expandOnlyOnTwistieClick: true,
				multipleSelectionSupport: false,
				accessibilityProvider: new OutlineAccessibilityProvider(target === OutlineTarget.Breadcrumbs ? 'breadcrumbs' : 'outline'),
				identityProvider: new OutlineIdentityProvider(),
				keyboardNavigationLabelProvider: new OutlineNavigationLabelProvider(),
				filter: instantiationService.createInstance(OutlineFilter, target === OutlineTarget.Breadcrumbs ? 'breadcrumbs' : 'outline'),
				sorter
			}
		);

		// special sorting for breadcrumbs
		if (target === OutlineTarget.Breadcrumbs) {
			const updateSort = () => {
				const uri = this._outlineModel?.uri;
				const value = _textResourceConfigurationService.getValue(uri, `breadcrumbs.symbolSortOrder`);
				if (value === 'name') {
					sorter.type = OutlineSortOrder.ByName;
				} else if (value === 'type') {
					sorter.type = OutlineSortOrder.ByKind;
				} else {
					sorter.type = OutlineSortOrder.ByPosition;
				}
			};
			this._disposables.add(_textResourceConfigurationService.onDidChangeConfiguration(() => updateSort()));
			updateSort();
		}


		// update as language, model, providers changes
		this._disposables.add(DocumentSymbolProviderRegistry.onDidChange(_ => this._updateOutline()));
		this._disposables.add(this._editor.onDidChangeModel(_ => this._updateOutline()));
		this._disposables.add(this._editor.onDidChangeModelLanguage(_ => this._updateOutline()));

		// update when config changes (re-render)
		this._disposables.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('breadcrumbs')) {
				this._updateOutline(true);
				return;
			}
			if (this._editor && this._editor.getModel()) {
				const editorModel = this._editor.getModel() as ITextModel;
				const languageName = editorModel.getLanguageIdentifier().language;

				// Checking for changes in the current language override config.
				// We can't be more specific than this because the ConfigurationChangeEvent(e) only includes the first part of the root path
				if (e.affectsConfiguration(`[${languageName}]`)) {
					this._updateOutline(true);
				}
			}
		}));

		// update soon'ish as model content change
		const updateSoon = new TimeoutTimer();
		this._disposables.add(updateSoon);
		this._disposables.add(this._editor.onDidChangeModelContent(_ => {
			const timeout = OutlineModel.getRequestDelay(this._editor!.getModel());
			updateSoon.cancelAndSet(() => this._updateOutline(true), timeout);
		}));
		this._updateOutline();

		// stop when editor dies
		this._disposables.add(this._editor.onDidDispose(() => this._outlineDisposables.clear()));
	}

	dispose(): void {
		this._disposables.dispose();
		this._outlineDisposables.dispose();
	}

	get isEmpty(): boolean {
		return this._outlineElementChain.length === 0;
	}

	async reveal(entry: DocumentSymbolItem, options: IEditorOptions, sideBySide: boolean): Promise<void> {
		if (entry instanceof OutlineElement) {
			const position = Range.getStartPosition(entry.symbol.selectionRange);
			this._editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Immediate);
			this._editor.setPosition(position);
		}
		this._editor.focus();

		const model = OutlineModel.get(entry);
		if (!model || !(entry instanceof OutlineElement)) {
			return;
		}
		await this._codeEditorService.openCodeEditor({
			resource: model.uri,
			options: {
				...options,
				selection: Range.collapseToStart(entry.symbol.selectionRange),
				selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
			}
		}, this._editor, sideBySide);
	}

	preview(entry: DocumentSymbolItem): IDisposable {
		if (!(entry instanceof OutlineElement)) {
			return Disposable.None;
		}
		// todo@jrieken
		// if (!editorViewState) {
		// 	editorViewState = withNullAsUndefined(editor.saveViewState());
		// }
		const { symbol } = entry;
		this._editor.revealRangeInCenterIfOutsideViewport(symbol.range, ScrollType.Smooth);
		const ids = this._editor.deltaDecorations([], [{
			range: symbol.range,
			options: {
				className: 'rangeHighlight',
				isWholeLine: true
			}
		}]);
		return toDisposable(() => this._editor.deltaDecorations(ids, []));
	}

	private _updateOutline(didChangeContent?: boolean): void {

		this._outlineDisposables.clear();
		if (!didChangeContent) {
			this._updateOutlineElements(undefined, []);
		}

		const editor = this._editor!;

		const buffer = editor.getModel();
		if (!buffer || !DocumentSymbolProviderRegistry.has(buffer)) {
			return;
		}

		const source = new CancellationTokenSource();
		const versionIdThen = buffer.getVersionId();
		const timeout = new TimeoutTimer();

		this._outlineDisposables.add({
			dispose: () => {
				source.dispose(true);
				timeout.dispose();
			}
		});

		OutlineModel.create(buffer, source.token).then(model => {
			if (source.token.isCancellationRequested) {
				// cancelled -> do nothing
				return;
			}
			if (TreeElement.empty(model)) {
				// empty -> no outline elements
				this._updateOutlineElements(model, []);

			} else {
				// copy the model
				model = model.adopt();

				this._updateOutlineElements(model, this._getOutlineElements(model, editor.getPosition()));
				this._outlineDisposables.add(editor.onDidChangeCursorPosition(_ => {
					timeout.cancelAndSet(() => {
						if (!buffer.isDisposed() && versionIdThen === buffer.getVersionId() && editor.getModel()) {
							this._updateOutlineElements(model, this._getOutlineElements(model, editor.getPosition()));
						}
					}, 150);
				}));
			}
		}).catch(err => {
			this._updateOutlineElements(undefined, []);
			onUnexpectedError(err);
		});
	}

	private _getOutlineElements(model: OutlineModel, position: IPosition | null): Array<OutlineModel | OutlineGroup | OutlineElement> {
		if (!model || !position) {
			return [];
		}
		let item: OutlineGroup | OutlineElement | undefined = model.getItemEnclosingPosition(position);
		if (!item) {
			return this._getOutlineElementsRoot(model);
		}
		let chain: Array<OutlineGroup | OutlineElement> = [];
		while (item) {
			chain.push(item);
			let parent: any = item.parent;
			if (parent instanceof OutlineModel) {
				break;
			}
			if (parent instanceof OutlineGroup && parent.parent && parent.parent.children.size === 1) {
				break;
			}
			item = parent;
		}
		let result: Array<OutlineGroup | OutlineElement> = [];
		for (let i = chain.length - 1; i >= 0; i--) {
			let element = chain[i];
			if (this._isFiltered(element)) {
				break;
			}
			result.push(element);
		}
		if (result.length === 0) {
			return this._getOutlineElementsRoot(model);
		}
		return result;
	}

	private _getOutlineElementsRoot(model: OutlineModel): (OutlineModel | OutlineGroup | OutlineElement)[] {
		for (const child of model.children.values()) {
			if (!this._isFiltered(child)) {
				return [model];
			}
		}
		return [];
	}

	private _isFiltered(element: TreeElement): boolean {
		if (element instanceof OutlineElement) {
			const key = `breadcrumbs.${OutlineFilter.kindToConfigName[element.symbol.kind]}`;
			let uri: URI | undefined;
			if (this._editor && this._editor.getModel()) {
				const model = this._editor.getModel() as ITextModel;
				uri = model.uri;
			}
			return !this._textResourceConfigurationService.getValue<boolean>(uri, key);
		}
		return false;
	}

	private _updateOutlineElements(model: OutlineModel | undefined, elements: Array<OutlineModel | OutlineGroup | OutlineElement>): void {
		let fire = false;
		if (this._outlineModel !== model) {
			this._outlineModel = model;
			fire = true;
		}
		if (!equals(elements, this._outlineElementChain, DocumentSymbolsOutline._outlineElementEquals)) {
			this._outlineElementChain = elements;
			fire = true;
		}
		if (fire) {
			this._onDidChange.fire(this);
		}
	}

	private static _outlineElementEquals(a: OutlineModel | OutlineGroup | OutlineElement, b: OutlineModel | OutlineGroup | OutlineElement): boolean {
		if (a === b) {
			return true;
		} else if (!a || !b) {
			return false;
		} else {
			return a.id === b.id;
		}
	}
}

class DocumentSymbolsOutlineCreator implements IOutlineCreator<IEditorPane, DocumentSymbolItem> {

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is IEditorPane {
		const ctrl = candidate.getControl();
		return isCodeEditor(ctrl) || isDiffEditor(ctrl);
	}

	async createOutline(pane: IEditorPane, target: OutlineTarget, token: CancellationToken): Promise<IOutline<DocumentSymbolItem> | undefined> {
		const control = pane.getControl();
		let editor: ICodeEditor | undefined;
		if (isCodeEditor(control)) {
			editor = control as ICodeEditor;
		} else if (isDiffEditor(control)) {
			editor = control.getModifiedEditor();
		}
		if (!editor) {
			return undefined;
		}
		return this._instantiationService.createInstance(DocumentSymbolsOutline, editor, target);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DocumentSymbolsOutlineCreator, LifecyclePhase.Eventually);
