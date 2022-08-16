/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IBreadcrumbsDataSource, IOutline, IOutlineCreator, IOutlineListConfig, IOutlineService, OutlineChangeEvent, OutlineConfigKeys, OutlineTarget, } from 'vs/workbench/services/outline/browser/outline';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IEditorPane } from 'vs/workbench/common/editor';
import { DocumentSymbolComparator, DocumentSymbolAccessibilityProvider, DocumentSymbolRenderer, DocumentSymbolFilter, DocumentSymbolGroupRenderer, DocumentSymbolIdentityProvider, DocumentSymbolNavigationLabelProvider, DocumentSymbolVirtualDelegate } from 'vs/workbench/contrib/codeEditor/browser/outline/documentSymbolsTree';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { OutlineGroup, OutlineElement, OutlineModel, TreeElement, IOutlineMarker, IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { raceCancellation, TimeoutTimer, timeout, Barrier } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPosition } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { IEditorOptions, TextEditorSelectionRevealType } from 'vs/platform/editor/common/editor';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { IDataSource } from 'vs/base/browser/ui/tree/tree';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markerDecorations';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { isEqual } from 'vs/base/common/resources';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

type DocumentSymbolItem = OutlineGroup | OutlineElement;

class DocumentSymbolBreadcrumbsSource implements IBreadcrumbsDataSource<DocumentSymbolItem>{

	private _breadcrumbs: (OutlineGroup | OutlineElement)[] = [];

	constructor(
		private readonly _editor: ICodeEditor,
		@ITextResourceConfigurationService private readonly _textResourceConfigurationService: ITextResourceConfigurationService,
	) { }

	getBreadcrumbElements(): readonly DocumentSymbolItem[] {
		return this._breadcrumbs;
	}

	clear(): void {
		this._breadcrumbs = [];
	}

	update(model: OutlineModel, position: IPosition): void {
		const newElements = this._computeBreadcrumbs(model, position);
		this._breadcrumbs = newElements;
	}

	private _computeBreadcrumbs(model: OutlineModel, position: IPosition): Array<OutlineGroup | OutlineElement> {
		let item: OutlineGroup | OutlineElement | undefined = model.getItemEnclosingPosition(position);
		if (!item) {
			return [];
		}
		const chain: Array<OutlineGroup | OutlineElement> = [];
		while (item) {
			chain.push(item);
			const parent: any = item.parent;
			if (parent instanceof OutlineModel) {
				break;
			}
			if (parent instanceof OutlineGroup && parent.parent && parent.parent.children.size === 1) {
				break;
			}
			item = parent;
		}
		const result: Array<OutlineGroup | OutlineElement> = [];
		for (let i = chain.length - 1; i >= 0; i--) {
			const element = chain[i];
			if (this._isFiltered(element)) {
				break;
			}
			result.push(element);
		}
		if (result.length === 0) {
			return [];
		}
		return result;
	}

	private _isFiltered(element: TreeElement): boolean {
		if (!(element instanceof OutlineElement)) {
			return false;
		}
		const key = `breadcrumbs.${DocumentSymbolFilter.kindToConfigName[element.symbol.kind]}`;
		let uri: URI | undefined;
		if (this._editor && this._editor.getModel()) {
			const model = this._editor.getModel() as ITextModel;
			uri = model.uri;
		}
		return !this._textResourceConfigurationService.getValue<boolean>(uri, key);
	}
}

class DocumentSymbolsOutline implements IOutline<DocumentSymbolItem> {

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = new Emitter<OutlineChangeEvent>();

	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _outlineModel?: OutlineModel;
	private _outlineDisposables = new DisposableStore();

	private readonly _breadcrumbsDataSource: DocumentSymbolBreadcrumbsSource;

	readonly config: IOutlineListConfig<DocumentSymbolItem>;

	readonly outlineKind = 'documentSymbols';

	get activeElement(): DocumentSymbolItem | undefined {
		const posistion = this._editor.getPosition();
		if (!posistion || !this._outlineModel) {
			return undefined;
		} else {
			return this._outlineModel.getItemEnclosingPosition(posistion);
		}
	}

	constructor(
		private readonly _editor: ICodeEditor,
		target: OutlineTarget,
		firstLoadBarrier: Barrier,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IOutlineModelService private readonly _outlineModelService: IOutlineModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		this._breadcrumbsDataSource = new DocumentSymbolBreadcrumbsSource(_editor, textResourceConfigurationService);
		const delegate = new DocumentSymbolVirtualDelegate();
		const renderers = [new DocumentSymbolGroupRenderer(), instantiationService.createInstance(DocumentSymbolRenderer, true)];
		const treeDataSource: IDataSource<this, DocumentSymbolItem> = {
			getChildren: (parent) => {
				if (parent instanceof OutlineElement || parent instanceof OutlineGroup) {
					return parent.children.values();
				}
				if (parent === this && this._outlineModel) {
					return this._outlineModel.children.values();
				}
				return [];
			}
		};
		const comparator = new DocumentSymbolComparator();
		const options = {
			collapseByDefault: target === OutlineTarget.Breadcrumbs,
			expandOnlyOnTwistieClick: true,
			multipleSelectionSupport: false,
			identityProvider: new DocumentSymbolIdentityProvider(),
			keyboardNavigationLabelProvider: new DocumentSymbolNavigationLabelProvider(),
			accessibilityProvider: new DocumentSymbolAccessibilityProvider(localize('document', "Document Symbols")),
			filter: target === OutlineTarget.OutlinePane
				? instantiationService.createInstance(DocumentSymbolFilter, 'outline')
				: target === OutlineTarget.Breadcrumbs
					? instantiationService.createInstance(DocumentSymbolFilter, 'breadcrumbs')
					: undefined
		};

		this.config = {
			breadcrumbsDataSource: this._breadcrumbsDataSource,
			delegate,
			renderers,
			treeDataSource,
			comparator,
			options,
			quickPickDataSource: { getQuickPickElements: () => { throw new Error('not implemented'); } }
		};


		// update as language, model, providers changes
		this._disposables.add(_languageFeaturesService.documentSymbolProvider.onDidChange(_ => this._createOutline()));
		this._disposables.add(this._editor.onDidChangeModel(_ => this._createOutline()));
		this._disposables.add(this._editor.onDidChangeModelLanguage(_ => this._createOutline()));

		// update soon'ish as model content change
		const updateSoon = new TimeoutTimer();
		this._disposables.add(updateSoon);
		this._disposables.add(this._editor.onDidChangeModelContent(event => {
			const model = this._editor.getModel();
			if (model) {
				const timeout = _outlineModelService.getDebounceValue(model);
				updateSoon.cancelAndSet(() => this._createOutline(event), timeout);
			}
		}));

		// stop when editor dies
		this._disposables.add(this._editor.onDidDispose(() => this._outlineDisposables.clear()));

		// initial load
		this._createOutline().finally(() => firstLoadBarrier.open());
	}

	dispose(): void {
		this._disposables.dispose();
		this._outlineDisposables.dispose();
	}

	get isEmpty(): boolean {
		return !this._outlineModel || TreeElement.empty(this._outlineModel);
	}

	get uri() {
		return this._outlineModel?.uri;
	}

	async reveal(entry: DocumentSymbolItem, options: IEditorOptions, sideBySide: boolean): Promise<void> {
		const model = OutlineModel.get(entry);
		if (!model || !(entry instanceof OutlineElement)) {
			return;
		}
		await this._codeEditorService.openCodeEditor({
			resource: model.uri,
			options: {
				...options,
				selection: Range.collapseToStart(entry.symbol.selectionRange),
				selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
			}
		}, this._editor, sideBySide);
	}

	preview(entry: DocumentSymbolItem): IDisposable {
		if (!(entry instanceof OutlineElement)) {
			return Disposable.None;
		}

		const { symbol } = entry;
		this._editor.revealRangeInCenterIfOutsideViewport(symbol.range, ScrollType.Smooth);
		const decorationsCollection = this._editor.createDecorationsCollection([{
			range: symbol.range,
			options: {
				description: 'document-symbols-outline-range-highlight',
				className: 'rangeHighlight',
				isWholeLine: true
			}
		}]);
		return toDisposable(() => decorationsCollection.clear());
	}

	captureViewState(): IDisposable {
		const viewState = this._editor.saveViewState();
		return toDisposable(() => {
			if (viewState) {
				this._editor.restoreViewState(viewState);
			}
		});
	}

	private async _createOutline(contentChangeEvent?: IModelContentChangedEvent): Promise<void> {

		this._outlineDisposables.clear();
		if (!contentChangeEvent) {
			this._setOutlineModel(undefined);
		}

		if (!this._editor.hasModel()) {
			return;
		}
		const buffer = this._editor.getModel();
		if (!this._languageFeaturesService.documentSymbolProvider.has(buffer)) {
			return;
		}

		const cts = new CancellationTokenSource();
		const versionIdThen = buffer.getVersionId();
		const timeoutTimer = new TimeoutTimer();

		this._outlineDisposables.add(timeoutTimer);
		this._outlineDisposables.add(toDisposable(() => cts.dispose(true)));

		try {
			const model = await this._outlineModelService.getOrCreate(buffer, cts.token);
			if (cts.token.isCancellationRequested) {
				// cancelled -> do nothing
				return;
			}

			if (TreeElement.empty(model) || !this._editor.hasModel()) {
				// empty -> no outline elements
				this._setOutlineModel(model);
				return;
			}

			// heuristic: when the symbols-to-lines ratio changes by 50% between edits
			// wait a little (and hope that the next change isn't as drastic).
			if (contentChangeEvent && this._outlineModel && buffer.getLineCount() >= 25) {
				const newSize = TreeElement.size(model);
				const newLength = buffer.getValueLength();
				const newRatio = newSize / newLength;
				const oldSize = TreeElement.size(this._outlineModel);
				const oldLength = newLength - contentChangeEvent.changes.reduce((prev, value) => prev + value.rangeLength, 0);
				const oldRatio = oldSize / oldLength;
				if (newRatio <= oldRatio * 0.5 || newRatio >= oldRatio * 1.5) {
					// wait for a better state and ignore current model when more
					// typing has happened
					const value = await raceCancellation(timeout(2000).then(() => true), cts.token, false);
					if (!value) {
						return;
					}
				}
			}

			// feature: show markers with outline element
			this._applyMarkersToOutline(model);
			this._outlineDisposables.add(this._markerDecorationsService.onDidChangeMarker(textModel => {
				if (isEqual(model.uri, textModel.uri)) {
					this._applyMarkersToOutline(model);
					this._onDidChange.fire({});
				}
			}));
			this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(OutlineConfigKeys.problemsEnabled)) {
					if (this._configurationService.getValue(OutlineConfigKeys.problemsEnabled)) {
						this._applyMarkersToOutline(model);
					} else {
						model.updateMarker([]);
					}
					this._onDidChange.fire({});
				}
				if (e.affectsConfiguration('outline')) {
					// outline filtering, problems on/off
					this._onDidChange.fire({});
				}
				if (e.affectsConfiguration('breadcrumbs') && this._editor.hasModel()) {
					// breadcrumbs filtering
					this._breadcrumbsDataSource.update(model, this._editor.getPosition());
					this._onDidChange.fire({});
				}
			}));

			// feature: toggle icons
			this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(OutlineConfigKeys.icons)) {
					this._onDidChange.fire({});
				}
				if (e.affectsConfiguration('outline')) {
					this._onDidChange.fire({});
				}
			}));

			// feature: update active when cursor changes
			this._outlineDisposables.add(this._editor.onDidChangeCursorPosition(_ => {
				timeoutTimer.cancelAndSet(() => {
					if (!buffer.isDisposed() && versionIdThen === buffer.getVersionId() && this._editor.hasModel()) {
						this._breadcrumbsDataSource.update(model, this._editor.getPosition());
						this._onDidChange.fire({ affectOnlyActiveElement: true });
					}
				}, 150);
			}));

			// update properties, send event
			this._setOutlineModel(model);

		} catch (err) {
			this._setOutlineModel(undefined);
			onUnexpectedError(err);
		}
	}

	private _applyMarkersToOutline(model: OutlineModel | undefined): void {
		if (!model || !this._configurationService.getValue(OutlineConfigKeys.problemsEnabled)) {
			return;
		}
		const markers: IOutlineMarker[] = [];
		for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(model.uri)) {
			if (marker.severity === MarkerSeverity.Error || marker.severity === MarkerSeverity.Warning) {
				markers.push({ ...range, severity: marker.severity });
			}
		}
		model.updateMarker(markers);
	}

	private _setOutlineModel(model: OutlineModel | undefined) {
		const position = this._editor.getPosition();
		if (!position || !model) {
			this._outlineModel = undefined;
			this._breadcrumbsDataSource.clear();
		} else {
			if (!this._outlineModel?.merge(model)) {
				this._outlineModel = model;
			}
			this._breadcrumbsDataSource.update(model, position);
		}
		this._onDidChange.fire({});
	}
}

class DocumentSymbolsOutlineCreator implements IOutlineCreator<IEditorPane, DocumentSymbolItem> {

	readonly dispose: () => void;

	constructor(
		@IOutlineService outlineService: IOutlineService
	) {
		const reg = outlineService.registerOutlineCreator(this);
		this.dispose = () => reg.dispose();
	}

	matches(candidate: IEditorPane): candidate is IEditorPane {
		const ctrl = candidate.getControl();
		return isCodeEditor(ctrl) || isDiffEditor(ctrl);
	}

	async createOutline(pane: IEditorPane, target: OutlineTarget, _token: CancellationToken): Promise<IOutline<DocumentSymbolItem> | undefined> {
		const control = pane.getControl();
		let editor: ICodeEditor | undefined;
		if (isCodeEditor(control)) {
			editor = control;
		} else if (isDiffEditor(control)) {
			editor = control.getModifiedEditor();
		}
		if (!editor) {
			return undefined;
		}
		const firstLoadBarrier = new Barrier();
		const result = editor.invokeWithinContext(accessor => accessor.get(IInstantiationService).createInstance(DocumentSymbolsOutline, editor!, target, firstLoadBarrier));
		await firstLoadBarrier.wait();
		return result;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DocumentSymbolsOutlineCreator, 'DocumentSymbolsOutlineCreator', LifecyclePhase.Eventually);
