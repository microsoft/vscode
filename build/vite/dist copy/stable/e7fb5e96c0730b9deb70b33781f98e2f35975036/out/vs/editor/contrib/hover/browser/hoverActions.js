/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, GO_TO_BOTTOM_HOVER_ACTION_ID, GO_TO_TOP_HOVER_ACTION_ID, HIDE_HOVER_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL, PAGE_DOWN_HOVER_ACTION_ID, PAGE_UP_HOVER_ACTION_ID, SCROLL_DOWN_HOVER_ACTION_ID, SCROLL_LEFT_HOVER_ACTION_ID, SCROLL_RIGHT_HOVER_ACTION_ID, SCROLL_UP_HOVER_ACTION_ID, SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from './hoverActionIds.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { EditorAction } from '../../../browser/editorExtensions.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import { ContentHoverController } from './contentHoverController.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import * as nls from '../../../../nls.js';
import './hover.css';
var HoverFocusBehavior;
(function (HoverFocusBehavior) {
    HoverFocusBehavior["NoAutoFocus"] = "noAutoFocus";
    HoverFocusBehavior["FocusIfVisible"] = "focusIfVisible";
    HoverFocusBehavior["AutoFocusImmediately"] = "autoFocusImmediately";
})(HoverFocusBehavior || (HoverFocusBehavior = {}));
export class ShowOrFocusHoverAction extends EditorAction {
    constructor() {
        super({
            id: SHOW_OR_FOCUS_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'showOrFocusHover',
                comment: [
                    'Label for action that will trigger the showing/focusing of a hover in the editor.',
                    'If the hover is not visible, it will show the hover.',
                    'This allows for users to show the hover without using the mouse.'
                ]
            }, "Show or Focus Hover"),
            metadata: {
                description: nls.localize2('showOrFocusHoverDescription', 'Show or focus the editor hover which shows documentation, references, and other content for a symbol at the current cursor position.'),
                args: [{
                        name: 'args',
                        schema: {
                            type: 'object',
                            properties: {
                                'focus': {
                                    description: 'Controls if and when the hover should take focus upon being triggered by this action.',
                                    enum: [HoverFocusBehavior.NoAutoFocus, HoverFocusBehavior.FocusIfVisible, HoverFocusBehavior.AutoFocusImmediately],
                                    enumDescriptions: [
                                        nls.localize('showOrFocusHover.focus.noAutoFocus', 'The hover will not automatically take focus.'),
                                        nls.localize('showOrFocusHover.focus.focusIfVisible', 'The hover will take focus only if it is already visible.'),
                                        nls.localize('showOrFocusHover.focus.autoFocusImmediately', 'The hover will automatically take focus when it appears.'),
                                    ],
                                    default: HoverFocusBehavior.FocusIfVisible,
                                }
                            },
                        }
                    }]
            },
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */),
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor, args) {
        if (!editor.hasModel()) {
            return;
        }
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        const focusArgument = args?.focus;
        let focusOption = HoverFocusBehavior.FocusIfVisible;
        if (Object.values(HoverFocusBehavior).includes(focusArgument)) {
            focusOption = focusArgument;
        }
        else if (typeof focusArgument === 'boolean' && focusArgument) {
            focusOption = HoverFocusBehavior.AutoFocusImmediately;
        }
        const showContentHover = (focus) => {
            const position = editor.getPosition();
            const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
            controller.showContentHover(range, 1 /* HoverStartMode.Immediate */, 2 /* HoverStartSource.Keyboard */, focus);
        };
        const accessibilitySupportEnabled = editor.getOption(2 /* EditorOption.accessibilitySupport */) === 2 /* AccessibilitySupport.Enabled */;
        if (controller.isHoverVisible) {
            if (focusOption !== HoverFocusBehavior.NoAutoFocus) {
                controller.focus();
            }
            else {
                showContentHover(accessibilitySupportEnabled);
            }
        }
        else {
            showContentHover(accessibilitySupportEnabled || focusOption === HoverFocusBehavior.AutoFocusImmediately);
        }
    }
}
export class ShowDefinitionPreviewHoverAction extends EditorAction {
    constructor() {
        super({
            id: SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'showDefinitionPreviewHover',
                comment: [
                    'Label for action that will trigger the showing of definition preview hover in the editor.',
                    'This allows for users to show the definition preview hover without using the mouse.'
                ]
            }, "Show Definition Preview Hover"),
            precondition: undefined,
            metadata: {
                description: nls.localize2('showDefinitionPreviewHoverDescription', 'Show the definition preview hover in the editor.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        const position = editor.getPosition();
        if (!position) {
            return;
        }
        const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
        const goto = GotoDefinitionAtPositionEditorContribution.get(editor);
        if (!goto) {
            return;
        }
        const promise = goto.startFindDefinitionFromCursor(position);
        promise.then(() => {
            controller.showContentHover(range, 1 /* HoverStartMode.Immediate */, 2 /* HoverStartSource.Keyboard */, true);
        });
    }
}
export class HideContentHoverAction extends EditorAction {
    constructor() {
        super({
            id: HIDE_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'hideHover',
                comment: ['Label for action that will hide the hover in the editor.']
            }, "Hide Hover"),
            alias: 'Hide Content Hover',
            precondition: undefined
        });
    }
    run(accessor, editor) {
        ContentHoverController.get(editor)?.hideContentHover();
    }
}
export class ScrollUpHoverAction extends EditorAction {
    constructor() {
        super({
            id: SCROLL_UP_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'scrollUpHover',
                comment: [
                    'Action that allows to scroll up in the hover widget with the up arrow when the hover widget is focused.'
                ]
            }, "Scroll Up Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 16 /* KeyCode.UpArrow */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('scrollUpHoverDescription', 'Scroll up the editor hover.')
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.scrollUp();
    }
}
export class ScrollDownHoverAction extends EditorAction {
    constructor() {
        super({
            id: SCROLL_DOWN_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'scrollDownHover',
                comment: [
                    'Action that allows to scroll down in the hover widget with the up arrow when the hover widget is focused.'
                ]
            }, "Scroll Down Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 18 /* KeyCode.DownArrow */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('scrollDownHoverDescription', 'Scroll down the editor hover.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.scrollDown();
    }
}
export class ScrollLeftHoverAction extends EditorAction {
    constructor() {
        super({
            id: SCROLL_LEFT_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'scrollLeftHover',
                comment: [
                    'Action that allows to scroll left in the hover widget with the left arrow when the hover widget is focused.'
                ]
            }, "Scroll Left Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 15 /* KeyCode.LeftArrow */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('scrollLeftHoverDescription', 'Scroll left the editor hover.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.scrollLeft();
    }
}
export class ScrollRightHoverAction extends EditorAction {
    constructor() {
        super({
            id: SCROLL_RIGHT_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'scrollRightHover',
                comment: [
                    'Action that allows to scroll right in the hover widget with the right arrow when the hover widget is focused.'
                ]
            }, "Scroll Right Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 17 /* KeyCode.RightArrow */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('scrollRightHoverDescription', 'Scroll right the editor hover.')
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.scrollRight();
    }
}
export class PageUpHoverAction extends EditorAction {
    constructor() {
        super({
            id: PAGE_UP_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'pageUpHover',
                comment: [
                    'Action that allows to page up in the hover widget with the page up command when the hover widget is focused.'
                ]
            }, "Page Up Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 11 /* KeyCode.PageUp */,
                secondary: [512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */],
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('pageUpHoverDescription', 'Page up the editor hover.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.pageUp();
    }
}
export class PageDownHoverAction extends EditorAction {
    constructor() {
        super({
            id: PAGE_DOWN_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'pageDownHover',
                comment: [
                    'Action that allows to page down in the hover widget with the page down command when the hover widget is focused.'
                ]
            }, "Page Down Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 12 /* KeyCode.PageDown */,
                secondary: [512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */],
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('pageDownHoverDescription', 'Page down the editor hover.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.pageDown();
    }
}
export class GoToTopHoverAction extends EditorAction {
    constructor() {
        super({
            id: GO_TO_TOP_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'goToTopHover',
                comment: [
                    'Action that allows to go to the top of the hover widget with the home command when the hover widget is focused.'
                ]
            }, "Go To Top Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 14 /* KeyCode.Home */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */],
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('goToTopHoverDescription', 'Go to the top of the editor hover.'),
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.goToTop();
    }
}
export class GoToBottomHoverAction extends EditorAction {
    constructor() {
        super({
            id: GO_TO_BOTTOM_HOVER_ACTION_ID,
            label: nls.localize2({
                key: 'goToBottomHover',
                comment: [
                    'Action that allows to go to the bottom in the hover widget with the end command when the hover widget is focused.'
                ]
            }, "Go To Bottom Hover"),
            precondition: EditorContextKeys.hoverFocused,
            kbOpts: {
                kbExpr: EditorContextKeys.hoverFocused,
                primary: 13 /* KeyCode.End */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */],
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('goToBottomHoverDescription', 'Go to the bottom of the editor hover.')
            },
        });
    }
    run(accessor, editor) {
        const controller = ContentHoverController.get(editor);
        if (!controller) {
            return;
        }
        controller.goToBottom();
    }
}
export class IncreaseHoverVerbosityLevel extends EditorAction {
    constructor() {
        super({
            id: INCREASE_HOVER_VERBOSITY_ACTION_ID,
            label: INCREASE_HOVER_VERBOSITY_ACTION_LABEL,
            alias: 'Increase Hover Verbosity Level',
            precondition: EditorContextKeys.hoverVisible
        });
    }
    run(accessor, editor, args) {
        const hoverController = ContentHoverController.get(editor);
        if (!hoverController) {
            return;
        }
        const index = args?.index !== undefined ? args.index : hoverController.focusedHoverPartIndex();
        hoverController.updateHoverVerbosityLevel(HoverVerbosityAction.Increase, index, args?.focus);
    }
}
export class DecreaseHoverVerbosityLevel extends EditorAction {
    constructor() {
        super({
            id: DECREASE_HOVER_VERBOSITY_ACTION_ID,
            label: DECREASE_HOVER_VERBOSITY_ACTION_LABEL,
            alias: 'Decrease Hover Verbosity Level',
            precondition: EditorContextKeys.hoverVisible
        });
    }
    run(accessor, editor, args) {
        const hoverController = ContentHoverController.get(editor);
        if (!hoverController) {
            return;
        }
        const index = args?.index !== undefined ? args.index : hoverController.focusedHoverPartIndex();
        ContentHoverController.get(editor)?.updateHoverVerbosityLevel(HoverVerbosityAction.Decrease, index, args?.focus);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9ob3ZlckFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLHFDQUFxQyxFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLG9CQUFvQixFQUFFLGtDQUFrQyxFQUFFLHFDQUFxQyxFQUFFLHlCQUF5QixFQUFFLHVCQUF1QixFQUFFLDJCQUEyQixFQUFFLDJCQUEyQixFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLHVDQUF1QyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDemYsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRixPQUFPLEVBQUUsWUFBWSxFQUFvQixNQUFNLHNDQUFzQyxDQUFDO0FBRXRGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUl2SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRSxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sYUFBYSxDQUFDO0FBRXJCLElBQUssa0JBSUo7QUFKRCxXQUFLLGtCQUFrQjtJQUN0QixpREFBMkIsQ0FBQTtJQUMzQix1REFBaUMsQ0FBQTtJQUNqQyxtRUFBNkMsQ0FBQTtBQUM5QyxDQUFDLEVBSkksa0JBQWtCLEtBQWxCLGtCQUFrQixR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