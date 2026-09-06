/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { getSelectionSearchString, NextMatchFindAction, PreviousMatchFindAction, StartFindAction } from '../../../../../editor/contrib/find/browser/findController.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatFindController, IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatFindCommandId } from '../widget/chatFind/chatFindCommandIds.js';
import { CHAT_CATEGORY } from './chatActions.js';

/** Returns the focused chat widget, falling back to the most recently focused widget. */
export function resolveFocusedChatWidget(widgets: readonly IChatWidget[], lastFocusedWidget: IChatWidget | undefined, isFocusAncestor: (element: HTMLElement) => boolean): IChatWidget | undefined {
	return widgets.find(w => w.getFindController() && isFocusAncestor(w.domNode)) ?? lastFocusedWidget;
}

function getFocusedFindWidget(accessor: ServicesAccessor): IChatWidget | undefined {
	const widgetService = accessor.get(IChatWidgetService);
	return resolveFocusedChatWidget(widgetService.getAllWidgets(), widgetService.lastFocusedWidget, dom.isAncestorOfActiveElement);
}

export function getFocusedFindController(accessor: ServicesAccessor): IChatFindController | undefined {
	return getFocusedFindWidget(accessor)?.getFindController();
}

function getSeedSearchText(targetWindow: Window, codeEditor?: ICodeEditor): string | undefined {
	const domSelection = targetWindow.getSelection()?.toString();
	if (domSelection && domSelection.trim().length > 0) {
		return domSelection;
	}
	const editorSelection = codeEditor && getSelectionSearchString(codeEditor, 'single', false);
	return editorSelection ?? undefined;
}

function findOwningChatWidget(accessor: ServicesAccessor, codeEditor: ICodeEditor): IChatWidget | undefined {
	const editorDomNode = codeEditor.getDomNode();
	if (!editorDomNode) {
		return undefined;
	}
	return accessor.get(IChatWidgetService).getAllWidgets().find(widget => widget.getFindController() && dom.isAncestor(editorDomNode, widget.domNode));
}

export function registerChatFindActions(): void {

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.Find,
				title: localize2('chat.find', "Find in Chat"),
				category: CHAT_CATEGORY,
				f1: true,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.findSupported),
				keybinding: {
					when: ContextKeyExpr.and(ChatContextKeys.findSupported, ChatContextKeys.inChatSession, EditorContextKeys.focus.toNegated()),
					primary: KeyMod.CtrlCmd | KeyCode.KeyF,
					weight: KeybindingWeight.WorkbenchContrib,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			const widget = getFocusedFindWidget(accessor);
			const controller = widget?.getFindController();
			if (!widget || !controller) {
				return;
			}
			controller.show(getSeedSearchText(dom.getWindow(widget.domNode)));
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.FindHide,
				title: localize2('chat.hideFind', "Hide Find in Chat"),
				keybinding: {
					when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.findWidgetVisible, ContextKeyExpr.or(ChatContextKeys.findWidgetFocused, ChatContextKeys.findInputFocused)),
					primary: KeyCode.Escape,
					weight: KeybindingWeight.WorkbenchContrib,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.hide();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.FindNext,
				title: localize2('chat.findNext', "Find Next in Chat"),
				keybinding: [
					{
						when: ContextKeyExpr.and(ChatContextKeys.findSupported, ChatContextKeys.inChatSession, EditorContextKeys.focus.toNegated()),
						primary: KeyCode.F3,
						mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
						weight: KeybindingWeight.WorkbenchContrib,
					},
					{
						when: ChatContextKeys.findInputFocused,
						primary: KeyCode.Enter,
						weight: KeybindingWeight.WorkbenchContrib,
					},
				],
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.next();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.FindPrevious,
				title: localize2('chat.findPrevious', "Find Previous in Chat"),
				keybinding: [
					{
						when: ContextKeyExpr.and(ChatContextKeys.findSupported, ChatContextKeys.inChatSession, EditorContextKeys.focus.toNegated()),
						primary: KeyMod.Shift | KeyCode.F3,
						mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
						weight: KeybindingWeight.WorkbenchContrib,
					},
					{
						when: ChatContextKeys.findInputFocused,
						primary: KeyMod.Shift | KeyCode.Enter,
						weight: KeybindingWeight.WorkbenchContrib,
					},
				],
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.previous();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.ToggleFindCaseSensitive,
				title: localize2('chat.toggleFindCaseSensitive', "Toggle Find Case Sensitive in Chat"),
				keybinding: {
					when: ChatContextKeys.findWidgetVisible,
					primary: KeyMod.Alt | KeyCode.KeyC,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC },
					weight: KeybindingWeight.WorkbenchContrib,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.toggleCaseSensitive();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.ToggleFindRegex,
				title: localize2('chat.toggleFindRegex', "Toggle Find Using Regex in Chat"),
				keybinding: {
					when: ChatContextKeys.findWidgetVisible,
					primary: KeyMod.Alt | KeyCode.KeyR,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR },
					weight: KeybindingWeight.WorkbenchContrib,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.toggleRegex();
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ChatFindCommandId.ToggleFindWholeWord,
				title: localize2('chat.toggleFindWholeWord', "Toggle Find Using Whole Word in Chat"),
				keybinding: {
					when: ChatContextKeys.findWidgetVisible,
					primary: KeyMod.Alt | KeyCode.KeyW,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW },
					weight: KeybindingWeight.WorkbenchContrib,
				},
			});
		}
		run(accessor: ServicesAccessor): void {
			getFocusedFindController(accessor)?.toggleWholeWord();
		}
	});

	StartFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor) => {
		const widget = findOwningChatWidget(accessor, codeEditor);
		const controller = widget?.getFindController();
		if (!widget || !controller) {
			return false;
		}
		controller.show(getSeedSearchText(dom.getWindow(widget.domNode), codeEditor), true);
		return true;
	});

	NextMatchFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor) => {
		const widget = findOwningChatWidget(accessor, codeEditor);
		const controller = widget?.getFindController();
		if (!controller || !controller.visible) {
			return false;
		}
		controller.next();
		return true;
	});

	PreviousMatchFindAction.addImplementation(100, (accessor: ServicesAccessor, codeEditor: ICodeEditor) => {
		const widget = findOwningChatWidget(accessor, codeEditor);
		const controller = widget?.getFindController();
		if (!controller || !controller.visible) {
			return false;
		}
		controller.previous();
		return true;
	});

}
