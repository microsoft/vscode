/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, GO_TO_BOTTOM_HOVER_ACTION_ID, GO_TO_TOP_HOVER_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL, PAGE_DOWN_HOVER_ACTION_ID, PAGE_UP_HOVER_ACTION_ID, SCROLL_DOWN_HOVER_ACTION_ID, SCROLL_LEFT_HOVER_ACTION_ID, SCROLL_RIGHT_HOVER_ACTION_ID, SCROLL_UP_HOVER_ACTION_ID, SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from './hoverActionIds.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import { HoverStartMode, HoverStartSource } from './hoverOperation.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContentHoverController } from './contentHoverController.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import * as nls from '../../../../nls.js';
import './hover.css';

enum HoverFocusBehavior {
	NoAutoFocus = 'noAutoFocus',
	FocusIfVisible = 'focusIfVisible',
	AutoFocusImmediately = 'autoFocusImmediately'
}

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
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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
			controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, true);
		});
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
				primary: KeyCode.UpArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollUpHoverDescription', 'Scroll up the editor hover.')
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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
				primary: KeyCode.DownArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollDownHoverDescription', 'Scroll down the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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
				primary: KeyCode.LeftArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollLeftHoverDescription', 'Scroll left the editor hover.'),
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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
				primary: KeyCode.RightArrow,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('scrollRightHoverDescription', 'Scroll right the editor hover.')
			},
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args?: { index: number; focus: boolean }): void {
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args?: { index: number; focus: boolean }): void {
		const hoverController = ContentHoverController.get(editor);
		if (!hoverController) {
			return;
		}
		const index = args?.index !== undefined ? args.index : hoverController.focusedHoverPartIndex();
		ContentHoverController.get(editor)?.updateHoverVerbosityLevel(HoverVerbosityAction.Decrease, index, args?.focus);
	}
}
