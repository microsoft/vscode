/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId, accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import * as strings from 'vs/base/common/strings';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { HoverController } from 'vs/editor/contrib/hover/browser/hover';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getNotificationFromContext } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { IListService, WorkbenchList } from 'vs/platform/list/browser/listService';
import { NotificationFocusedContext } from 'vs/workbench/common/contextkeys';
import { IAccessibleViewService, IAccessibleViewOptions, AccessibleViewType } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { AccessibilityHelpAction, AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { IAction } from 'vs/base/common/actions';
import { INotificationViewItem } from 'vs/workbench/common/notifications';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { AccessibleNotificationEvent, IAccessibleNotificationService } from 'vs/platform/accessibility/common/accessibility';

export function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return strings.format(msg, kb.getAriaLabel());
	}
	return strings.format(noKbMsg, commandId);
}

export class HoverAccessibleViewContribution extends Disposable {
	static ID: 'hoverAccessibleViewContribution';
	private _options: IAccessibleViewOptions = { language: 'typescript', type: AccessibleViewType.View };
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(95, 'hover', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			const editorHoverContent = editor ? HoverController.get(editor)?.getWidgetContent() ?? undefined : undefined;
			if (!editor || !editorHoverContent) {
				return false;
			}
			this._options.language = editor?.getModel()?.getLanguageId() ?? undefined;
			accessibleViewService.show({
				id: AccessibleViewProviderId.Hover,
				verbositySettingKey: AccessibilityVerbositySettingId.Hover,
				provideContent() { return editorHoverContent; },
				onClose() {
					HoverController.get(editor)?.focus();
				},
				options: this._options
			});
			return true;
		}, EditorContextKeys.hoverFocused));
		this._register(AccessibleViewAction.addImplementation(90, 'extension-hover', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const contextViewService = accessor.get(IContextViewService);
			const contextViewElement = contextViewService.getContextViewElement();
			const extensionHoverContent = contextViewElement?.textContent ?? undefined;
			const hoverService = accessor.get(IHoverService);

			if (contextViewElement.classList.contains('accessible-view-container') || !extensionHoverContent) {
				// The accessible view, itself, uses the context view service to display the text. We don't want to read that.
				return false;
			}
			accessibleViewService.show({
				id: AccessibleViewProviderId.Hover,
				verbositySettingKey: AccessibilityVerbositySettingId.Hover,
				provideContent() { return extensionHoverContent; },
				onClose() {
					hoverService.showAndFocusLastHover();
				},
				options: this._options
			});
			return true;
		}));
		this._register(AccessibilityHelpAction.addImplementation(115, 'accessible-view', accessor => {
			accessor.get(IAccessibleViewService).showAccessibleViewHelp();
			return true;
		}, accessibleViewIsShown));
	}
}

export class NotificationAccessibleViewContribution extends Disposable {
	static ID: 'notificationAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(90, 'notifications', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const listService = accessor.get(IListService);
			const commandService = accessor.get(ICommandService);
			const accessibleNotificationService = accessor.get(IAccessibleNotificationService);

			function renderAccessibleView(): boolean {
				const notification = getNotificationFromContext(listService);
				if (!notification) {
					return false;
				}
				commandService.executeCommand('notifications.showList');
				let notificationIndex: number | undefined;
				let length: number | undefined;
				const list = listService.lastFocusedList;
				if (list instanceof WorkbenchList) {
					notificationIndex = list.indexOf(notification);
					length = list.length;
				}
				if (notificationIndex === undefined) {
					return false;
				}

				function focusList(): void {
					commandService.executeCommand('notifications.showList');
					if (list && notificationIndex !== undefined) {
						list.domFocus();
						try {
							list.setFocus([notificationIndex]);
						} catch { }
					}
				}
				const message = notification.message.original.toString();
				if (!message) {
					return false;
				}
				notification.onDidClose(() => accessibleViewService.next());
				accessibleViewService.show({
					id: AccessibleViewProviderId.Notification,
					provideContent: () => {
						return notification.source ? localize('notification.accessibleViewSrc', '{0} Source: {1}', message, notification.source) : localize('notification.accessibleView', '{0}', message);
					},
					onClose(): void {
						focusList();
					},
					next(): void {
						if (!list) {
							return;
						}
						focusList();
						list.focusNext();
						alertFocusChange(notificationIndex, length, 'next');
						renderAccessibleView();
					},
					previous(): void {
						if (!list) {
							return;
						}
						focusList();
						list.focusPrevious();
						alertFocusChange(notificationIndex, length, 'previous');
						renderAccessibleView();
					},
					verbositySettingKey: AccessibilityVerbositySettingId.Notification,
					options: { type: AccessibleViewType.View },
					actions: getActionsFromNotification(notification, accessibleNotificationService)
				});
				return true;
			}
			return renderAccessibleView();
		}, NotificationFocusedContext));
	}
}

function getActionsFromNotification(notification: INotificationViewItem, accessibleNotificationService: IAccessibleNotificationService): IAction[] | undefined {
	let actions = undefined;
	if (notification.actions) {
		actions = [];
		if (notification.actions.primary) {
			actions.push(...notification.actions.primary);
		}
		if (notification.actions.secondary) {
			actions.push(...notification.actions.secondary);
		}
	}
	if (actions) {
		for (const action of actions) {
			action.class = ThemeIcon.asClassName(Codicon.bell);
			const initialAction = action.run;
			action.run = () => {
				initialAction();
				notification.close();
			};
		}
	}
	const manageExtension = actions?.find(a => a.label.includes('Manage Extension'));
	if (manageExtension) {
		manageExtension.class = ThemeIcon.asClassName(Codicon.gear);
	}
	if (actions) {
		actions.push({
			id: 'clearNotification', label: localize('clearNotification', "Clear Notification"), tooltip: localize('clearNotification', "Clear Notification"), run: () => {
				notification.close();
				accessibleNotificationService.notify(AccessibleNotificationEvent.Clear);
			}, enabled: true, class: ThemeIcon.asClassName(Codicon.clearAll)
		});
	}
	return actions;
}

export function alertFocusChange(index: number | undefined, length: number | undefined, type: 'next' | 'previous'): void {
	if (index === undefined || length === undefined) {
		return;
	}
	const number = index + 1;

	if (type === 'next' && number + 1 <= length) {
		alert(`Focused ${number + 1} of ${length}`);
	} else if (type === 'previous' && number - 1 > 0) {
		alert(`Focused ${number - 1} of ${length}`);
	}
	return;
}

export class InlineCompletionsAccessibleViewContribution extends Disposable {
	static ID: 'inlineCompletionsAccessibleViewContribution';
	private _options: IAccessibleViewOptions = { type: AccessibleViewType.View };
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(95, 'inline-completions', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const show = () => {
				const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
				if (!editor) {
					return false;
				}
				const model = InlineCompletionsController.get(editor)?.model.get();
				const state = model?.state.get();
				if (!model || !state) {
					return false;
				}
				const lineText = model.textModel.getLineContent(state.ghostText.lineNumber);
				const ghostText = state.ghostText.renderForScreenReader(lineText);
				if (!ghostText) {
					return false;
				}
				this._options.language = editor.getModel()?.getLanguageId() ?? undefined;
				accessibleViewService.show({
					id: AccessibleViewProviderId.InlineCompletions,
					verbositySettingKey: AccessibilityVerbositySettingId.InlineCompletions,
					provideContent() { return lineText + ghostText; },
					onClose() {
						model.stop();
						editor.focus();
					},
					next() {
						model.next();
						setTimeout(() => show(), 50);
					},
					previous() {
						model.previous();
						setTimeout(() => show(), 50);
					},
					options: this._options
				});
				return true;
			}; ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionVisible);
			return show();
		}));
	}
}
