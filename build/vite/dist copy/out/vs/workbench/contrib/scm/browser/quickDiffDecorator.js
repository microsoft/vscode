/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var QuickDiffDecorator_1;
import * as nls from '../../../../nls.js';
import './media/dirtydiffDecorator.css';
import { Disposable, DisposableStore, DisposableMap } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChangeType, getChangeType, IQuickDiffService, minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../common/quickDiff.js';
import { IQuickDiffModelService } from './quickDiffModel.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ContextKeyTrueExpr, ContextKeyFalseExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
export const quickDiffDecorationCount = new RawContextKey('quickDiffDecorationCount', 0);
let QuickDiffDecorator = QuickDiffDecorator_1 = class QuickDiffDecorator extends Disposable {
    static createDecoration(className, tooltip, options) {
        const decorationOptions = {
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
                position: 2 /* MinimapPosition.Gutter */
            };
        }
        return ModelDecorationOptions.createDynamic(decorationOptions);
    }
    constructor(codeEditor, quickDiffModelRef, configurationService, quickDiffService) {
        super();
        this.codeEditor = codeEditor;
        this.quickDiffModelRef = quickDiffModelRef;
        this.configurationService = configurationService;
        this.quickDiffService = quickDiffService;
        const decorations = configurationService.getValue('scm.diffDecorations');
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
        this.addedOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-added primary', diffAdded, diffAddedOptions);
        this.addedPatternOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-added primary pattern', diffAdded, diffAddedOptions);
        this.addedSecondaryOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-added secondary', diffAdded, diffAddedOptions);
        this.addedSecondaryPatternOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-added secondary pattern', diffAdded, diffAddedOptions);
        const diffModified = nls.localize('diffModified', 'Changed lines');
        const diffModifiedOptions = {
            gutter,
            overview: { active: overview, color: overviewRulerModifiedForeground },
            minimap: { active: minimap, color: minimapGutterModifiedBackground },
            isWholeLine: true
        };
        this.modifiedOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-modified primary', diffModified, diffModifiedOptions);
        this.modifiedPatternOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-modified primary pattern', diffModified, diffModifiedOptions);
        this.modifiedSecondaryOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-modified secondary', diffModified, diffModifiedOptions);
        this.modifiedSecondaryPatternOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-modified secondary pattern', diffModified, diffModifiedOptions);
        const diffDeleted = nls.localize('diffDeleted', 'Removed lines');
        const diffDeletedOptions = {
            gutter,
            overview: { active: overview, color: overviewRulerDeletedForeground },
            minimap: { active: minimap, color: minimapGutterDeletedBackground },
            isWholeLine: false
        };
        this.deletedOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-deleted primary', diffDeleted, diffDeletedOptions);
        this.deletedSecondaryOptions = QuickDiffDecorator_1.createDecoration('dirty-diff-deleted secondary', diffDeleted, diffDeletedOptions);
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('scm.diffDecorationsGutterPattern')) {
                this.onDidChange();
            }
        }));
        this._register(Event.runAndSubscribe(this.quickDiffModelRef.object.onDidChange, () => this.onDidChange()));
    }
    onDidChange() {
        if (!this.codeEditor.hasModel()) {
            return;
        }
        const pattern = this.configurationService.getValue('scm.diffDecorationsGutterPattern');
        const primaryQuickDiff = this.quickDiffModelRef.object.quickDiffs.find(quickDiff => quickDiff.kind === 'primary');
        const primaryQuickDiffChanges = this.quickDiffModelRef.object.changes.filter(change => change.providerId === primaryQuickDiff?.id);
        const decorations = [];
        for (const change of this.quickDiffModelRef.object.changes) {
            const quickDiff = this.quickDiffModelRef.object.quickDiffs
                .find(quickDiff => quickDiff.id === change.providerId);
            // Skip quick diffs that are not visible
            if (!quickDiff || !this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)) {
                continue;
            }
            if (quickDiff.kind !== 'primary' && primaryQuickDiffChanges.some(c => c.change2.modified.intersectsOrTouches(change.change2.modified))) {
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
        }
        else {
            this.decorationsCollection.set(decorations);
        }
    }
    dispose() {
        if (this.decorationsCollection) {
            this.decorationsCollection.clear();
        }
        this.decorationsCollection = undefined;
        this.quickDiffModelRef.dispose();
        super.dispose();
    }
};
QuickDiffDecorator = QuickDiffDecorator_1 = __decorate([
    __param(2, IConfigurationService),
    __param(3, IQuickDiffService)
], QuickDiffDecorator);
let QuickDiffWorkbenchController = class QuickDiffWorkbenchController extends Disposable {
    constructor(editorService, configurationService, quickDiffModelService, quickDiffService, uriIdentityService, contextKeyService) {
        super();
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.quickDiffModelService = quickDiffModelService;
        this.quickDiffService = quickDiffService;
        this.uriIdentityService = uriIdentityService;
        this.enabled = false;
        // Resource URI -> Code Editor Id -> Decoration (Disposable)
        this.decorators = new ResourceMap();
        this.viewState = { width: 3, visibility: 'always' };
        this.transientDisposables = this._register(new DisposableStore());
        this.stylesheet = domStylesheetsJs.createStyleSheet(undefined, undefined, this._store);
        this.quickDiffDecorationCount = quickDiffDecorationCount.bindTo(contextKeyService);
        this.activeEditor = observableFromEvent(this, this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);
        this.quickDiffProviders = observableFromEvent(this, this.quickDiffService.onDidChangeQuickDiffProviders, () => this.quickDiffService.providers);
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
    onDidChangeConfiguration() {
        const enabled = this.configurationService.getValue('scm.diffDecorations') !== 'none';
        if (enabled) {
            this.enable();
        }
        else {
            this.disable();
        }
    }
    onDidChangeDiffWidthConfiguration() {
        let width = this.configurationService.getValue('scm.diffDecorationsGutterWidth');
        if (isNaN(width) || width <= 0 || width > 5) {
            width = 3;
        }
        this.setViewState({ ...this.viewState, width });
    }
    onDidChangeDiffVisibilityConfiguration() {
        const visibility = this.configurationService.getValue('scm.diffDecorationsGutterVisibility');
        this.setViewState({ ...this.viewState, visibility });
    }
    setViewState(state) {
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
    enable() {
        if (this.enabled) {
            this.disable();
        }
        this.transientDisposables.add(Event.any(this.editorService.onDidCloseEditor, this.editorService.onDidVisibleEditorsChange)(() => this.onEditorsChanged()));
        this.onEditorsChanged();
        this.onDidActiveEditorChange();
        this.onDidChangeQuickDiffProviders();
        this.enabled = true;
    }
    disable() {
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
    onDidActiveEditorChange() {
        this.transientDisposables.add(autorun(reader => {
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
            reader.store.add(quickDiffModelRef);
            const visibleDecorationCount = observableFromEvent(this, quickDiffModelRef.object.onDidChange, () => {
                const visibleQuickDiffs = quickDiffModelRef.object.quickDiffs.filter(quickDiff => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
                return quickDiffModelRef.object.changes.filter(change => visibleQuickDiffs.some(quickDiff => quickDiff.id === change.providerId)).length;
            });
            reader.store.add(autorun(reader => {
                const count = visibleDecorationCount.read(reader);
                this.quickDiffDecorationCount.set(count);
            }));
        }));
    }
    onDidChangeQuickDiffProviders() {
        this.transientDisposables.add(autorun(reader => {
            const providers = this.quickDiffProviders.read(reader);
            const labels = [];
            for (let index = 0; index < providers.length; index++) {
                const provider = providers[index];
                if (labels.includes(provider.label)) {
                    continue;
                }
                const visible = this.quickDiffService.isQuickDiffProviderVisible(provider.id);
                const group = provider.kind !== 'contributed' ? '0_scm' : '1_contributed';
                const order = index + 1;
                reader.store.add(registerAction2(class extends Action2 {
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
                    run(accessor) {
                        const quickDiffService = accessor.get(IQuickDiffService);
                        quickDiffService.toggleQuickDiffProviderVisibility(provider.id);
                    }
                }));
                labels.push(provider.label);
            }
        }));
    }
    onEditorsChanged() {
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
                this.decorators.set(textModel.uri, new DisposableMap());
            }
            this.decorators.get(textModel.uri).set(editorId, new QuickDiffDecorator(editor, quickDiffModelRef, this.configurationService, this.quickDiffService));
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
    dispose() {
        this.disable();
        super.dispose();
    }
};
QuickDiffWorkbenchController = __decorate([
    __param(0, IEditorService),
    __param(1, IConfigurationService),
    __param(2, IQuickDiffModelService),
    __param(3, IQuickDiffService),
    __param(4, IUriIdentityService),
    __param(5, IContextKeyService)
], QuickDiffWorkbenchController);
export { QuickDiffWorkbenchController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tEaWZmRGVjb3JhdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2NtL2Jyb3dzZXIvcXVpY2tEaWZmRGVjb3JhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU8sZ0NBQWdDLENBQUM7QUFDeEMsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFjLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV4RixPQUFPLEVBQUUsaUJBQWlCLEVBQW1FLE1BQU0sb0NBQW9DLENBQUM7QUFDeEksT0FBTyxLQUFLLGdCQUFnQixNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBcUIsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsK0JBQStCLEVBQUUsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN2UyxPQUFPLEVBQWtCLHNCQUFzQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFN0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxN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