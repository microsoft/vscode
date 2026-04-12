/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, h, isInShadowDOM, reset } from '../../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { hash } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, transaction } from '../../../../../base/common/observable.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../../editor/common/config/fontInfo.js';
import { localize } from '../../../../../nls.js';
import { ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from '../model/modifiedBaseRange.js';
import { FixedZoneWidget } from './fixedZoneWidget.js';
export class ConflictActionsFactory extends Disposable {
    constructor(_editor) {
        super();
        this._editor = _editor;
        this._register(this._editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(59 /* EditorOption.fontInfo */) || e.hasChanged(25 /* EditorOption.codeLensFontSize */) || e.hasChanged(24 /* EditorOption.codeLensFontFamily */)) {
                this._updateLensStyle();
            }
        }));
        this._styleClassName = '_conflictActionsFactory_' + hash(this._editor.getId()).toString(16);
        this._styleElement = createStyleSheet(isInShadowDOM(this._editor.getContainerDomNode())
            ? this._editor.getContainerDomNode()
            : undefined, undefined, this._store);
        this._updateLensStyle();
    }
    _updateLensStyle() {
        const { codeLensHeight, fontSize } = this._getLayoutInfo();
        const fontFamily = this._editor.getOption(24 /* EditorOption.codeLensFontFamily */);
        const editorFontInfo = this._editor.getOption(59 /* EditorOption.fontInfo */);
        const fontFamilyVar = `--codelens-font-family${this._styleClassName}`;
        const fontFeaturesVar = `--codelens-font-features${this._styleClassName}`;
        let newStyle = `
		.${this._styleClassName} { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; padding-right: ${Math.round(fontSize * 0.5)}px; font-feature-settings: var(${fontFeaturesVar}) }
		.monaco-workbench .${this._styleClassName} span.codicon { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; }
		`;
        if (fontFamily) {
            newStyle += `${this._styleClassName} { font-family: var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}}`;
        }
        this._styleElement.textContent = newStyle;
        this._editor.getContainerDomNode().style?.setProperty(fontFamilyVar, fontFamily ?? 'inherit');
        this._editor.getContainerDomNode().style?.setProperty(fontFeaturesVar, editorFontInfo.fontFeatureSettings);
    }
    _getLayoutInfo() {
        const lineHeightFactor = Math.max(1.3, this._editor.getOption(75 /* EditorOption.lineHeight */) / this._editor.getOption(61 /* EditorOption.fontSize */));
        let fontSize = this._editor.getOption(25 /* EditorOption.codeLensFontSize */);
        if (!fontSize || fontSize < 5) {
            fontSize = (this._editor.getOption(61 /* EditorOption.fontSize */) * .9) | 0;
        }
        return {
            fontSize,
            codeLensHeight: (fontSize * lineHeightFactor) | 0,
        };
    }
    createWidget(viewZoneChangeAccessor, lineNumber, items, viewZoneIdsToCleanUp) {
        const layoutInfo = this._getLayoutInfo();
        return new ActionsContentWidget(this._editor, viewZoneChangeAccessor, lineNumber, layoutInfo.codeLensHeight + 2, this._styleClassName, items, viewZoneIdsToCleanUp);
    }
}
export class ActionsSource {
    constructor(viewModel, modifiedBaseRange) {
        this.viewModel = viewModel;
        this.modifiedBaseRange = modifiedBaseRange;
        this.itemsInput1 = this.getItemsInput(1);
        this.itemsInput2 = this.getItemsInput(2);
        this.resultItems = derived(this, reader => {
            const viewModel = this.viewModel;
            const modifiedBaseRange = this.modifiedBaseRange;
            const state = viewModel.model.getState(modifiedBaseRange).read(reader);
            const model = viewModel.model;
            const result = [];
            if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
                result.push({
                    text: localize('manualResolution', "Manual Resolution"),
                    tooltip: localize('manualResolutionTooltip', "This conflict has been resolved manually."),
                });
            }
            else if (state.kind === ModifiedBaseRangeStateKind.base) {
                result.push({
                    text: localize('noChangesAccepted', 'No Changes Accepted'),
                    tooltip: localize('noChangesAcceptedTooltip', 'The current resolution of this conflict equals the common ancestor of both the right and left changes.'),
                });
            }
            else {
                const labels = [];
                if (state.includesInput1) {
                    labels.push(model.input1.title);
                }
                if (state.includesInput2) {
                    labels.push(model.input2.title);
                }
                if (state.kind === ModifiedBaseRangeStateKind.both && state.firstInput === 2) {
                    labels.reverse();
                }
                result.push({
                    text: `${labels.join(' + ')}`
                });
            }
            const stateToggles = [];
            if (state.includesInput1) {
                stateToggles.push(command(localize('remove', 'Remove {0}', model.input1.title), async () => {
                    transaction((tx) => {
                        model.setState(modifiedBaseRange, state.withInputValue(1, false), true, tx);
                        model.telemetry.reportRemoveInvoked(1, state.includesInput(2));
                    });
                }, localize('removeTooltip', 'Remove {0} from the result document.', model.input1.title)));
            }
            if (state.includesInput2) {
                stateToggles.push(command(localize('remove', 'Remove {0}', model.input2.title), async () => {
                    transaction((tx) => {
                        model.setState(modifiedBaseRange, state.withInputValue(2, false), true, tx);
                        model.telemetry.reportRemoveInvoked(2, state.includesInput(1));
                    });
                }, localize('removeTooltip', 'Remove {0} from the result document.', model.input2.title)));
            }
            if (state.kind === ModifiedBaseRangeStateKind.both &&
                state.firstInput === 2) {
                stateToggles.reverse();
            }
            result.push(...stateToggles);
            if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
                result.push(command(localize('resetToBase', 'Reset to base'), async () => {
                    transaction((tx) => {
                        model.setState(modifiedBaseRange, ModifiedBaseRangeState.base, true, tx);
                        model.telemetry.reportResetToBaseInvoked();
                    });
                }, localize('resetToBaseTooltip', 'Reset this conflict to the common ancestor of both the right and left changes.')));
            }
            return result;
        });
        this.isEmpty = derived(this, reader => {
            return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length + this.resultItems.read(reader).length === 0;
        });
        this.inputIsEmpty = derived(this, reader => {
            return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length === 0;
        });
    }
    getItemsInput(inputNumber) {
        return derived(reader => {
            /** @description items */
            const viewModel = this.viewModel;
            const modifiedBaseRange = this.modifiedBaseRange;
            if (!viewModel.model.hasBaseRange(modifiedBaseRange)) {
                return [];
            }
            const state = viewModel.model.getState(modifiedBaseRange).read(reader);
            const handled = viewModel.model.isHandled(modifiedBaseRange).read(reader);
            const model = viewModel.model;
            const result = [];
            const inputData = inputNumber === 1 ? viewModel.model.input1 : viewModel.model.input2;
            const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
            if (!modifiedBaseRange.isConflicting && handled && !showNonConflictingChanges) {
                return [];
            }
            const otherInputNumber = inputNumber === 1 ? 2 : 1;
            if (state.kind !== ModifiedBaseRangeStateKind.unrecognized && !state.isInputIncluded(inputNumber)) {
                if (!state.isInputIncluded(otherInputNumber) || !this.viewModel.shouldUseAppendInsteadOfAccept.read(reader)) {
                    result.push(command(localize('accept', "Accept {0}", inputData.title), async () => {
                        transaction((tx) => {
                            model.setState(modifiedBaseRange, state.withInputValue(inputNumber, true, false), inputNumber, tx);
                            model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
                        });
                    }, localize('acceptTooltip', "Accept {0} in the result document.", inputData.title)));
                    if (modifiedBaseRange.canBeCombined) {
                        const commandName = modifiedBaseRange.isOrderRelevant
                            ? localize('acceptBoth0First', "Accept Combination ({0} First)", inputData.title)
                            : localize('acceptBoth', "Accept Combination");
                        result.push(command(commandName, async () => {
                            transaction((tx) => {
                                model.setState(modifiedBaseRange, ModifiedBaseRangeState.base
                                    .withInputValue(inputNumber, true)
                                    .withInputValue(otherInputNumber, true, true), true, tx);
                                model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
                            });
                        }, localize('acceptBothTooltip', "Accept an automatic combination of both sides in the result document.")));
                    }
                }
                else {
                    result.push(command(localize('append', "Append {0}", inputData.title), async () => {
                        transaction((tx) => {
                            model.setState(modifiedBaseRange, state.withInputValue(inputNumber, true, false), inputNumber, tx);
                            model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
                        });
                    }, localize('appendTooltip', "Append {0} to the result document.", inputData.title)));
                    if (modifiedBaseRange.canBeCombined) {
                        result.push(command(localize('combine', "Accept Combination", inputData.title), async () => {
                            transaction((tx) => {
                                model.setState(modifiedBaseRange, state.withInputValue(inputNumber, true, true), inputNumber, tx);
                                model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
                            });
                        }, localize('acceptBothTooltip', "Accept an automatic combination of both sides in the result document.")));
                    }
                }
                if (!model.isInputHandled(modifiedBaseRange, inputNumber).read(reader)) {
                    result.push(command(localize('ignore', 'Ignore'), async () => {
                        transaction((tx) => {
                            model.setInputHandled(modifiedBaseRange, inputNumber, true, tx);
                        });
                    }, localize('markAsHandledTooltip', "Don't take this side of the conflict.")));
                }
            }
            return result;
        });
    }
}
function command(title, action, tooltip) {
    return {
        text: title,
        action,
        tooltip,
    };
}
class ActionsContentWidget extends FixedZoneWidget {
    constructor(editor, viewZoneAccessor, afterLineNumber, height, className, items, viewZoneIdsToCleanUp) {
        super(editor, viewZoneAccessor, afterLineNumber, height, viewZoneIdsToCleanUp);
        this._domNode = h('div.merge-editor-conflict-actions').root;
        this.widgetDomNode.appendChild(this._domNode);
        this._domNode.classList.add(className);
        this._register(autorun(reader => {
            /** @description update commands */
            const i = items.read(reader);
            this.setState(i);
        }));
    }
    setState(items) {
        const children = [];
        let isFirst = true;
        for (const item of items) {
            if (isFirst) {
                isFirst = false;
            }
            else {
                children.push($('span', undefined, '\u00a0|\u00a0'));
            }
            const title = renderLabelWithIcons(item.text);
            if (item.action) {
                children.push($('a', { title: item.tooltip, role: 'button', onclick: () => item.action() }, ...title));
            }
            else {
                children.push($('span', { title: item.tooltip }, ...title));
            }
        }
        reset(this._domNode, ...children);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmxpY3RBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci92aWV3L2NvbmZsaWN0QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDakYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDOUYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBZSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUd0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFxQixzQkFBc0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUd2RCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsVUFBVTtJQUlyRCxZQUE2QixPQUFvQjtRQUNoRCxLQUFLLEVBQUUsQ0FBQztRQURvQixZQUFPLEdBQVAsT0FBTyxDQUFhO1FBR2hELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQzFELElBQUks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