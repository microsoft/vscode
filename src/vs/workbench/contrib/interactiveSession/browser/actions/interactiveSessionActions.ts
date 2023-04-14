/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
// import { CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IInteractiveSessionEditorOptions, InteractiveSessionEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { InteractiveSessionViewPane } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionViewPane';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { CONTEXT_IN_INTERACTIVE_INPUT, CONTEXT_IN_INTERACTIVE_SESSION } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContextKeys';
import { IInteractiveSessionWidgetHistoryService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWidgetHistoryService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const INTERACTIVE_SESSION_CATEGORY = { value: localize('interactiveSession.category', "Interactive Session"), original: 'Interactive Session' };

export function registerInteractiveSessionActions() {
	registerEditorAction(class InteractiveSessionAcceptInput extends EditorAction {
		constructor() {
			super({
				id: 'interactiveSession.action.acceptInput',
				label: localize({ key: 'actions.ineractiveSession.acceptInput', comment: ['Apply input from the interactive session input box'] }, "Interactive Session Accept Input"),
				alias: 'Interactive Session Accept Input',
				precondition: CONTEXT_IN_INTERACTIVE_INPUT,
				kbOpts: {
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyCode.Enter,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IInteractiveSessionWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.acceptInput();
			}
		}
	});

	registerAction2(class ClearEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSessionEditor.clear',
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				icon: Codicon.clearAll,
				f1: false,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(InteractiveSessionEditor.ID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const editorService = accessor.get(IEditorService);
			if (editorService.activeEditorPane instanceof InteractiveSessionEditor) {
				await editorService.activeEditorPane.clear();
			}
		}
	});

	registerAction2(class ClearEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSessionEditor.clearHistory',
				title: {
					value: localize('interactiveSession.clearHistory.label', "Clear Input History"),
					original: 'Clear Input History'
				},
				category: INTERACTIVE_SESSION_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const historyService = accessor.get(IInteractiveSessionWidgetHistoryService);
			historyService.clearHistory();
		}
	});

	registerEditorAction(class FocusInteractiveSessionAction extends EditorAction {
		constructor() {
			super({
				id: 'interactiveSession.action.focus',
				label: localize('actions.interactiveSession.focus', "Focus Interactive Session"),
				alias: 'Focus Interactive Session',
				precondition: CONTEXT_IN_INTERACTIVE_INPUT,
				kbOpts: {
					kbExpr: EditorContextKeys.textInputFocus,
					primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
					weight: KeybindingWeight.EditorContrib
				}
			});
		}

		run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IInteractiveSessionWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.focusLastMessage();
			}
		}
	});

	registerAction2(class FocusInteractiveSessionInputAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.focusInput',
				title: {
					value: localize('interactiveSession.focusInput.label', "Focus Input"),
					original: 'Focus Input'
				},
				f1: false,
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ContextKeyExpr.and(CONTEXT_IN_INTERACTIVE_SESSION, ContextKeyExpr.not(EditorContextKeys.focus.key))
				}
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IInteractiveSessionWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});

	registerAction2(class GlobalClearInteractiveSessionAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.interactiveSession.clear`,
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				category: INTERACTIVE_SESSION_CATEGORY,
				icon: Codicon.clearAll,
				f1: true
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IInteractiveSessionWidgetService);
			await widgetService.lastFocusedWidget?.clear();
		}
	});
}

export function getOpenInteractiveSessionEditorAction(id: string, label: string, when?: string) {
	return class OpenInteractiveSessionEditor extends Action2 {
		constructor() {
			super({
				id: `workbench.action.openInteractiveSession.${id}`,
				title: { value: localize('interactiveSession.open', "Open Editor ({0})", label), original: `Open Editor (${label})` },
				f1: true,
				category: INTERACTIVE_SESSION_CATEGORY,
				precondition: ContextKeyExpr.deserialize(when)
			});
		}

		async run(accessor: ServicesAccessor) {
			const editorService = accessor.get(IEditorService);
			await editorService.openEditor({ resource: InteractiveSessionEditorInput.getNewEditorUri(), options: <IInteractiveSessionEditorOptions>{ providerId: id, pinned: true } });
		}
	};
}

const getClearInteractiveSessionActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	viewId,
	id: `workbench.action.interactiveSession.${providerId}.clear`,
	title: {
		value: localize('interactiveSession.clear.label', "Clear"),
		original: 'Clear'
	},
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		group: 'navigation',
		order: 0
	},
	category: INTERACTIVE_SESSION_CATEGORY,
	icon: Codicon.clearAll,
	f1: false
});

export function getClearAction(viewId: string, providerId: string) {
	return class ClearAction extends ViewAction<InteractiveSessionViewPane> {
		constructor() {
			super(getClearInteractiveSessionActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: InteractiveSessionViewPane) {
			await view.clear();
		}
	};
}
