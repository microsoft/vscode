/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import 'vs/css!./media/dirtydiffDecorator';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { IDisposable, dispose, toDisposable, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, any as anyEvent, filterEvent, once } from 'vs/base/common/event';
import * as ext from 'vs/workbench/common/contributions';
import * as common from 'vs/editor/common/editorCommon';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import URI from 'vs/base/common/uri';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { registerThemingParticipant, ITheme, ICssStyleCollector, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { Color, RGBA } from 'vs/base/common/color';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { PeekViewWidget, PeekContext } from 'vs/editor/contrib/referenceSearch/browser/peekViewWidget';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IRange } from 'vs/editor/common/core/range';

export interface IModelRegistry {
	getModel(editorModel: common.IEditorModel): DirtyDiffModel;
}

class DirtyDiffWidget extends PeekViewWidget {

	constructor(editor: ICodeEditor, model: DirtyDiffModel) {
		super(editor, {});

		model.onDidChange(this.onDidModelChange, this, this._disposables);
		this.create();
	}

	private onDidModelChange(): void {
		console.log('MODEL CHANGED');
	}
}

@editorAction
export class ReferenceAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.dirtydiff.trigger',
			// TODO@joao come up with better name
			label: nls.localize('dirtydiff.action.label', "Trigger Dirty Diff"),
			alias: 'Trigger Dirty Diff',
			precondition: ContextKeyExpr.and(
				// EditorContextKeys.hasReferenceProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_D
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: common.ICommonCodeEditor): void {
		const controller = DirtyDiffController.get(editor);

		if (!controller) {
			return;
		}

		const range = editor.getSelection();
		controller.showWidget(range);
	}
}

@editorContribution
export class DirtyDiffController implements common.IEditorContribution {

	private static ID = 'editor.contrib.dirtydiff';

	static get(editor: common.ICommonCodeEditor): DirtyDiffController {
		return editor.getContribution<DirtyDiffController>(DirtyDiffController.ID);
	}

	_modelRegistry: IModelRegistry | null = null;

	private widget: DirtyDiffWidget | null = null;
	private widgetDisposable: IDisposable = EmptyDisposable;

	constructor(private editor: ICodeEditor) {
		// this.disposables.push(editor.onMouseMove(e => this.onMouseMove(e)));
		// this.disposables.push(editor.onMouseLeave(e => this.onMouseLeave(e)));

		// const widget = new DirtyDiffWidget(editor);
		// widget.

		// editor.
	}

	showWidget(range: IRange): void {
		if (this.widget) {
			return;
		}

		if (!this._modelRegistry) {
			return;
		}

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return;
		}

		const model = this._modelRegistry.getModel(editorModel);

		if (!model) {
			return;
		}

		this.widget = new DirtyDiffWidget(this.editor, model);
		this.widget.setTitle('HELLO');
		this.widget.show(range, 18);

		const disposables: IDisposable[] = [
			this.widget,
			toDisposable(() => this.widget = null)
		];

		once(this.widget.onDidClose)(this.onDidCloseWidget, this, disposables);
		this.widgetDisposable = combinedDisposable(disposables);
	}

	private onDidCloseWidget(): void {
		this.widgetDisposable.dispose();
		this.widgetDisposable = EmptyDisposable;
	}

	// private onMouseMove(e: IEditorMouseEvent): void {
	// 	if (e.target.type === MouseTargetType.GUTTER_LINE_DECORATIONS) {
	// 		console.log(e.target.element);
	// 	}
	// }

	getId(): string {
		return DirtyDiffController.ID;
	}

	dispose(): void {
		return;
	}
}

export const editorGutterModifiedBackground = registerColor('editorGutter.modifiedBackground', {
	dark: Color.fromHex('#00bcf2').transparent(0.6),
	light: Color.fromHex('#007acc').transparent(0.6),
	hc: Color.fromHex('#007acc').transparent(0.6)
}, localize('editorGutterModifiedBackground', "Editor gutter background color for lines that are modified."));

export const editorGutterAddedBackground = registerColor('editorGutter.addedBackground', {
	dark: Color.fromHex('#7fba00').transparent(0.6),
	light: Color.fromHex('#2d883e').transparent(0.6),
	hc: Color.fromHex('#2d883e').transparent(0.6)
}, localize('editorGutterAddedBackground', "Editor gutter background color for lines that are added."));

export const editorGutterDeletedBackground = registerColor('editorGutter.deletedBackground', {
	dark: Color.fromHex('#b9131a').transparent(0.76),
	light: Color.fromHex('#b9131a').transparent(0.76),
	hc: Color.fromHex('#b9131a').transparent(0.76)
}, localize('editorGutterDeletedBackground', "Editor gutter background color for lines that are deleted."));


const overviewRulerDefault = new Color(new RGBA(0, 122, 204, 0.6));
export const overviewRulerModifiedForeground = registerColor('editorOverviewRuler.modifiedForeground', { dark: overviewRulerDefault, light: overviewRulerDefault, hc: overviewRulerDefault }, nls.localize('overviewRulerModifiedForeground', 'Overview ruler marker color for modified content.'));
export const overviewRulerAddedForeground = registerColor('editorOverviewRuler.addedForeground', { dark: overviewRulerDefault, light: overviewRulerDefault, hc: overviewRulerDefault }, nls.localize('overviewRulerAddedForeground', 'Overview ruler marker color for added content.'));
export const overviewRulerDeletedForeground = registerColor('editorOverviewRuler.deletedForeground', { dark: overviewRulerDefault, light: overviewRulerDefault, hc: overviewRulerDefault }, nls.localize('overviewRulerDeletedForeground', 'Overview ruler marker color for deleted content.'));

class DirtyDiffDecorator {

	static MODIFIED_DECORATION_OPTIONS = ModelDecorationOptions.register({
		linesDecorationsClassName: 'dirty-diff-modified-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: themeColorFromId(overviewRulerModifiedForeground),
			darkColor: themeColorFromId(overviewRulerModifiedForeground),
			position: common.OverviewRulerLane.Left
		}
	});

	static ADDED_DECORATION_OPTIONS = ModelDecorationOptions.register({
		linesDecorationsClassName: 'dirty-diff-added-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: themeColorFromId(overviewRulerAddedForeground),
			darkColor: themeColorFromId(overviewRulerAddedForeground),
			position: common.OverviewRulerLane.Left
		}
	});

	static DELETED_DECORATION_OPTIONS = ModelDecorationOptions.register({
		linesDecorationsClassName: 'dirty-diff-deleted-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: themeColorFromId(overviewRulerDeletedForeground),
			darkColor: themeColorFromId(overviewRulerDeletedForeground),
			position: common.OverviewRulerLane.Left
		}
	});

	private decorations: string[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private editorModel: common.IModel,
		private model: DirtyDiffModel
	) {
		model.onDidChange(this.onDidChange, this, this.disposables);
	}

	private onDidChange(diff: common.IChange[]): void {
		const decorations = diff.map((change) => {
			const startLineNumber = change.modifiedStartLineNumber;
			const endLineNumber = change.modifiedEndLineNumber || startLineNumber;

			// Added
			if (change.originalEndLineNumber === 0) {
				return {
					range: {
						startLineNumber: startLineNumber, startColumn: 1,
						endLineNumber: endLineNumber, endColumn: 1
					},
					options: DirtyDiffDecorator.ADDED_DECORATION_OPTIONS
				};
			}

			// Removed
			if (change.modifiedEndLineNumber === 0) {
				return {
					range: {
						startLineNumber: startLineNumber, startColumn: 1,
						endLineNumber: startLineNumber, endColumn: 1
					},
					options: DirtyDiffDecorator.DELETED_DECORATION_OPTIONS
				};
			}

			// Modified
			return {
				range: {
					startLineNumber: startLineNumber, startColumn: 1,
					endLineNumber: endLineNumber, endColumn: 1
				},
				options: DirtyDiffDecorator.MODIFIED_DECORATION_OPTIONS
			};
		});

		this.decorations = this.editorModel.deltaDecorations(this.decorations, decorations);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);

		if (this.editorModel && !this.editorModel.isDisposed()) {
			this.editorModel.deltaDecorations(this.decorations, []);
		}

		this.editorModel = null;
		this.decorations = [];
	}
}

export class DirtyDiffModel {

	private baselineModel: common.IModel;
	private diffDelayer: ThrottledDelayer<common.IChange[]>;
	private _originalURIPromise: TPromise<URI>;
	private repositoryDisposables = new Set<IDisposable[]>();
	private toDispose: IDisposable[] = [];

	private _onDidChange = new Emitter<common.IChange[]>();
	readonly onDidChange: Event<common.IChange[]> = this._onDidChange.event;

	constructor(
		private model: common.IModel,
		@ISCMService private scmService: ISCMService,
		@IModelService private modelService: IModelService,
		@IEditorWorkerService private editorWorkerService: IEditorWorkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextModelService private textModelResolverService: ITextModelService
	) {
		this.diffDelayer = new ThrottledDelayer<common.IChange[]>(200);

		this.toDispose.push(model.onDidChangeContent(() => this.triggerDiff()));
		scmService.onDidAddRepository(this.onDidAddRepository, this, this.toDispose);
		scmService.repositories.forEach(r => this.onDidAddRepository(r));

		this.triggerDiff();
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const disposables: IDisposable[] = [];

		this.repositoryDisposables.add(disposables);
		disposables.push(toDisposable(() => this.repositoryDisposables.delete(disposables)));

		const onDidChange = anyEvent(repository.provider.onDidChange, repository.provider.onDidChangeResources);
		onDidChange(this.triggerDiff, this, disposables);

		const onDidRemoveThis = filterEvent(this.scmService.onDidRemoveRepository, r => r === repository);
		onDidRemoveThis(() => dispose(disposables));

		this.triggerDiff();
	}

	private triggerDiff(): TPromise<any> {
		if (!this.diffDelayer) {
			return TPromise.as(null);
		}

		return this.diffDelayer
			.trigger(() => this.diff())
			.then((diff: common.IChange[]) => {
				if (!this.model || this.model.isDisposed() || !this.baselineModel || this.baselineModel.isDisposed()) {
					return undefined; // disposed
				}

				if (this.baselineModel.getValueLength() === 0) {
					diff = [];
				}

				this._onDidChange.fire(diff);
			});
	}

	private diff(): TPromise<common.IChange[]> {
		return this.getOriginalURIPromise().then(originalURI => {
			if (!this.model || this.model.isDisposed() || !originalURI) {
				return TPromise.as([]); // disposed
			}

			if (!this.editorWorkerService.canComputeDirtyDiff(originalURI, this.model.uri)) {
				return TPromise.as([]); // Files too large
			}

			return this.editorWorkerService.computeDirtyDiff(originalURI, this.model.uri, true);
		});
	}

	private getOriginalURIPromise(): TPromise<URI> {
		if (this._originalURIPromise) {
			return this._originalURIPromise;
		}

		this._originalURIPromise = this.getOriginalResource()
			.then(originalUri => {
				if (!originalUri) {
					return null;
				}

				return this.textModelResolverService.createModelReference(originalUri)
					.then(ref => {
						this.baselineModel = ref.object.textEditorModel;

						this.toDispose.push(ref);
						this.toDispose.push(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));

						return originalUri;
					});
			});

		return always(this._originalURIPromise, () => {
			this._originalURIPromise = null;
		});
	}

	private async getOriginalResource(): TPromise<URI> {
		for (const repository of this.scmService.repositories) {
			const result = repository.provider.getOriginalResource(this.model.uri);

			if (result) {
				return result;
			}
		}

		return null;
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);

		this.model = null;
		this.baselineModel = null;

		if (this.diffDelayer) {
			this.diffDelayer.cancel();
			this.diffDelayer = null;
		}

		this.repositoryDisposables.forEach(d => dispose(d));
		this.repositoryDisposables.clear();
	}
}

class DirtyDiffItem {

	constructor(readonly model: DirtyDiffModel, readonly decorator: DirtyDiffDecorator) { }

	dispose(): void {
		this.decorator.dispose();
		this.model.dispose();
	}
}

export class DirtyDiffWorkbenchController implements ext.IWorkbenchContribution, IModelRegistry {

	private models: common.IModel[] = [];
	private items: { [modelId: string]: DirtyDiffItem; } = Object.create(null);
	private toDispose: IDisposable[] = [];

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.toDispose.push(editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
	}

	getId(): string {
		return 'git.DirtyDiffModelDecorator';
	}

	private onEditorsChanged(): void {
		// HACK: This is the best current way of figuring out whether to draw these decorations
		// or not. Needs context from the editor, to know whether it is a diff editor, in place editor
		// etc.

		const models = this.editorService.getVisibleEditors()

			// map to the editor controls
			.map(e => e.getControl())

			// only interested in code editor widgets
			.filter(c => c instanceof CodeEditor)

			// map to models
			.map(editor => ({ model: (editor as CodeEditor).getModel(), controller: DirtyDiffController.get(editor as CodeEditor) }))

			// remove nulls and duplicates
			.filter((o, i, a) => !!o.model && !!o.model.uri && a.indexOf(o, i + 1) === -1);

		const newModels = models.filter(o => this.models.every(m => o.model !== m));
		const oldModels = this.models.filter(m => models.every(o => o.model !== m));

		oldModels.forEach(m => this.onModelInvisible(m));
		newModels.forEach(({ model, controller }) => {
			controller._modelRegistry = this;
			this.onModelVisible(model);
		});

		this.models = models.map(({ model }) => model);
	}

	private onModelVisible(editorModel: common.IModel): void {
		const model = this.instantiationService.createInstance(DirtyDiffModel, editorModel);
		const decorator = new DirtyDiffDecorator(editorModel, model);

		this.items[editorModel.id] = new DirtyDiffItem(model, decorator);
	}

	private onModelInvisible(editorModel: common.IModel): void {
		this.items[editorModel.id].dispose();
		delete this.items[editorModel.id];
	}

	getModel(editorModel: common.IModel): DirtyDiffModel | null {
		const item = this.items[editorModel.id];

		if (!item) {
			return null;
		}

		return item.model;
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		this.models.forEach(m => this.items[m.id].dispose());

		this.models = null;
		this.items = null;
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const editorGutterModifiedBackgroundColor = theme.getColor(editorGutterModifiedBackground);
	if (editorGutterModifiedBackgroundColor) {
		collector.addRule(`.monaco-editor .dirty-diff-modified-glyph { border-left: 3px solid ${editorGutterModifiedBackgroundColor}; }`);
	}

	const editorGutterAddedBackgroundColor = theme.getColor(editorGutterAddedBackground);
	if (editorGutterAddedBackgroundColor) {
		collector.addRule(`.monaco-editor .dirty-diff-added-glyph { border-left: 3px solid ${editorGutterAddedBackgroundColor}; }`);
	}

	const editorGutteDeletedBackgroundColor = theme.getColor(editorGutterDeletedBackground);
	if (editorGutteDeletedBackgroundColor) {
		collector.addRule(`
			.monaco-editor .dirty-diff-deleted-glyph:after {
				border-top: 4px solid transparent;
				border-bottom: 4px solid transparent;
				border-left: 4px solid ${editorGutteDeletedBackgroundColor};
			}
		`);
	}
});
