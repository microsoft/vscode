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
var MultiDiffEditor_1;
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabel } from '../../../browser/labels.js';
import { AbstractEditorWithViewState } from '../../../browser/parts/editor/editorWithViewState.js';
import { MultiDiffEditorInput } from './multiDiffEditorInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { FloatingEditorToolbarWidget } from '../../../../editor/contrib/floatingMenu/browser/floatingMenu.js';
let MultiDiffEditor = class MultiDiffEditor extends AbstractEditorWithViewState {
    static { MultiDiffEditor_1 = this; }
    static { this.ID = 'multiDiffEditor'; }
    get viewModel() {
        return this._viewModel;
    }
    constructor(group, instantiationService, telemetryService, themeService, storageService, editorService, editorGroupService, textResourceConfigurationService, editorProgressService) {
        super(MultiDiffEditor_1.ID, group, 'multiDiffEditor', telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);
        this.editorProgressService = editorProgressService;
        this._multiDiffEditorWidget = undefined;
    }
    createEditor(parent) {
        this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(MultiDiffEditorWidget, parent, this.instantiationService.createInstance(WorkbenchUIElementFactory)));
        this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
            this._onDidChangeControl.fire();
        }));
        this._contentOverlay = this._register(new MultiDiffEditorContentMenuOverlay(this._multiDiffEditorWidget.getRootElement(), this._multiDiffEditorWidget.getContextKeyService(), this._multiDiffEditorWidget.getScopedInstantiationService()));
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        this._viewModel = await input.getViewModel();
        this._contentOverlay?.updateResource(input.resource);
        this._multiDiffEditorWidget.setViewModel(this._viewModel);
        const viewState = this.loadEditorViewState(input, context);
        if (viewState) {
            this._multiDiffEditorWidget.setViewState(viewState);
        }
        this._applyOptions(options);
    }
    setOptions(options) {
        this._applyOptions(options);
    }
    _applyOptions(options) {
        const viewState = options?.viewState;
        if (!viewState || !viewState.revealData) {
            return;
        }
        this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, {
            range: viewState.revealData.range ? Range.lift(viewState.revealData.range) : undefined,
            highlight: true
        });
    }
    async clearInput() {
        await super.clearInput();
        this._contentOverlay?.updateResource(undefined);
        this._multiDiffEditorWidget.setViewModel(undefined);
    }
    layout(dimension) {
        this._multiDiffEditorWidget.layout(dimension);
    }
    getControl() {
        return this._multiDiffEditorWidget.getActiveControl();
    }
    focus() {
        super.focus();
        this._multiDiffEditorWidget?.getActiveControl()?.focus();
    }
    hasFocus() {
        return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
    }
    computeEditorViewState(resource) {
        return this._multiDiffEditorWidget.getViewState();
    }
    tracksEditorViewState(input) {
        return input instanceof MultiDiffEditorInput;
    }
    toEditorViewStateResource(input) {
        return input.resource;
    }
    tryGetCodeEditor(resource) {
        return this._multiDiffEditorWidget.tryGetCodeEditor(resource);
    }
    findDocumentDiffItem(resource) {
        const i = this._multiDiffEditorWidget.findDocumentDiffItem(resource);
        if (!i) {
            return undefined;
        }
        const i2 = i;
        return i2.multiDiffEditorItem;
    }
    goToNextChange() {
        this._multiDiffEditorWidget?.goToNextChange();
    }
    goToPreviousChange() {
        this._multiDiffEditorWidget?.goToPreviousChange();
    }
    async showWhile(promise) {
        return this.editorProgressService.showWhile(promise);
    }
};
MultiDiffEditor = MultiDiffEditor_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITelemetryService),
    __param(3, IThemeService),
    __param(4, IStorageService),
    __param(5, IEditorService),
    __param(6, IEditorGroupsService),
    __param(7, ITextResourceConfigurationService),
    __param(8, IEditorProgressService)
], MultiDiffEditor);
export { MultiDiffEditor };
class MultiDiffEditorContentMenuOverlay extends Disposable {
    constructor(root, contextKeyService, instantiationService) {
        super();
        this.resourceObs = observableValue(this, undefined);
        // Widget
        const widget = instantiationService.createInstance(FloatingEditorToolbarWidget, MenuId.MultiDiffEditorContent, contextKeyService, this.resourceObs);
        widget.element.classList.add('multi-diff-root-floating-menu');
        this._register(widget);
        // Derived to show/hide
        const showToolbarObs = derived(reader => {
            const resource = this.resourceObs.read(reader);
            const hasActions = widget.hasActions.read(reader);
            return resource !== undefined && hasActions;
        });
        this._register(autorun(reader => {
            const showToolbar = showToolbarObs.read(reader);
            if (!showToolbar) {
                return;
            }
            root.appendChild(widget.element);
            reader.store.add(toDisposable(() => {
                widget.element.remove();
            }));
        }));
    }
    updateResource(resource) {
        this.resourceObs.set(resource, undefined);
    }
}
let WorkbenchUIElementFactory = class WorkbenchUIElementFactory {
    constructor(_instantiationService) {
        this._instantiationService = _instantiationService;
    }
    createResourceLabel(element) {
        const label = this._instantiationService.createInstance(ResourceLabel, element, {});
        return {
            setUri(uri, options = {}) {
                if (!uri) {
                    label.element.clear();
                }
                else {
                    label.element.setFile(uri, { strikethrough: options.strikethrough });
                }
            },
            dispose() {
                label.dispose();
            }
        };
    }
};
WorkbenchUIElementFactory = __decorate([
    __param(0, IInstantiationService)
], WorkbenchUIElementFactory);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlEaWZmRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBRW5ILE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUduRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUluRyxPQUFPLEVBQTRDLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDM0csT0FBTyxFQUFnQixvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQU1sRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFaEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDMUYs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