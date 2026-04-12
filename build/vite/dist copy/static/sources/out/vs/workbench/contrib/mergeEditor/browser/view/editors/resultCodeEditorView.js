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
import { reset } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CompareResult } from '../../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived } from '../../../../../../base/common/observable.js';
import { OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MergeEditorLineRange } from '../../model/lineRange.js';
import { applyObservableDecorations, join } from '../../utils.js';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from '../colors.js';
import { EditorGutter } from '../editorGutter.js';
import { ctxIsMergeResultEditor } from '../../../common/mergeEditor.js';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView.js';
let ResultCodeEditorView = class ResultCodeEditorView extends CodeEditorView {
    constructor(viewModel, instantiationService, _labelService, configurationService) {
        super(instantiationService, viewModel, configurationService);
        this._labelService = _labelService;
        this.decorations = derived(this, reader => {
            const viewModel = this.viewModel.read(reader);
            if (!viewModel) {
                return [];
            }
            const model = viewModel.model;
            const textModel = model.resultTextModel;
            const result = new Array();
            const baseRangeWithStoreAndTouchingDiffs = join(model.modifiedBaseRanges.read(reader), model.baseResultDiffs.read(reader), (baseRange, diff) => baseRange.baseRange.intersectsOrTouches(diff.inputRange)
                ? CompareResult.neitherLessOrGreaterThan
                : MergeEditorLineRange.compareByStart(baseRange.baseRange, diff.inputRange));
            const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
            const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
            for (const m of baseRangeWithStoreAndTouchingDiffs) {
                const modifiedBaseRange = m.left;
                if (modifiedBaseRange) {
                    const blockClassNames = ['merge-editor-block'];
                    let blockPadding = [0, 0, 0, 0];
                    const isHandled = model.isHandled(modifiedBaseRange).read(reader);
                    if (isHandled) {
                        blockClassNames.push('handled');
                    }
                    if (modifiedBaseRange === activeModifiedBaseRange) {
                        blockClassNames.push('focused');
                        blockPadding = [0, 2, 0, 2];
                    }
                    if (modifiedBaseRange.isConflicting) {
                        blockClassNames.push('conflicting');
                    }
                    blockClassNames.push('result');
                    if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
                        continue;
                    }
                    const range = model.getLineRangeInResult(modifiedBaseRange.baseRange, reader);
                    result.push({
                        range: range.toInclusiveRangeOrEmpty(),
                        options: {
                            showIfCollapsed: true,
                            blockClassName: blockClassNames.join(' '),
                            blockPadding,
                            blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
                            description: 'Result Diff',
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
                if (!modifiedBaseRange || modifiedBaseRange.isConflicting) {
                    for (const diff of m.rights) {
                        const range = diff.outputRange.toInclusiveRange();
                        if (range) {
                            result.push({
                                range,
                                options: {
                                    className: `merge-editor-diff result`,
                                    description: 'Merge Editor',
                                    isWholeLine: true,
                                }
                            });
                        }
                        if (diff.rangeMappings) {
                            for (const d of diff.rangeMappings) {
                                result.push({
                                    range: d.outputRange,
                                    options: {
                                        className: `merge-editor-diff-word result`,
                                        description: 'Merge Editor'
                                    }
                                });
                            }
                        }
                    }
                }
            }
            return result;
        });
        this.editor.invokeWithinContext(accessor => {
            const contextKeyService = accessor.get(IContextKeyService);
            const isMergeResultEditor = ctxIsMergeResultEditor.bindTo(contextKeyService);
            isMergeResultEditor.set(true);
            this._register(toDisposable(() => isMergeResultEditor.reset()));
        });
        this.htmlElements.gutterDiv.style.width = '5px';
        this.htmlElements.root.classList.add(`result`);
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
            this.editor.setModel(vm.model.resultTextModel);
            reset(this.htmlElements.title, ...renderLabelWithIcons(localize('result', 'Result')));
            reset(this.htmlElements.description, ...renderLabelWithIcons(this._labelService.getUriLabel(vm.model.resultTextModel.uri, { relative: true })));
        }));
        const remainingConflictsActionBar = this._register(new ActionBar(this.htmlElements.detail));
        this._register(autorun(reader => {
            /** @description update remainingConflicts label */
            const vm = this.viewModel.read(reader);
            if (!vm) {
                return;
            }
            const model = vm.model;
            if (!model) {
                return;
            }
            const count = model.unhandledConflictsCount.read(reader);
            const text = count === 1
                ? localize('mergeEditor.remainingConflicts', '{0} Conflict Remaining', count)
                : localize('mergeEditor.remainingConflict', '{0} Conflicts Remaining ', count);
            remainingConflictsActionBar.clear();
            remainingConflictsActionBar.push({
                class: undefined,
                enabled: count > 0,
                id: 'nextConflict',
                label: text,
                run() {
                    vm.model.telemetry.reportConflictCounterClicked();
                    vm.goToNextModifiedBaseRange(m => !model.isHandled(m).read(undefined));
                },
                tooltip: count > 0
                    ? localize('goToNextConflict', 'Go to next conflict')
                    : localize('allConflictHandled', 'All conflicts handled, the merge can be completed now.'),
            });
        }));
        this._register(applyObservableDecorations(this.editor, this.decorations));
        this._register(createSelectionsAutorun(this, (baseRange, viewModel) => viewModel.model.translateBaseRangeToResult(baseRange)));
        this._register(instantiationService.createInstance(TitleMenu, MenuId.MergeInputResultToolbar, this.htmlElements.toolbar));
    }
};
ResultCodeEditorView = __decorate([
    __param(1, IInstantiationService),
    __param(2, ILabelService),
    __param(3, IConfigurationService)
], ResultCodeEditorView);
export { ResultCodeEditorView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzdWx0Q29kZUVkaXRvclZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL3ZpZXcvZWRpdG9ycy9yZXN1bHRDb2RlRWRpdG9yVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQWUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RyxPQUFPLEVBQTBDLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDckgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDakYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDaEUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLElBQUksRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSx3Q0FBd0MsRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUNwSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbEQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUVsRixJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLGNBQWM7SUFDdkQsWUFDQyxTQUF3RCxFQUNqQyxvQkFBMkMsRUFDbkQsYUFBNkMsRUFDckMsb0JBQTJDO1FBRWxFLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUg3QixrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQW9HNUMsZ0JBQVcsR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ3JELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQztZQUM5QixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDO1lBQ3hDLE1BQU0sTUFBTSxHQUFHLElBQUksS0FBSyxFQUF5QixDQUFDO1lBRWxELE1BQU0sa0NBQWtDLEdBQUcsSUFBSSxDQUM5QyxLQUFLLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUNyQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFDbEMsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQzVFLENBQUMsQ0FBQyxhQUFhLENBQUMsd0JBQXdCO2dCQUN4QyxDQUFDLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUNwQyxTQUFTLENBQUMsU0FBUyxFQUNuQixJQUFJLENBQUMsVUFBVSxDQUNmLENBQ0YsQ0FBQztZQUVGLE1BQU0sdUJBQXVCLEdBQUcsU0FBUyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUUvRSxNQUFNLHlCQUF5QixHQUFHLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFbkYsS0FBSyxNQUFNLENBQUMsSUFBSSxrQ0FBa0MsRUFBRSxDQUFDO2dCQUNwRCxNQUFNLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBRWpDLElBQUksaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO29CQUMvQyxJQUFJLFlBQVksR0FBK0QsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDNUYsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxTQUFTLEVBQUUsQ0FBQzt3QkFDZixlQUFlLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNqQyxDQUFDO29CQUNELElBQUksaUJBQWlCLEtBQUssdUJBQXVCLEVBQUUsQ0FBQzt3QkFDbkQsZUFBZSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDaEMsWUFBWSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQzdCLENBQUM7b0JBQ0QsSUFBSSxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsQ0FBQzt3QkFDckMsZUFBZSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDckMsQ0FBQztvQkFDRCxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUUvQixJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxJQUFJLENBQUMseUJBQXlCLElBQUksU0FBUyxFQUFFLENBQUM7d0JBQ2pGLFNBQVM7b0JBQ1YsQ0FBQztvQkFFRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM5RSxNQUFNLENBQUMsSUFBSSxDQUFDO3dCQUNYLEtBQUssRUFBRSxLQUFLLENBQUMsdUJBQXVCLEVBQUU7d0JBQ3RDLE9BQU8sRUFBRTs0QkFDUixlQUFlLEVBQUUsSUFBSTs0QkFDckIsY0FBYyxFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDOzRCQUN6QyxZQUFZOzRCQUNaLGVBQWUsRUFBRSxLQUFLLENBQUMsZUFBZSxHQUFHLFNBQVMsQ0FBQyxZQUFZLEVBQUU7NEJBQ2pFLFdBQVcsRUFBRSxhQUFhOzRCQUMxQixPQUFPLEVBQUU7Z0NBQ1IsUUFBUSxnQ0FBd0I7Z0NBQ2hDLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLHdDQUF3QyxDQUFDLENBQUMsQ0FBQywwQ0FBMEMsRUFBRTs2QkFDaEg7NEJBQ0QsYUFBYSxFQUFFLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0NBQ2hELFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNO2dDQUNsQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDLENBQUMsMENBQTBDLEVBQUU7NkJBQ2hILENBQUMsQ0FBQyxDQUFDLFNBQVM7eUJBQ2I7cUJBQ0QsQ0FBQyxDQUFDO2dCQUNKLENBQUM7Z0JBRUQsSUFBSSxDQUFDLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUMzRCxLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQzt3QkFDN0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO3dCQUNsRCxJQUFJLEtBQUssRUFBRSxDQUFDOzRCQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0NBQ1gsS0FBSztnQ0FDTCxPQUFPLEVBQUU7b0NBQ1IsU0FBUyxFQUFFLDBCQUEwQjtvQ0FDckMsV0FBVyxFQUFFLGNBQWM7b0NBQzNCLFdBQVcsRUFBRSxJQUFJO2lDQUNqQjs2QkFDRCxDQUFDLENBQUM7d0JBQ0osQ0FBQzt3QkFFRCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQzs0QkFDeEIsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0NBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0NBQ1gsS0FBSyxFQUFFLENBQUMsQ0FBQyxXQUFXO29DQUNwQixPQUFPLEVBQUU7d0NBQ1IsU0FBUyxFQUFFLCtCQUErQjt3Q0FDMUMsV0FBVyxFQUFFLGNBQWM7cUNBQzNCO2lDQUNELENBQUMsQ0FBQzs0QkFDSixDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFoTUYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUMxQyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMzRCxNQUFNLG1CQUFtQixHQUFHLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzdFLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNoRCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxTQUFTLENBQ2IsZ0JBQWdCLENBQUMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDbEMscUNBQXFDO1lBQ3JDLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUN6QyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUU7b0JBQ3BFLDBCQUEwQixFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRTtvQkFDakQsVUFBVSxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLEdBQUcsTUFBTSxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxDQUFDO2lCQUNqRSxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDLENBQUMsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsOENBQThDO1lBQzlDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDVCxPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDL0MsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEYsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pKLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHSixNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBRTVGLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQy9CLG1EQUFtRDtZQUNuRCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ1QsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDWixPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFekQsTUFBTSxJQUFJLEdBQUcsS0FBSyxLQUFLLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxRQUFRLENBQ1QsZ0NBQWdDLEVBQ2hDLHdCQUF3QixFQUN4QixLQUFLLENBQ0w7Z0JBQ0QsQ0FBQyxDQUFDLFFBQVEsQ0FDVCwrQkFBK0IsRUFDL0IsMEJBQTBCLEVBQzFCLEtBQUssQ0FDTCxDQUFDO1lBRUgsMkJBQTJCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDcEMsMkJBQTJCLENBQUMsSUFBSSxDQUFDO2dCQUNoQyxLQUFLLEVBQUUsU0FBUztnQkFDaEIsT0FBTyxFQUFFLEtBQUssR0FBRyxDQUFDO2dCQUNsQixFQUFFLEVBQUUsY0FBYztnQkFDbEIsS0FBSyxFQUFFLElBQUk7Z0JBQ1gsR0FBRztvQkFDRixFQUFFLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO29CQUNsRCxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hFLENBQUM7Z0JBQ0QsT0FBTyxFQUFFLEtBQUssR0FBRyxDQUFDO29CQUNqQixDQUFDLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHFCQUFxQixDQUFDO29CQUNyRCxDQUFDLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHdEQUF3RCxDQUFDO2FBQzNGLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFHSixJQUFJLENBQUMsU0FBUyxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFMUUsSUFBSSxDQUFDLFNBQVMsQ0FDYix1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FDdEQsU0FBUyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsQ0FDckQsQ0FDRCxDQUFDO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FDYixvQkFBb0IsQ0FBQyxjQUFjLENBQ2xDLFNBQVMsRUFDVCxNQUFNLENBQUMsdUJBQXVCLEVBQzlCLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUN6QixDQUNELENBQUM7SUFDSCxDQUFDO0NBb0dELENBQUE7QUExTVksb0JBQW9CO0lBRzlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLHFCQUFxQixDQUFBO0dBTFgsb0JBQW9CLENBME1oQyJ9