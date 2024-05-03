/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DECREASE_HOVER_VERBOSITY_ACTION_ID, GO_TO_BOTTOM_HOVER_ACTION_ID, GO_TO_TOP_HOVER_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, PAGE_DOWN_HOVER_ACTION_ID, PAGE_UP_HOVER_ACTION_ID, SCROLL_DOWN_HOVER_ACTION_ID, SCROLL_LEFT_HOVER_ACTION_ID, SCROLL_RIGHT_HOVER_ACTION_ID, SCROLL_UP_HOVER_ACTION_ID, SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { GotoDefinitionAtPositionEditorContribution } from 'vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { HoverVerbosityAction } from 'vs/editor/common/languages';
import * as nls from 'vs/nls';
import 'vs/css!./hover';

enum HoverFocusBehavior {
	NoAutoFocus = 'noAutoFocus',
	FocusIfVisible = 'focusIfVisible',
	AutoFocusImmediately = 'autoFocusImmediately'
}

export class ShowOrFocusHoverAction extends EditorAction {

	constructor() {
		super({
			id: SHOW_OR_FOCUS_HOVER_ACTION_ID,
			label: nls.localize({
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
			alias: 'Show or Focus Hover',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		if (!editor.hasModel()) {
			return;
		}

		const controller = HoverController.get(editor);
		if (!controller) {
			return;
		}

		const focusArgument = args?.focus;
		let focusOption = HoverFocusBehavior.FocusIfVisible;
		if (Object.values(HoverFocusBehavior).includes(focusArgument)) {
			focusOption = focusArgument;
		} else if (typeof focusArgument === 'boolean' && focusArgument) {
			focusOption = HoverFocusBehavior.AutoFocusImmediately;
		}

		const showContentHover = (focus: boolean) => {
			const position = editor.getPosition();
			const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
			controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, focus);
		};

		const accessibilitySupportEnabled = editor.getOption(EditorOption.accessibilitySupport) === AccessibilitySupport.Enabled;

		if (controller.isHoverVisible) {
			if (focusOption !== HoverFocusBehavior.NoAutoFocus) {
				controller.focus();
			} else {
				showContentHover(accessibilitySupportEnabled);
			}
		} else {
			showContentHover(accessibilitySupportEnabled || focusOption === HoverFocusBehavior.AutoFocusImmediately);
		}
	}
}

export class ShowDefinitionPreviewHoverAction extends EditorAction {

	constructor() {
		super({
			id: SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID,
			label: nls.localize({
				key: 'showDefinitionPreviewHover',
				comment: [
					'Label for action that will trigger the showing of definition preview hover in the editor.',
					'This allows for users to show the definition preview hover without using the mouse.'
				]
			}, "Show Definition Preview Hover"),
			alias: 'Show Definition Preview Hover',
			precondition: undefined,
			metadata: {
				description: nls.localize2('showDefinitionPreviewHoverDescription', 'Show the definition preview hover in the editor.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, true);
		});
	}
}

export class ScrollUpHoverAction extends EditorAction {

	constructor() {
		super({
			id: SCROLL_UP_HOVER_ACTION_ID,
			label: nls.localize({
				key: 'scrollUpHover',
				comment: [
					'Action that allows to scroll up in the hover widget with the up arrow when the hover widget is focused.'
				]
			}, "Scroll Up Hover"),
			alias: 'Scroll Up Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollUpHoverDescription', 'Scroll up the editor hover.')
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'scrollDownHover',
				comment: [
					'Action that allows to scroll down in the hover widget with the up arrow when the hover widget is focused.'
				]
			}, "Scroll Down Hover"),
			alias: 'Scroll Down Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollDownHoverDescription', 'Scroll down the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'scrollLeftHover',
				comment: [
					'Action that allows to scroll left in the hover widget with the left arrow when the hover widget is focused.'
				]
			}, "Scroll Left Hover"),
			alias: 'Scroll Left Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.LeftArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollLeftHoverDescription', 'Scroll left the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'scrollRightHover',
				comment: [
					'Action that allows to scroll right in the hover widget with the right arrow when the hover widget is focused.'
				]
			}, "Scroll Right Hover"),
			alias: 'Scroll Right Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.RightArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollRightHoverDescription', 'Scroll right the editor hover.')
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'pageUpHover',
				comment: [
					'Action that allows to page up in the hover widget with the page up command when the hover widget is focused.'
				]
			}, "Page Up Hover"),
			alias: 'Page Up Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.PageUp,
				secondary: [KeyMod.Alt | KeyCode.UpArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('pageUpHoverDescription', 'Page up the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'pageDownHover',
				comment: [
					'Action that allows to page down in the hover widget with the page down command when the hover widget is focused.'
				]
			}, "Page Down Hover"),
			alias: 'Page Down Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.PageDown,
				secondary: [KeyMod.Alt | KeyCode.DownArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('pageDownHoverDescription', 'Page down the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'goToTopHover',
				comment: [
					'Action that allows to go to the top of the hover widget with the home command when the hover widget is focused.'
				]
			}, "Go To Top Hover"),
			alias: 'Go To Bottom Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.Home,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('goToTopHoverDescription', 'Go to the top of the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'goToBottomHover',
				comment: [
					'Action that allows to go to the bottom in the hover widget with the end command when the hover widget is focused.'
				]
			}, "Go To Bottom Hover"),
			alias: 'Go To Bottom Hover',
			precondition: EditorContextKeys.hoverFocused,
			kbOpts: {
				kbExpr: EditorContextKeys.hoverFocused,
				primary: KeyCode.End,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('goToBottomHoverDescription', 'Go to the bottom of the editor hover.')
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = HoverController.get(editor);
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
			label: nls.localize({
				key: 'increaseHoverVerbosityLevel',
				comment: ['Label for action that will increase the hover verbosity level.']
			}, "Increase Hover Verbosity Level"),
			alias: 'Increase Hover Verbosity Level',
			precondition: EditorContextKeys.hoverFocused
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		HoverController.get(editor)?.updateFocusedMarkdownHoverVerbosityLevel(HoverVerbosityAction.Increase);
	}
}

export class DecreaseHoverVerbosityLevel extends EditorAction {

	constructor() {
		super({
			id: DECREASE_HOVER_VERBOSITY_ACTION_ID,
			label: nls.localize({
				key: 'decreaseHoverVerbosityLevel',
				comment: ['Label for action that will decrease the hover verbosity level.']
			}, "Decrease Hover Verbosity Level"),
			alias: 'Decrease Hover Verbosity Level',
			precondition: EditorContextKeys.hoverFocused
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		HoverController.get(editor)?.updateFocusedMarkdownHoverVerbosityLevel(HoverVerbosityAction.Decrease);
	}
}
