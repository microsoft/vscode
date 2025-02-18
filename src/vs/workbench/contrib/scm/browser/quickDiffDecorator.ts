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
import { OverviewRulerLane, IModelDecorationOptions, MinimapPosition } from '../../../../editor/common/model.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChangeType, getChangeType, minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../common/quickDiff.js';
import { QuickDiffModel, IQuickDiffModelService } from './quickDiffModel.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { autorun, autorunWithStore, observableFromEvent } from '../../../../base/common/observable.js';

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
	private addedPatternOptions: ModelDecorationOptions;
	private modifiedOptions: ModelDecorationOptions;
	private modifiedPatternOptions: ModelDecorationOptions;
	private deletedOptions: ModelDecorationOptions;
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
		this.addedOptions = QuickDiffDecorator.createDecoration('dirty-diff-added', diffAdded, {
			gutter,
			overview: { active: overview, color: overviewRulerAddedForeground },
			minimap: { active: minimap, color: minimapGutterAddedBackground },
			isWholeLine: true
		});
		this.addedPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-added-pattern', diffAdded, {
			gutter,
			overview: { active: overview, color: overviewRulerAddedForeground },
			minimap: { active: minimap, color: minimapGutterAddedBackground },
			isWholeLine: true
		});
		const diffModified = nls.localize('diffModified', 'Changed lines');
		this.modifiedOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified', diffModified, {
			gutter,
			overview: { active: overview, color: overviewRulerModifiedForeground },
			minimap: { active: minimap, color: minimapGutterModifiedBackground },
			isWholeLine: true
		});
		this.modifiedPatternOptions = QuickDiffDecorator.createDecoration('dirty-diff-modified-pattern', diffModified, {
			gutter,
			overview: { active: overview, color: overviewRulerModifiedForeground },
			minimap: { active: minimap, color: minimapGutterModifiedBackground },
			isWholeLine: true
		});
		this.deletedOptions = QuickDiffDecorator.createDecoration('dirty-diff-deleted', nls.localize('diffDeleted', 'Removed lines'), {
			gutter,
			overview: { active: overview, color: overviewRulerDeletedForeground },
			minimap: { active: minimap, color: minimapGutterDeletedBackground },
			isWholeLine: false
		});

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

		const visibleQuickDiffs = this.quickDiffModelRef.object.quickDiffs.filter(quickDiff => quickDiff.visible);
		const pattern = this.configurationService.getValue<{ added: boolean; modified: boolean }>('scm.diffDecorationsGutterPattern');

		const decorations = this.quickDiffModelRef.object.changes
			.filter(labeledChange => visibleQuickDiffs.some(quickDiff => quickDiff.label === labeledChange.label))
			.map((labeledChange) => {
				const change = labeledChange.change;
				const changeType = getChangeType(change);
				const startLineNumber = change.modifiedStartLineNumber;
				const endLineNumber = change.modifiedEndLineNumber || startLineNumber;

				switch (changeType) {
					case ChangeType.Add:
						return {
							range: {
								startLineNumber: startLineNumber, startColumn: 1,
								endLineNumber: endLineNumber, endColumn: 1
							},
							options: pattern.added ? this.addedPatternOptions : this.addedOptions
						};
					case ChangeType.Delete:
						return {
							range: {
								startLineNumber: startLineNumber, startColumn: Number.MAX_VALUE,
								endLineNumber: startLineNumber, endColumn: Number.MAX_VALUE
							},
							options: this.deletedOptions
						};
					case ChangeType.Modify:
						return {
							range: {
								startLineNumber: startLineNumber, startColumn: 1,
								endLineNumber: endLineNumber, endColumn: 1
							},
							options: pattern.modified ? this.modifiedPatternOptions : this.modifiedOptions
						};
				}
			});

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

	private readonly activeEditor = observableFromEvent(this,
		this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);

	// Resource URI -> Code Editor Id -> Decoration (Disposable)
	private readonly decorators = new ResourceMap<DisposableMap<string>>();
	private viewState: QuickDiffWorkbenchControllerViewState = { width: 3, visibility: 'always' };
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly stylesheet: HTMLStyleElement;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickDiffModelService private readonly quickDiffModelService: IQuickDiffModelService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.stylesheet = domStylesheetsJs.createStyleSheet(undefined, undefined, this._store);

		this.quickDiffDecorationCount = quickDiffDecorationCount.bindTo(contextKeyService);

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
			.monaco-editor .dirty-diff-added-pattern,
			.monaco-editor .dirty-diff-added-pattern:before,
			.monaco-editor .dirty-diff-modified-pattern,
			.monaco-editor .dirty-diff-modified-pattern:before {
				background-size: ${state.width}px ${state.width}px;
			}
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-added-pattern,
			.monaco-editor .dirty-diff-modified,
			.monaco-editor .dirty-diff-modified-pattern,
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
