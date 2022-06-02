/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, reset } from 'vs/base/browser/dom';
import { Direction, Grid, IView, IViewSize, SerializableGrid } from 'vs/base/browser/ui/grid/grid';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { IAction } from 'vs/base/common/actions';
import { findLast } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/mergeEditor';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { localize } from 'vs/nls';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorControl, IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { autorun, derivedObservable, IObservable, ITransaction, keepAlive, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorModel';
import { LineRange, ModifiedBaseRange } from 'vs/workbench/contrib/mergeEditor/browser/model';
import { applyObservableDecorations, n, ReentrancyBarrier, setStyle } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { settingsSashBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from './editorGutter';

export const ctxIsMergeEditor = new RawContextKey<boolean>('isMergeEditor', false);
export const ctxUsesColumnLayout = new RawContextKey<boolean>('mergeEditorUsesColumnLayout', false);

export class MergeEditor extends EditorPane {

	static readonly ID = 'mergeEditor';

	private readonly _sessionDisposables = new DisposableStore();

	private _grid!: Grid<IView>;

	private readonly input1View = this.instantiation.createInstance(InputCodeEditorView, 1, { readonly: true });
	private readonly input2View = this.instantiation.createInstance(InputCodeEditorView, 2, { readonly: true });
	private readonly inputResultView = this.instantiation.createInstance(ResultCodeEditorView, { readonly: false });

	private readonly _ctxIsMergeEditor: IContextKey<boolean>;
	private readonly _ctxUsesColumnLayout: IContextKey<boolean>;

	private _model: MergeEditorModel | undefined;
	public get model(): MergeEditorModel | undefined { return this._model; }

	constructor(
		@IInstantiationService private readonly instantiation: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(MergeEditor.ID, telemetryService, themeService, storageService);

		this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(_contextKeyService);
		this._ctxUsesColumnLayout = ctxUsesColumnLayout.bindTo(_contextKeyService);

		const reentrancyBarrier = new ReentrancyBarrier();

		const input1ResultMapping = derivedObservable('input1ResultMapping', reader => {
			const model = this.input1View.model.read(reader);
			if (!model) {
				return undefined;
			}
			const resultDiffs = model.resultDiffs.read(reader);
			const modifiedBaseRanges = ModifiedBaseRange.fromDiffs(model.base, model.input1, model.input1LinesDiffs, model.result, resultDiffs);
			return modifiedBaseRanges;
		});
		const input2ResultMapping = derivedObservable('input2ResultMapping', reader => {
			const model = this.input2View.model.read(reader);
			if (!model) {
				return undefined;
			}
			const resultDiffs = model.resultDiffs.read(reader);
			const modifiedBaseRanges = ModifiedBaseRange.fromDiffs(model.base, model.input2, model.input2LinesDiffs, model.result, resultDiffs);
			return modifiedBaseRanges;
		});

		this._register(keepAlive(input1ResultMapping));
		this._register(keepAlive(input2ResultMapping));

		this._store.add(
			this.input1View.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = input1ResultMapping.get();
						synchronizeScrolling(this.input1View.editor, this.inputResultView.editor, mapping, 1);
						this.input2View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					}
				})
			)
		);
		this._store.add(
			this.input2View.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = input2ResultMapping.get();
						synchronizeScrolling(this.input2View.editor, this.inputResultView.editor, mapping, 1);
						this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					}
				})
			)
		);
		this._store.add(
			this.inputResultView.editor.onDidScrollChange(
				reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping1 = input1ResultMapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input1View.editor, mapping1, 2);
						const mapping2 = input2ResultMapping.get();
						synchronizeScrolling(this.inputResultView.editor, this.input2View.editor, mapping2, 2);
					}
				})
			)
		);


		// TODO@jrieken make this proper: add menu id and allow extensions to contribute
		const toolbarMenu = this._menuService.createMenu(MenuId.MergeToolbar, this._contextKeyService);
		const toolbarMenuDisposables = new DisposableStore();
		const toolbarMenuRender = () => {
			toolbarMenuDisposables.clear();

			const actions: IAction[] = [];
			createAndFillInActionBarActions(toolbarMenu, { renderShortTitle: true, shouldForwardArgs: true }, actions);
			if (actions.length > 0) {
				const [first] = actions;
				const acceptBtn = this.instantiation.createInstance(FloatingClickWidget, this.inputResultView.editor, first.label, first.id);
				toolbarMenuDisposables.add(acceptBtn.onClick(() => first.run(this.inputResultView.editor.getModel()?.uri)));
				toolbarMenuDisposables.add(acceptBtn);
				acceptBtn.render();
			}
		};
		this._store.add(toolbarMenu);
		this._store.add(toolbarMenuDisposables);
		this._store.add(toolbarMenu.onDidChange(toolbarMenuRender));
		toolbarMenuRender();
	}

	override dispose(): void {
		this._sessionDisposables.dispose();
		this._ctxIsMergeEditor.reset();
		super.dispose();
	}

	// TODO use this method & make it private
	getEditorOptions(resource: URI): IEditorConfiguration {
		return deepClone(this.textResourceConfigurationService.getValue<IEditorConfiguration>(resource));
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('merge-editor');

		this._grid = SerializableGrid.from<any /*TODO@jrieken*/>({
			orientation: Orientation.VERTICAL,
			size: 100,
			groups: [
				{
					size: 38,
					groups: [{
						data: this.input1View.view
					}, {
						data: this.input2View.view
					}]
				},
				{
					size: 62,
					data: this.inputResultView.view
				},
			]
		}, {
			styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
			proportionalLayout: true
		});

		reset(parent, this._grid.element);
		this._ctxUsesColumnLayout.set(false);
	}

	layout(dimension: Dimension): void {
		this._grid.layout(dimension.width, dimension.height);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (!(input instanceof MergeEditorInput)) {
			throw new BugIndicatingError('ONLY MergeEditorInput is supported');
		}
		await super.setInput(input, options, context, token);

		this._sessionDisposables.clear();
		const model = await input.resolve();
		this._model = model;

		this.input1View.setModel(model, model.input1, localize('yours', 'Yours'), model.input1Detail, model.input1Description);
		this.input2View.setModel(model, model.input2, localize('theirs', 'Theirs',), model.input2Detail, model.input2Description);
		this.inputResultView.setModel(model, model.result, localize('result', 'Result',), this._labelService.getUriLabel(model.result.uri, { relative: true }), undefined);

		// TODO: Update editor options!

		const input1ViewZoneIds: string[] = [];
		const input2ViewZoneIds: string[] = [];
		for (const m of model.modifiedBaseRanges) {
			const max = Math.max(m.input1Range.lineCount, m.input2Range.lineCount, 1);

			this.input1View.editor.changeViewZones(a => {
				input1ViewZoneIds.push(a.addZone({
					afterLineNumber: m.input1Range.endLineNumberExclusive - 1,
					heightInLines: max - m.input1Range.lineCount,
					domNode: $('div.diagonal-fill'),
				}));
			});

			this.input2View.editor.changeViewZones(a => {
				input2ViewZoneIds.push(a.addZone({
					afterLineNumber: m.input2Range.endLineNumberExclusive - 1,
					heightInLines: max - m.input2Range.lineCount,
					domNode: $('div.diagonal-fill'),
				}));
			});
		}

		this._sessionDisposables.add({
			dispose: () => {
				this.input1View.editor.changeViewZones(a => {
					for (const zone of input1ViewZoneIds) {
						a.removeZone(zone);
					}
				});
				this.input2View.editor.changeViewZones(a => {
					for (const zone of input2ViewZoneIds) {
						a.removeZone(zone);
					}
				});
			}
		});
	}

	protected override setEditorVisible(visible: boolean): void {
		this._ctxIsMergeEditor.set(visible);
	}

	// ---- interact with "outside world" via `getControl`, `scopedContextKeyService`

	override getControl(): IEditorControl | undefined {
		for (const view of [this.input1View, this.input2View, this.inputResultView]) {
			if (view.editor.hasWidgetFocus()) {
				return view.editor;
			}
		}
		return undefined;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		const control = this.getControl();
		return isCodeEditor(control)
			? control.invokeWithinContext(accessor => accessor.get(IContextKeyService))
			: undefined;
	}

	// --- layout

	private _usesColumnLayout = false;

	toggleLayout(): void {
		if (!this._usesColumnLayout) {
			this._grid.moveView(this.inputResultView.view, Sizing.Distribute, this.input1View.view, Direction.Right);
		} else {
			this._grid.moveView(this.inputResultView.view, this._grid.height * .62, this.input1View.view, Direction.Down);
			this._grid.moveView(this.input2View.view, Sizing.Distribute, this.input1View.view, Direction.Right);
		}
		this._usesColumnLayout = !this._usesColumnLayout;
		this._ctxUsesColumnLayout.set(this._usesColumnLayout);
	}
}

function synchronizeScrolling(scrollingEditor: CodeEditorWidget, targetEditor: CodeEditorWidget, mapping: ModifiedBaseRange[] | undefined, sourceNumber: 1 | 2) {
	if (!mapping) {
		return;
	}

	const visibleRanges = scrollingEditor.getVisibleRanges();
	if (visibleRanges.length === 0) {
		return;
	}
	const topLineNumber = visibleRanges[0].startLineNumber - 1;

	const firstBefore = findLast(mapping, r => r.getInputRange(sourceNumber).startLineNumber <= topLineNumber);
	let sourceRange: LineRange;
	let targetRange: LineRange;

	const targetNumber = sourceNumber === 1 ? 2 : 1;

	const firstBeforeSourceRange = firstBefore?.getInputRange(sourceNumber);
	const firstBeforeTargetRange = firstBefore?.getInputRange(targetNumber);

	if (firstBeforeSourceRange && firstBeforeSourceRange.contains(topLineNumber)) {
		sourceRange = firstBeforeSourceRange;
		targetRange = firstBeforeTargetRange!;
	} else if (firstBeforeSourceRange && firstBeforeSourceRange.isEmpty && firstBeforeSourceRange.startLineNumber === topLineNumber) {
		sourceRange = firstBeforeSourceRange.deltaEnd(1);
		targetRange = firstBeforeTargetRange!.deltaEnd(1);
	} else {
		const delta = firstBeforeSourceRange ? firstBeforeTargetRange!.endLineNumberExclusive - firstBeforeSourceRange.endLineNumberExclusive : 0;
		sourceRange = new LineRange(topLineNumber, 1);
		targetRange = new LineRange(topLineNumber + delta, 1);
	}

	// sourceRange contains topLineNumber!

	const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
	const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);

	const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
	const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);

	const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
	const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;
	/*
		console.log({
			topLineNumber,
			sourceRange: sourceRange.toString(),
			targetRange: targetRange.toString(),
			// resultStartTopPx,
			// resultEndPx,
			// sourceStartTopPx,
			// sourceEndPx,
			factor,
			resultScrollPosition,
			top: scrollingEditor.getScrollTop(),
		});*/

	targetEditor.setScrollTop(resultScrollPosition, ScrollType.Immediate);
}

interface ICodeEditorViewOptions {
	readonly: boolean;
}


abstract class CodeEditorView extends Disposable {
	private readonly _model = new ObservableValue<undefined | MergeEditorModel>(undefined, 'model');
	readonly model: IObservable<undefined | MergeEditorModel> = this._model;

	protected readonly htmlElements = n('div.code-view', [
		n('div.title', { $: 'title' }),
		n('div.container', [
			n('div.gutter', { $: 'gutterDiv' }),
			n('div', { $: 'editor' }),
		]),
	]);

	private readonly _onDidViewChange = new Emitter<IViewSize | undefined>();

	public readonly view: IView = {
		element: this.htmlElements.root,
		minimumWidth: 10,
		maximumWidth: Number.MAX_SAFE_INTEGER,
		minimumHeight: 10,
		maximumHeight: Number.MAX_SAFE_INTEGER,
		onDidChange: this._onDidViewChange.event,

		layout: (width: number, height: number, top: number, left: number) => {
			setStyle(this.htmlElements.root, { width, height, top, left });
			this.editor.layout({
				width: width - this.htmlElements.gutterDiv.clientWidth,
				height: height - this.htmlElements.title.clientHeight,
			});
		}

		// preferredWidth?: number | undefined;
		// preferredHeight?: number | undefined;
		// priority?: LayoutPriority | undefined;
		// snap?: boolean | undefined;
	};

	private readonly _title = new IconLabel(this.htmlElements.title, { supportIcons: true });
	private readonly _detail = new IconLabel(this.htmlElements.title, { supportIcons: true });

	public readonly editor = this.instantiationService.createInstance(
		CodeEditorWidget,
		this.htmlElements.editor,
		{
			minimap: { enabled: false },
			readOnly: this._options.readonly,
			glyphMargin: false,
			lineNumbersMinChars: 2,
		},
		{ contributions: [] }
	);

	constructor(
		private readonly _options: ICodeEditorViewOptions,
		@IInstantiationService
		private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	public setModel(
		model: MergeEditorModel,
		textModel: ITextModel,
		title: string,
		description: string | undefined,
		detail: string | undefined
	): void {
		this.editor.setModel(textModel);
		this._title.setLabel(title, description);
		this._detail.setLabel('', detail);

		this._model.set(model, undefined);
	}
}

class InputCodeEditorView extends CodeEditorView {
	private readonly decorations = derivedObservable('decorations', reader => {
		const model = this.model.read(reader);
		if (!model) {
			return [];
		}
		const result = new Array<IModelDeltaDecoration>();
		for (const m of model.modifiedBaseRanges) {
			const range = m.getInputRange(this.inputNumber);
			if (!range.isEmpty) {
				result.push({
					range: new Range(range.startLineNumber, 1, range.endLineNumberExclusive - 1, 1),
					options: {
						isWholeLine: true,
						className: 'merge-base-range-projection',
						description: 'Base Range Projection'
					}
				});
			}
		}
		return result;
	});

	constructor(
		public readonly inputNumber: 1 | 2,
		options: ICodeEditorViewOptions,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(options, instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => {
					const model = this.model.read(reader);
					if (!model) { return []; }
					return model.modifiedBaseRanges
						.filter((r) => r.getInputDiffs(this.inputNumber).length > 0)
						.map<ModifiedBaseRangeGutterItemInfo>((baseRange, idx) => ({
							id: idx.toString(),
							additionalHeightInPx: 0,
							offsetInPx: 0,
							range: baseRange.getInputRange(this.inputNumber),
							toggleState: derivedObservable('toggle', (reader) =>
								model
									.getState(baseRange)
									.read(reader)
									.getInput(this.inputNumber)
							),
							setState: (value, tx) =>
								model.setState(
									baseRange,
									model
										.getState(baseRange)
										.get()
										.withInputValue(this.inputNumber, value),
									tx
								),
						}));
				},
				createView: (item, target) =>
					new MergeConflictGutterItemView(item, target),
			})
		);
	}
}

interface ModifiedBaseRangeGutterItemInfo extends IGutterItemInfo {
	toggleState: IObservable<boolean | undefined>;
	setState(value: boolean, tx: ITransaction | undefined): void;
}

class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemInfo> {
	constructor(private item: ModifiedBaseRangeGutterItemInfo, private readonly target: HTMLElement) {
		super();

		target.classList.add('merge-accept-gutter-marker');

		// TODO: localized title
		const checkBox = new Toggle({ isChecked: false, title: 'Accept Merge', icon: Codicon.check });
		checkBox.domNode.classList.add('accept-conflict-group');

		this._register(
			autorun((reader) => {
				const value = this.item.toggleState.read(reader);
				checkBox.setIcon(
					value === true
						? Codicon.check
						: value === false
							? undefined
							: Codicon.circleFilled
				);
				checkBox.checked = value === true;
			}, 'Update Toggle State')
		);

		this._register(checkBox.onChange(() => {
			this.item.setState(checkBox.checked, undefined);
		}));

		target.appendChild(n('div.background', [noBreakWhitespace]).root);
		target.appendChild(
			n('div.checkbox', [n('div.checkbox-background', [checkBox.domNode])]).root
		);
	}

	layout(top: number, height: number, viewTop: number, viewHeight: number): void {
		this.target.classList.remove('multi-line');
		this.target.classList.remove('single-line');
		this.target.classList.add(height > 30 ? 'multi-line' : 'single-line');
	}

	update(baseRange: ModifiedBaseRangeGutterItemInfo): void {
		this.item = baseRange;
	}
}

class ResultCodeEditorView extends CodeEditorView {
	private readonly decorations = derivedObservable('decorations', reader => {
		const model = this.model.read(reader);
		if (!model) {
			return [];
		}
		const result = new Array<IModelDeltaDecoration>();
		for (const m of model.resultDiffs.read(reader)) {
			const range = m.modifiedRange;
			if (!range.isEmpty) {
				result.push({
					range: new Range(range.startLineNumber, 1, range.endLineNumberExclusive - 1, 1),
					options: {
						isWholeLine: true,
						// TODO
						className: 'merge-base-range-projection',
						description: 'Result Diff'
					}
				});
			}
		}
		return result;
	});

	constructor(
		options: ICodeEditorViewOptions,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(options, instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));
	}
}
