/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AccessibilityHelpNLS } from 'vs/editor/common/standaloneStrings';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, accessibleViewIsShown, registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import * as strings from 'vs/base/common/strings';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { NEW_UNTITLED_FILE_COMMAND_ID } from 'vs/workbench/contrib/files/browser/fileConstants';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getNotificationFromContext } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { IListService, WorkbenchList } from 'vs/platform/list/browser/listService';
import { NotificationFocusedContext } from 'vs/workbench/common/contextkeys';
import { IAccessibleViewService, AccessibleViewService, IAccessibleContentProvider, IAccessibleViewOptions, AccessibleViewType, AccessibilityHelpAction, AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { UnfocusedViewDimmingContribution } from 'vs/workbench/contrib/accessibility/browser/unfocusedViewDimmingContribution';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);

class AccessibilityHelpProvider implements IAccessibleContentProvider {
	onClose() {
		this._editor.focus();
	}
	options: IAccessibleViewOptions = { type: AccessibleViewType.Help, ariaLabel: localize('editor-help', "editor accessibility help"), readMoreUrl: 'https://go.microsoft.com/fwlink/?linkid=851010' };
	verbositySettingKey = AccessibilityVerbositySettingId.Editor;
	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return strings.format(msg, kb.getAriaLabel());
		}
		return strings.format(noKbMsg, commandId);
	}

	provideContent(): string {
		const options = this._editor.getOptions();
		const content = [];

		if (options.get(EditorOption.inDiffEditor)) {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyDiffEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableDiffEditor);
			}
		} else {
			if (options.get(EditorOption.readOnly)) {
				content.push(AccessibilityHelpNLS.readonlyEditor);
			} else {
				content.push(AccessibilityHelpNLS.editableEditor);
			}
		}

		if (options.get(EditorOption.tabFocusMode)) {
			content.push(this._descriptionForCommand(ToggleTabFocusModeAction.ID, AccessibilityHelpNLS.tabFocusModeOnMsg, AccessibilityHelpNLS.tabFocusModeOnMsgNoKb));
		} else {
			content.push(this._descriptionForCommand(ToggleTabFocusModeAction.ID, AccessibilityHelpNLS.tabFocusModeOffMsg, AccessibilityHelpNLS.tabFocusModeOffMsgNoKb));
		}
		return content.join('\n');
	}
}

class EditorAccessibilityHelpContribution extends Disposable {
	static ID: 'editorAccessibilityHelpContribution';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(95, 'editor', async accessor => {
			const codeEditorService = accessor.get(ICodeEditorService);
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const instantiationService = accessor.get(IInstantiationService);
			const commandService = accessor.get(ICommandService);
			let codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			if (!codeEditor) {
				await commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
				codeEditor = codeEditorService.getActiveCodeEditor()!;
			}
			accessibleViewService.show(instantiationService.createInstance(AccessibilityHelpProvider, codeEditor));
		}));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, LifecyclePhase.Restored);



class HoverAccessibleViewContribution extends Disposable {
	static ID: 'hoverAccessibleViewContribution';
	private _options: IAccessibleViewOptions = {
		ariaLabel: localize('hoverAccessibleView', "Hover Accessible View"), language: 'typescript', type: AccessibleViewType.View
	};
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(95, 'hover', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);
			const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
			const editorHoverContent = editor ? ModesHoverController.get(editor)?.getWidgetContent() ?? undefined : undefined;
			if (!editor || !editorHoverContent) {
				return false;
			}
			this._options.language = editor?.getModel()?.getLanguageId() ?? undefined;
			accessibleViewService.show({
				verbositySettingKey: AccessibilityVerbositySettingId.Hover,
				provideContent() { return editorHoverContent; },
				onClose() {
					ModesHoverController.get(editor)?.focus();
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

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(HoverAccessibleViewContribution, LifecyclePhase.Eventually);


class NotificationAccessibleViewContribution extends Disposable {
	static ID: 'notificationAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(90, 'notifications', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const listService = accessor.get(IListService);
			const commandService = accessor.get(ICommandService);

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
				accessibleViewService.show({
					provideContent: () => {
						return localize('notification.accessibleView', '{0} Source: {1}', message, notification.source);
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
					options: {
						ariaLabel: localize('notification', "Notification Accessible View"),
						type: AccessibleViewType.View
					}
				});
				return true;
			}
			return renderAccessibleView();
		}, NotificationFocusedContext));
	}
}

workbenchContributionsRegistry.registerWorkbenchContribution(NotificationAccessibleViewContribution, LifecyclePhase.Eventually);

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
