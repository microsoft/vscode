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
import { registerThemingParticipant, ITheme, ICssStyleCollector, themeColorFromId, IThemeService } from 'vs/platform/theme/common/themeService';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { Color, RGBA } from 'vs/base/common/color';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { editorAction, ServicesAccessor, EditorAction, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { PeekViewWidget, getOuterEditor } from 'vs/editor/contrib/referenceSearch/browser/peekViewWidget';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Position } from 'vs/editor/common/core/position';
import { rot } from 'vs/base/common/numbers';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground } from 'vs/editor/contrib/referenceSearch/browser/referencesWidget';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Action } from 'vs/base/common/actions';
import { IActionBarOptions, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { basename } from 'vs/base/common/paths';

export interface IModelRegistry {
	getModel(editorModel: common.IEditorModel): DirtyDiffModel;
}

export const isDirtyDiffVisible = new RawContextKey<boolean>('dirtyDiffVisible', false);

function getChangeHeight(change: common.IChange): number {
	const modified = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
	const original = change.originalEndLineNumber - change.originalStartLineNumber + 1;

	if (change.originalEndLineNumber === 0) {
		return modified;
	} else if (change.modifiedEndLineNumber === 0) {
		return original;
	} else {
		return modified + original;
	}
}

function getModifiedEndLineNumber(change: common.IChange): number {
	if (change.modifiedEndLineNumber === 0) {
		return change.modifiedStartLineNumber;
	} else {
		return change.modifiedEndLineNumber;
	}
}

function getModifiedMiddleLineNumber(change: common.IChange): number {
	if (change.modifiedEndLineNumber === 0) {
		return change.modifiedStartLineNumber;
	} else {
		return Math.round((change.modifiedEndLineNumber + change.modifiedStartLineNumber) / 2);
	}
}

class UIEditorAction extends Action {

	private editor: common.ICommonCodeEditor;
	private action: EditorAction;
	private instantiationService: IInstantiationService;

	constructor(
		editor: common.ICommonCodeEditor,
		action: EditorAction,
		cssClass: string,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const keybinding = keybindingService.lookupKeybinding(action.id);
		const label = action.label + (keybinding ? ` (${keybinding.getLabel()})` : '');

		super(action.id, label, cssClass);

		this.instantiationService = instantiationService;
		this.action = action;
		this.editor = editor;
	}

	run(): TPromise<any> {
		return TPromise.wrap(this.instantiationService.invokeFunction(accessor => this.action.run(accessor, this.editor, null)));
	}
}

class DirtyDiffWidget extends PeekViewWidget {

	private diffEditor: EmbeddedDiffEditorWidget;
	private title: string;
	private change: common.IChange;
	private didLayout = false;

	constructor(
		editor: ICodeEditor,
		private model: DirtyDiffModel,
		themeService: IThemeService,
		private instantiationService: IInstantiationService
	) {
		super(editor, { isResizeable: true });

		themeService.onThemeChange(this._applyTheme, this, this._disposables);
		this._applyTheme(themeService.getTheme());

		this.create();

		this.title = basename(editor.getModel().uri.fsPath);
		this.setTitle(this.title);
	}

	showChange(index: number): void {
		const change = this.model.changes[index];
		this.change = change;

		const originalModel = this.model.original;

		if (!originalModel) {
			return;
		}

		const onFirstDiffUpdate = once(this.diffEditor.onDidUpdateDiff);

		// TODO@joao TODO@alex need this setTimeout probably because the
		// non-side-by-side diff still hasn't created the view zones
		onFirstDiffUpdate(() => setTimeout(() => this.revealChange(change), 0));

		this.diffEditor.setModel(this.model);

		const position = new Position(getModifiedEndLineNumber(change), 1);
		const height = getChangeHeight(change) + /* padding */ 8;

		const detail = this.model.changes.length > 1
			? localize('changes', "{0} of {1} changes", index + 1, this.model.changes.length)
			: localize('change', "{0} of {1} change", index + 1, this.model.changes.length);

		this.setTitle(this.title, detail);

		this.show(position, height);
	}

	protected _fillHead(container: HTMLElement): void {
		super._fillHead(container);

		const previous = this.instantiationService.createInstance(UIEditorAction, this.editor, new ShowPreviousChangeAction(), 'show-previous-change octicon octicon-chevron-up');
		const next = this.instantiationService.createInstance(UIEditorAction, this.editor, new ShowNextChangeAction(), 'show-next-change octicon octicon-chevron-down');

		this._disposables.push(previous);
		this._disposables.push(next);
		this._actionbarWidget.push([previous, next], { label: false, icon: true });
	}

	protected _getActionBarOptions(): IActionBarOptions {
		return {
			orientation: ActionsOrientation.HORIZONTAL_REVERSE
		};
	}

	protected _fillBody(container: HTMLElement): void {
		const options: IDiffEditorOptions = {
			scrollBeyondLastLine: true,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: { enabled: false },
			renderSideBySide: false
		};

		this.diffEditor = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, container, options, this.editor);
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);
		this.diffEditor.layout({ height: heightInPixel, width: widthInPixel });

		if (!this.didLayout) {
			this.revealChange(this.change);
			this.didLayout = true;
		}
	}

	private revealChange(change: common.IChange): void {
		const position = new Position(getModifiedMiddleLineNumber(this.change), 1);
		this.diffEditor.revealPositionInCenter(position, common.ScrollType.Immediate);
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}
}

@editorAction
export class ShowPreviousChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.dirtydiff.previous',
			label: nls.localize('show previous change', "Show Previous Change"),
			alias: 'Show Previous Change',
			precondition: ContextKeyExpr.and(EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: { kbExpr: EditorContextKeys.textFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_S }
		});
	}

	run(accessor: ServicesAccessor, editor: common.ICommonCodeEditor): void {
		const controller = DirtyDiffController.get(editor);

		if (!controller) {
			return;
		}

		controller.previous();
	}
}

@editorAction
export class ShowNextChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.dirtydiff.next',
			label: nls.localize('show next change', "Show Next Change"),
			alias: 'Show Next Change',
			precondition: ContextKeyExpr.and(EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: { kbExpr: EditorContextKeys.textFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F }
		});
	}

	run(accessor: ServicesAccessor, editor: common.ICommonCodeEditor): void {
		const controller = DirtyDiffController.get(editor);

		if (!controller) {
			return;
		}

		controller.next();
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeDirtyDiff',
	weight: CommonEditorRegistry.commandWeight(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(isDirtyDiffVisible, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: (accessor: ServicesAccessor) => {
		const editor = getOuterEditor(accessor);
		if (!editor) {
			return;
		}

		const controller = DirtyDiffController.get(editor);

		if (!controller) {
			return;
		}

		controller.close();
	}
});

@editorContribution
export class DirtyDiffController implements common.IEditorContribution {

	private static ID = 'editor.contrib.dirtydiff';

	static get(editor: common.ICommonCodeEditor): DirtyDiffController {
		return editor.getContribution<DirtyDiffController>(DirtyDiffController.ID);
	}

	modelRegistry: IModelRegistry | null = null;

	private model: DirtyDiffModel | null = null;
	private widget: DirtyDiffWidget | null = null;
	private changeIndex: number = -1;
	private readonly isDirtyDiffVisible: IContextKey<boolean>;
	private session: IDisposable = EmptyDisposable;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.isDirtyDiffVisible = isDirtyDiffVisible.bindTo(contextKeyService);
	}

	getId(): string {
		return DirtyDiffController.ID;
	}

	next(): void {
		if (!this.assertWidget()) {
			return;
		}

		if (this.changeIndex === -1) {
			this.changeIndex = this.findNextClosestChange(this.editor.getPosition().lineNumber);
		} else {
			this.changeIndex = rot(this.changeIndex + 1, this.model.changes.length);
		}

		this.widget.showChange(this.changeIndex);
	}

	previous(): void {
		if (!this.assertWidget()) {
			return;
		}

		if (this.changeIndex === -1) {
			this.changeIndex = this.findPreviousClosestChange(this.editor.getPosition().lineNumber);
		} else {
			this.changeIndex = rot(this.changeIndex - 1, this.model.changes.length);
		}

		this.widget.showChange(this.changeIndex);
	}

	close(): void {
		this.session.dispose();
		this.session = EmptyDisposable;
	}

	private assertWidget(): boolean {
		if (this.widget) {
			if (this.model.changes.length === 0) {
				this.close();
				return false;
			}

			return true;
			// this.widget.dispose();
			// this.widget = null;
		}

		if (!this.modelRegistry) {
			return false;
		}

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return false;
		}

		const model = this.modelRegistry.getModel(editorModel);

		if (!model) {
			return false;
		}

		if (model.changes.length === 0) {
			return false;
		}

		this.changeIndex = -1;
		this.model = model;
		this.widget = new DirtyDiffWidget(this.editor, model, this.themeService, this.instantiationService);
		this.isDirtyDiffVisible.set(true);

		// TODO react on model changes

		// const range = editor.getSelection();
		// this.widget.show(range, 18);

		const disposables: IDisposable[] = [];
		once(this.widget.onDidClose)(this.close, this, disposables);

		disposables.push(
			this.widget,
			toDisposable(() => this.model = this.widget = null),
			toDisposable(() => this.isDirtyDiffVisible.set(false))
		);

		this.session = combinedDisposable(disposables);
		return true;
	}

	private findNextClosestChange(lineNumber: number): number {
		for (let i = 0; i < this.model.changes.length; i++) {
			const change = this.model.changes[i];

			if (getModifiedEndLineNumber(change) >= lineNumber) {
				return i;
			}
		}

		return 0;
	}

	private findPreviousClosestChange(lineNumber: number): number {
		for (let i = this.model.changes.length - 1; i >= 0; i--) {
			const change = this.model.changes[i];

			if (change.modifiedStartLineNumber <= lineNumber) {
				return i;
			}
		}

		return 0;
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

	private _originalModel: common.IModel;
	get original(): common.IModel { return this._originalModel; }
	get modified(): common.IModel { return this._editorModel; }

	private diffDelayer: ThrottledDelayer<common.IChange[]>;
	private _originalURIPromise: TPromise<URI>;
	private repositoryDisposables = new Set<IDisposable[]>();
	private disposables: IDisposable[] = [];

	private _onDidChange = new Emitter<common.IChange[]>();
	readonly onDidChange: Event<common.IChange[]> = this._onDidChange.event;

	private _changes: common.IChange[] = [];
	get changes(): common.IChange[] {
		return this._changes;
	}

	constructor(
		private _editorModel: common.IModel,
		@ISCMService private scmService: ISCMService,
		@IModelService private modelService: IModelService,
		@IEditorWorkerService private editorWorkerService: IEditorWorkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextModelService private textModelResolverService: ITextModelService
	) {
		this.diffDelayer = new ThrottledDelayer<common.IChange[]>(200);

		this.disposables.push(_editorModel.onDidChangeContent(() => this.triggerDiff()));
		scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
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
			.then((changes: common.IChange[]) => {
				if (!this._editorModel || this._editorModel.isDisposed() || !this._originalModel || this._originalModel.isDisposed()) {
					return undefined; // disposed
				}

				if (this._originalModel.getValueLength() === 0) {
					changes = [];
				}

				this._changes = changes;
				this._onDidChange.fire(changes);
			});
	}

	private diff(): TPromise<common.IChange[]> {
		return this.getOriginalURIPromise().then(originalURI => {
			if (!this._editorModel || this._editorModel.isDisposed() || !originalURI) {
				return TPromise.as([]); // disposed
			}

			if (!this.editorWorkerService.canComputeDirtyDiff(originalURI, this._editorModel.uri)) {
				return TPromise.as([]); // Files too large
			}

			return this.editorWorkerService.computeDirtyDiff(originalURI, this._editorModel.uri, true);
		});
	}

	private getOriginalURIPromise(): TPromise<URI> {
		if (this._originalURIPromise) {
			return this._originalURIPromise;
		}

		this._originalURIPromise = this.getOriginalResource()
			.then(originalUri => {
				if (!originalUri) {
					this._originalModel = null;
					return null;
				}

				return this.textModelResolverService.createModelReference(originalUri)
					.then(ref => {
						this._originalModel = ref.object.textEditorModel;

						this.disposables.push(ref);
						this.disposables.push(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));

						return originalUri;
					});
			});

		return always(this._originalURIPromise, () => {
			this._originalURIPromise = null;
		});
	}

	private async getOriginalResource(): TPromise<URI> {
		for (const repository of this.scmService.repositories) {
			const result = repository.provider.getOriginalResource(this._editorModel.uri);

			if (result) {
				return result;
			}
		}

		return null;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);

		this._editorModel = null;
		this._originalModel = null;

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
	private disposables: IDisposable[] = [];

	constructor(
		@IMessageService private messageService: IMessageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.disposables.push(editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
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

			// set model registry and map to models
			.map(editor => {
				const codeEditor = editor as CodeEditor;
				const controller = DirtyDiffController.get(codeEditor);
				controller.modelRegistry = this;
				return codeEditor.getModel();
			})

			// remove nulls and duplicates
			.filter((m, i, a) => !!m && !!m.uri && a.indexOf(m, i + 1) === -1);

		const newModels = models.filter(o => this.models.every(m => o !== m));
		const oldModels = this.models.filter(m => models.every(o => o !== m));

		oldModels.forEach(m => this.onModelInvisible(m));
		newModels.forEach(m => this.onModelVisible(m));

		this.models = models;
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
		this.disposables = dispose(this.disposables);
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
