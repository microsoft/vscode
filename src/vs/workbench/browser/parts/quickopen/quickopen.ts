/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export const inQuickOpenContext = ContextKeyExpr.has('inQuickOpen');
export const defaultQuickOpenContextKey = 'inFilesPicker';
export const defaultQuickOpenContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(defaultQuickOpenContextKey));

export const QUICKOPEN_ACTION_ID = 'workbench.action.quickOpen';
export const QUICKOPEN_ACION_LABEL = nls.localize('quickOpen', "Go to File...");

CommandsRegistry.registerCommand(QUICKOPEN_ACTION_ID, function (accessor: ServicesAccessor, prefix: string = null) {
	const quickOpenService = accessor.get(IQuickOpenService);

	return quickOpenService.show(typeof prefix === 'string' ? prefix : null).then(() => {
		return void 0;
	});
});

export const QUICKOPEN_FOCUS_SECONDARY_ACTION_ID = 'workbench.action.quickOpenPreviousEditor';
CommandsRegistry.registerCommand(QUICKOPEN_FOCUS_SECONDARY_ACTION_ID, function (accessor: ServicesAccessor, prefix: string = null) {
	const quickOpenService = accessor.get(IQuickOpenService);

	return quickOpenService.show(null, { autoFocus: { autoFocusSecondEntry: true } }).then(() => {
		return void 0;
	});
});

export class BaseQuickOpenNavigateAction extends Action {

	constructor(
		id: string,
		label: string,
		private next: boolean,
		private quickNavigate: boolean,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		const keys = this.keybindingService.lookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : void 0;

		this.quickOpenService.navigate(this.next, quickNavigate);

		return TPromise.as(true);
	}
}

export function getQuickNavigateHandler(id: string, next?: boolean): ICommandHandler {
	return accessor => {
		const keybindingService = accessor.get(IKeybindingService);
		const quickOpenService = accessor.get(IQuickOpenService);

		const keys = keybindingService.lookupKeybindings(id);
		const quickNavigate = { keybindings: keys };

		quickOpenService.navigate(next, quickNavigate);
	};
}

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	public static readonly ID = 'workbench.action.quickOpenNavigateNext';
	public static readonly LABEL = nls.localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, true, quickOpenService, keybindingService);
	}
}

export class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	public static readonly ID = 'workbench.action.quickOpenNavigatePrevious';
	public static readonly LABEL = nls.localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, true, quickOpenService, keybindingService);
	}
}

export class QuickOpenSelectNextAction extends BaseQuickOpenNavigateAction {

	public static readonly ID = 'workbench.action.quickOpenSelectNext';
	public static readonly LABEL = nls.localize('quickSelectNext', "Select Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, false, quickOpenService, keybindingService);
	}
}

export class QuickOpenSelectPreviousAction extends BaseQuickOpenNavigateAction {

	public static readonly ID = 'workbench.action.quickOpenSelectPrevious';
	public static readonly LABEL = nls.localize('quickSelectPrevious', "Select Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, false, quickOpenService, keybindingService);
	}
}