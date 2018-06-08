/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { HistoryInputBox, IHistoryInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { createWidgetScopedContextKeyService, IWidget } from 'vs/platform/widget/browser/widget';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { localize } from 'vs/nls';

export const HistoryInputBoxContext = 'historyInputBox';

export class ContextScopedHistoryInputBox extends HistoryInputBox implements IWidget {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IHistoryInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createWidgetScopedContextKeyService(contextKeyService, this, HistoryInputBoxContext));
	}
}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createWidgetScopedContextKeyService(contextKeyService, this.inputBox, HistoryInputBoxContext));
	}

}

export function showDeprecatedWarning(notificationService: INotificationService, keybindingService: IKeybindingService, storageService: IStorageService): void {
	const previousCommand = 'input.action.historyPrevious';
	const nextCommand = 'input.action.historyNext';
	let previousKeybinding: ResolvedKeybindingItem, nextKeybinding: ResolvedKeybindingItem;
	for (const keybinding of keybindingService.getKeybindings()) {
		if (keybinding.command === previousCommand) {
			if (!keybinding.isDefault) {
				return;
			}
			previousKeybinding = keybinding;
		}
		if (keybinding.command === nextCommand) {
			if (!keybinding.isDefault) {
				return;
			}
			nextKeybinding = keybinding;
		}
	}
	const key = 'donotshow.historyNavigation.warning';
	if (!storageService.getBoolean(key, StorageScope.GLOBAL, false)) {
		const message = localize('showDeprecatedWarningMessage', "History navigation commands you are using are deprecated. Instead use following new commands: {0} and {1}", `${previousCommand} (${previousKeybinding.resolvedKeybinding.getLabel()})`, `${nextCommand} (${nextKeybinding.resolvedKeybinding.getLabel()})`);
		notificationService.prompt(Severity.Warning, message, [
			{
				label: localize('more information', "More Information..."),
				run: () => null
			},
			{
				label: localize('Do not show again', "Don't show again"),
				isSecondary: true,
				run: () => storageService.store(key, true, StorageScope.GLOBAL)
			}
		]);
	}
}