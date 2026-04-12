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
import { h, reset } from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { autorun, autorunWithStore, derived } from '../../../../../../base/common/observable.js';
import { OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { applyObservableDecorations } from '../../utils.js';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from '../colors.js';
import { EditorGutter } from '../editorGutter.js';
import { CodeEditorView, TitleMenu, createSelectionsAutorun } from './codeEditorView.js';
let BaseCodeEditorView = class BaseCodeEditorView extends CodeEditorView {
    constructor(viewModel, instantiationService, configurationService) {
        super(instantiationService, viewModel, configurationService);
        this.decorations = derived(this, reader => {
            const viewModel = this.viewModel.read(reader);
            if (!viewModel) {
                return [];
            }
            const model = viewModel.model;
            const textModel = model.base;
            const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
            const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
            const showDeletionMarkers = this.showDeletionMarkers.read(reader);
            const result = [];
            for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
                const range = modifiedBaseRange.baseRange;
                if (!range) {
                    continue;
                }
                const isHandled = model.isHandled(modifiedBaseRange).read(reader);
                if (!modifiedBaseRange.isConflicting && isHandled && !showNonConflictingChanges) {
                    continue;
                }
                const blockClassNames = ['merge-editor-block'];
                let blockPadding = [0, 0, 0, 0];
                if (isHandled) {
                    blockClassNames.push('handled');
                }
                if (modifiedBaseRange === activeModifiedBaseRange) {
                    blockClassNames.push('focused');
                    blockPadding = [0, 2, 0, 2];
                }
                blockClassNames.push('base');
                const inputToDiffAgainst = viewModel.baseShowDiffAgainst.read(reader);
                if (inputToDiffAgainst) {
                    for (const diff of modifiedBaseRange.getInputDiffs(inputToDiffAgainst)) {
                        const range = diff.inputRange.toInclusiveRange();
                        if (range) {
                            result.push({
                                range,
                                options: {
                                    className: `merge-editor-diff base`,
                                    description: 'Merge Editor',
                                    isWholeLine: true,
                                }
                            });
                        }
                        for (const diff2 of diff.rangeMappings) {
                            if (showDeletionMarkers || !diff2.inputRange.isEmpty()) {
                                result.push({
                                    range: diff2.inputRange,
                                    options: {
                                        className: diff2.inputRange.isEmpty() ? `merge-editor-diff-empty-word base` : `merge-editor-diff-word base`,
                                        description: 'Merge Editor',
                                        showIfCollapsed: true,
                                    },
                                });
                            }
                        }
                    }
                }
                result.push({
                    range: range.toInclusiveRangeOrEmpty(),
                    options: {
                        showIfCollapsed: true,
                        blockClassName: blockClassNames.join(' '),
                        blockPadding,
                        blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
                        description: 'Merge Editor',
                        minimap: {
                            position: 2 /* MinimapPosition.Gutter */,
                            color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
                        },
                        overviewRuler: modifiedBaseRange.isConflicting ? {
                            position: OverviewRulerLane.Center,
                            color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
                        } : undefined
                    }
                });
            }
            return result;
        });
        this._register(createSelectionsAutorun(this, (baseRange, viewModel) => baseRange));
        this._register(instantiationService.createInstance(TitleMenu, MenuId.MergeBaseToolbar, this.htmlElements.title));
        this._register(autorunWithStore((reader, store) => {
            /** @description update checkboxes */
            if (this.checkboxesVisible.read(reader)) {
                store.add(new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
                    getIntersectingGutterItems: (range, reader) => [],
                    createView: (item, target) => { throw new BugIndicatingError(); },
                }));
            }
        }));
        this._register(autorun(reader => {
            /** @description update labels & text model */
            const vm = this.viewModel.read(reader);
            if (!vm) {
                return;
            }
            this.editor.setModel(vm.model.base);
            reset(this.htmlElements.title, ...renderLabelWithIcons(localize('base', 'Base')));
            const baseShowDiffAgainst = vm.baseShowDiffAgainst.read(reader);
            let node = undefined;
            if (baseShowDiffAgainst) {
                const label = localize('compareWith', 'Comparing with {0}', baseShowDiffAgainst === 1 ? vm.model.input1.title : vm.model.input2.title);
                const tooltip = localize('compareWithTooltip', 'Differences are highlighted with a background color.');
                node = h('span', { title: tooltip }, [label]).root;
            }
            reset(this.htmlElements.description, ...(node ? [node] : []));
        }));
        this._register(applyObservableDecorations(this.editor, this.decorations));
    }
};
BaseCodeEditorView = __decorate([
    __param(1, IInstantiationService),
    __param(2, IConfigurationService)
], BaseCodeEditorView);
export { BaseCodeEditorView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZUNvZGVFZGl0b3JWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci92aWV3L2VkaXRvcnMvYmFzZUNvZGVFZGl0b3JWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDakcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDN0UsT0FBTyxFQUFlLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RyxPQUFPLEVBQTBDLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDckgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsd0NBQXdDLEVBQUUsMENBQTBDLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDcEgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRWxELE9BQU8sRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFbEYsSUFBTSxrQkFBa0IsR0FBeEIsTUFB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