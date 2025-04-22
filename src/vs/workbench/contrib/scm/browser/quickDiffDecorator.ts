/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

import './media/dirtydiffDecorator.css';
import { Disposable, DisposableStore, DisposableMap, IReference } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { OverviewRulerLane, IModelDecorationOptions, MinimapPosition, IModelDeltaDecoration } from '../../../../editor/common/model.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChangeType, getChangeType, IQuickDiffService, QuickDiffProvider, minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../common/quickDiff.js';
import { QuickDiffModel, IQuickDiffModelService } from './quickDiffModel.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ContextKeyTrueExpr, ContextKeyFalseExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { autorun, autorunWithStore, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export const quickDiffDecorationCount = new RawContextKey<number>('quickDiffDecorationCount', 0);

class QuickDiffDecorator extends Disposable {

	static createDecoration(className: string, tooltip: string | null, options: { gutter: boolean; overview: { active: boolean; color: string }; minimap: { active: boolean; color: string }; isWholeLine: boolean }): ModelDecorationOptions {
		const decorationOptions: IModelDecorationOptions = {
			description: 'dirty-diff-decoration',
			isWholeLine: options.isWholeLine,
		};

		if (options.gutter) {
			decorationOptions.linesDecorationsClassName = `dirty-diff-glyph ${className}`;
			decorationOptions.linesDecorationsTooltip = tooltip;
		}

		if (options.overview.active) {
			decorationOptions.overviewRuler = {
				color: themeColorFromId(options.overview.color),
				position: OverviewRulerLane.Left
			};
		}

		if (options.minimap.active) {
			decorationOptions.minimap = {
				color: themeColorFromId(options.minimap.color),
				position: MinimapPosition.Gutter
			};
		}

		return ModelDecorationOptions.createDynamic(decorationOptions);
	}

	private addedOptions: ModelDecorationOptions;
	private addedSecondaryOptions: ModelDecorationOptions;
	private addedPatternOptions: ModelDecorationOptions;
	private addedSecondaryPatternOptions: ModelDecorationOptions;
	private modifiedOptions: ModelDecorationOptions;
	private modifiedSecondaryOptions: ModelDecorationOptions;
	private modifiedPatternOptions: ModelDecorationOptions;
	private modifiedSecondaryPatternOptions: ModelDecorationOptions;
	private deletedOptions: ModelDecorationOptions;
	private deletedSecondaryOptions: ModelDecorationOptions;
	private decorationsCollection: IEditorDecorationsCollection | undefined;

	constructor(
		private readonly codeEditor: ICodeEditor,
		private readonly quickDiffModelRef: IReference<QuickDiffModel>,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const decorations = configurationService.getValue<string>('scm.diffDecorations');
		const gutter = decorations === 'all' || decorations === 'gutter';
		const overview = decorations === 'all' || decorations === 'overview';
		const minimap = decorations === 'all' || decorations === 'minimap';

		const diffAdded = nls.localize('diffAdded', 'Added lines');
		const diffAddedOptions = {
			gutter,
			overview: { active: overview, color: overviewRulerAddedForeground },
			minimap: { active: minimap, color: minimapGutterAddedBackground },
			isWholeLine: true
		};
		this.addedOptions = QuickDiffDecorator.createDecoration('dirty-diff-added primary', diffAdded, diffAddedOptions);
		this.addedPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-added primary pattern', diffAdded, diffAddedOptions);
		this.addedSecondaryOptions = QuickDiffDecorator.createDecoration('dirty-diff-added secondary', diffAdded, diffAddedOptions);
		this.addedSecondaryPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-added secondary pattern', diffAdded, diffAddedOptions);

		const diffModified = nls.localize('diffModified', 'Changed lines');
		const diffModifiedOptions = {
			gutter,
			overview: { active: overview, color: overviewRulerModifiedForeground },
			minimap: { active: minimap, color: minimapGutterModifiedBackground },
			isWholeLine: true
		};
		this.modifiedOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified primary', diffModified, diffModifiedOptions);
		this.modifiedPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified primary pattern', diffModified, diffModifiedOptions);
		this.modifiedSecondaryOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified secondary', diffModified, diffModifiedOptions);
		this.modifiedSecondaryPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified secondary pattern', diffModified, diffModifiedOptions);

		const diffDeleted = nls.localize('diffDeleted', 'Removed lines');
		const diffDeletedOptions = {
			gutter,
			overview: { active: overview, color: overviewRulerDeletedForeground },
			minimap: { active: minimap, color: minimapGutterDeletedBackground },
			isWholeLine: false
		};
		this.deletedOptions = QuickDiffDecorator.createDecoration('dirty-diff-deleted primary', diffDeleted, diffDeletedOptions);
		this.deletedSecondaryOptions = QuickDiffDecorator.createDecoration('dirty-diff-deleted secondary', diffDeleted, diffDeletedOptions);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('scm.diffDecorationsGutterPattern')) {
				this.onDidChange();
			}
		}));

		this._register(Event.runAndSubscribe(this.quickDiffModelRef.object.onDidChange, () => this.onDidChange()));
	}

	private onDidChange(): void {
		if (!this.codeEditor.hasModel()) {
			return;
		}

		const pattern = this.configurationService.getValue<{ added: boolean; modified: boolean }>('scm.diffDecorationsGutterPattern');

		const primaryQuickDiff = this.quickDiffModelRef.object.quickDiffs.find(quickDiff => quickDiff.kind === 'primary');
		const primaryQuickDiffChanges = this.quickDiffModelRef.object.changes.filter(labeledChange => labeledChange.label === primaryQuickDiff?.label);

		const decorations: IModelDeltaDecoration[] = [];
		for (const change of this.quickDiffModelRef.object.changes) {
			const quickDiff = this.quickDiffModelRef.object.quickDiffs
				.find(quickDiff => quickDiff.label === change.label);

			if (!quickDiff?.visible) {
				// Not visible
				continue;
			}

			if (quickDiff.kind !== 'primary' && primaryQuickDiffChanges.some(c => c.change2.modified.overlapOrTouch(change.change2.modified))) {
				// Overlap with primary quick diff changes
				continue;
			}

			const changeType = getChangeType(change.change);
			const startLineNumber = change.change.modifiedStartLineNumber;
			const endLineNumber = change.change.modifiedEndLineNumber || startLineNumber;

			switch (changeType) {
				case ChangeType.Add:
					decorations.push({
						range: {
							startLineNumber: startLineNumber, startColumn: 1,
							endLineNumber: endLineNumber, endColumn: 1
						},
						options: quickDiff.kind === 'primary' || quickDiff.kind === 'contributed'
							? pattern.added ? this.addedPatternOptions : this.addedOptions
							: pattern.added ? this.addedSecondaryPatternOptions : this.addedSecondaryOptions
					});
					break;
				case ChangeType.Delete:
					decorations.push({
						range: {
							startLineNumber: startLineNumber, startColumn: Number.MAX_VALUE,
							endLineNumber: startLineNumber, endColumn: Number.MAX_VALUE
						},
						options: quickDiff.kind === 'primary' || quickDiff.kind === 'contributed'
							? this.deletedOptions
							: this.deletedSecondaryOptions
					});
					break;
				case ChangeType.Modify:
					decorations.push({
						range: {
							startLineNumber: startLineNumber, startColumn: 1,
							endLineNumber: endLineNumber, endColumn: 1
						},
						options: quickDiff.kind === 'primary' || quickDiff.kind === 'contributed'
							? pattern.modified ? this.modifiedPatternOptions : this.modifiedOptions
							: pattern.modified ? this.modifiedSecondaryPatternOptions : this.modifiedSecondaryOptions
					});
					break;
			}
		}

		if (!this.decorationsCollection) {
			this.decorationsCollection = this.codeEditor.createDecorationsCollection(decorations);
		} else {
			this.decorationsCollection.set(decorations);
		}
	}

	override dispose(): void {
		if (this.decorationsCollection) {
			this.decorationsCollection.clear();
		}
		this.decorationsCollection = undefined;
		this.quickDiffModelRef.dispose();
		super.dispose();
	}
}

interface QuickDiffWorkbenchControllerViewState {
	readonly width: number;
	readonly visibility: 'always' | 'hover';
}

export class QuickDiffWorkbenchController extends Disposable implements IWorkbenchContribution {

	private enabled = false;
	private readonly quickDiffDecorationCount: IContextKey<number>;

	private readonly activeEditor: IObservable<EditorInput | undefined>;
	private readonly quickDiffProviders: IObservable<readonly QuickDiffProvider[]>;

	// Resource URI -> Code Editor Id -> Decoration (Disposable)
	private readonly decorators = new ResourceMap<DisposableMap<string>>();
	private viewState: QuickDiffWorkbenchControllerViewState = { width: 3, visibility: 'always' };
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly stylesheet: HTMLStyleElement;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickDiffModelService private readonly quickDiffModelService: IQuickDiffModelService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.stylesheet = domStylesheetsJs.createStyleSheet(undefined, undefined, this._store);

		this.quickDiffDecorationCount = quickDiffDecorationCount.bindTo(contextKeyService);

		this.activeEditor = observableFromEvent(this,
			this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);

		this.quickDiffProviders = observableFromEvent(this,
			this.quickDiffService.onDidChangeQuickDiffProviders, () => this.quickDiffService.providers);

		const onDidChangeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorations'));
		this._register(onDidChangeConfiguration(this.onDidChangeConfiguration, this));
		this.onDidChangeConfiguration();

		const onDidChangeDiffWidthConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterWidth'));
		this._register(onDidChangeDiffWidthConfiguration(this.onDidChangeDiffWidthConfiguration, this));
		this.onDidChangeDiffWidthConfiguration();

		const onDidChangeDiffVisibilityConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterVisibility'));
		this._register(onDidChangeDiffVisibilityConfiguration(this.onDidChangeDiffVisibilityConfiguration, this));
		this.onDidChangeDiffVisibilityConfiguration();
	}

	private onDidChangeConfiguration(): void {
		const enabled = this.configurationService.getValue<string>('scm.diffDecorations') !== 'none';

		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private onDidChangeDiffWidthConfiguration(): void {
		let width = this.configurationService.getValue<number>('scm.diffDecorationsGutterWidth');

		if (isNaN(width) || width <= 0 || width > 5) {
			width = 3;
		}

		this.setViewState({ ...this.viewState, width });
	}

	private onDidChangeDiffVisibilityConfiguration(): void {
		const visibility = this.configurationService.getValue<'always' | 'hover'>('scm.diffDecorationsGutterVisibility');
		this.setViewState({ ...this.viewState, visibility });
	}

	private setViewState(state: QuickDiffWorkbenchControllerViewState): void {
		this.viewState = state;
		this.stylesheet.textContent = `
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified {
				border-left-width:${state.width}px;
			}
			.monaco-editor .dirty-diff-added.pattern,
			.monaco-editor .dirty-diff-added.pattern:before,
			.monaco-editor .dirty-diff-modified.pattern,
			.monaco-editor .dirty-diff-modified.pattern:before {
				background-size: ${state.width}px ${state.width}px;
			}
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified,
			.monaco-editor .dirty-diff-deleted {
				opacity: ${state.visibility === 'always' ? 1 : 0};
			}
		`;
	}

	private enable(): void {
		if (this.enabled) {
			this.disable();
		}

		this.transientDisposables.add(Event.any(this.editorService.onDidCloseEditor, this.editorService.onDidVisibleEditorsChange)(() => this.onEditorsChanged()));
		this.onEditorsChanged();

		this.onDidActiveEditorChange();
		this.onDidChangeQuickDiffProviders();

		this.enabled = true;
	}

	private disable(): void {
		if (!this.enabled) {
			return;
		}

		this.transientDisposables.clear();
		this.quickDiffDecorationCount.set(0);

		for (const [uri, decoratorMap] of this.decorators.entries()) {
			decoratorMap.dispose();
			this.decorators.delete(uri);
		}

		this.enabled = false;
	}

	private onDidActiveEditorChange(): void {
		this.transientDisposables.add(autorunWithStore((reader, store) => {
			const activeEditor = this.activeEditor.read(reader);
			const activeTextEditorControl = this.editorService.activeTextEditorControl;

			if (!isCodeEditor(activeTextEditorControl) || !activeEditor?.resource) {
				this.quickDiffDecorationCount.set(0);
				return;
			}

			const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(activeEditor.resource);
			if (!quickDiffModelRef) {
				this.quickDiffDecorationCount.set(0);
				return;
			}

			store.add(quickDiffModelRef);

			const visibleDecorationCount = observableFromEvent(this,
				quickDiffModelRef.object.onDidChange, () => {
					const visibleQuickDiffs = quickDiffModelRef.object.quickDiffs.filter(quickDiff => quickDiff.visible);
					return quickDiffModelRef.object.changes.filter(labeledChange => visibleQuickDiffs.some(quickDiff => quickDiff.label === labeledChange.label)).length;
				});

			store.add(autorun(reader => {
				const count = visibleDecorationCount.read(reader);
				this.quickDiffDecorationCount.set(count);
			}));
		}));
	}

	private onDidChangeQuickDiffProviders(): void {
		this.transientDisposables.add(autorunWithStore((reader, store) => {
			const providers = this.quickDiffProviders.read(reader);

			for (let index = 0; index < providers.length; index++) {
				const provider = providers[index];
				const visible = this.quickDiffService.isQuickDiffProviderVisible(provider.id);
				const group = provider.kind !== 'contributed' ? '0_scm' : '1_contributed';
				const order = index + 1;

				store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: `workbench.scm.action.toggleQuickDiffVisibility.${provider.id}`,
							title: provider.label,
							toggled: visible ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE,
							menu: {
								id: MenuId.SCMQuickDiffDecorations, group, order
							},
							f1: false
						});
					}
					override run(accessor: ServicesAccessor): void {
						const quickDiffService = accessor.get(IQuickDiffService);
						quickDiffService.toggleQuickDiffProviderVisibility(provider.id);
					}
				}));
			}
		}));
	}

	private onEditorsChanged(): void {
		for (const editor of this.editorService.visibleTextEditorControls) {
			if (!isCodeEditor(editor)) {
				continue;
			}

			const textModel = editor.getModel();
			if (!textModel) {
				continue;
			}

			const editorId = editor.getId();
			if (this.decorators.get(textModel.uri)?.has(editorId)) {
				continue;
			}

			const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(textModel.uri);
			if (!quickDiffModelRef) {
				continue;
			}

			if (!this.decorators.has(textModel.uri)) {
				this.decorators.set(textModel.uri, new DisposableMap<string>());
			}

			this.decorators.get(textModel.uri)!.set(editorId, new QuickDiffDecorator(editor, quickDiffModelRef, this.configurationService));
		}

		// Dispose decorators for editors that are no longer visible.
		for (const [uri, decoratorMap] of this.decorators.entries()) {
			for (const editorId of decoratorMap.keys()) {
				const codeEditor = this.editorService.visibleTextEditorControls
					.find(editor => isCodeEditor(editor) && editor.getId() === editorId &&
						this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));

				if (!codeEditor) {
					decoratorMap.deleteAndDispose(editorId);
				}
			}

			if (decoratorMap.size === 0) {
				decoratorMap.dispose();
				this.decorators.delete(uri);
			}
		}
	}

	override dispose(): void {
		this.disable();
		super.dispose();
	}
}
