/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandHandler, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';

const inQuickOpenKey = 'inQuickOpen';
export const InQuickOpenContextKey = new RawContextKey<boolean>(inQuickOpenKey, false);
export const inQuickOpenContext = ContextKeyExpr.has(inQuickOpenKey);
export const defaultQuickOpenContextKey = 'inFilesPicker';
export const defaultQuickOpenContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(defaultQuickOpenContextKey));

export const QUICKOPEN_ACTION_ID = 'workbench.action.quickOpen';
export const QUICKOPEN_ACION_LABEL = nls.localize('quickOpen', "Go to File...");

CommandsRegistry.registerCommand({
	id: QUICKOPEN_ACTION_ID,
	handler: async function (accessor: ServicesAccessor, prefix: string | null = null) {
		const quickOpenService = accessor.get(IQuickOpenService);

		await quickOpenService.show(typeof prefix === 'string' ? prefix : undefined);
	},
	description: {
		description: `Quick open`,
		args: [{
			name: 'prefix',
			schema: {
				'type': 'string'
			}
		}]
	}
});

export const QUICKOPEN_FOCUS_SECONDARY_ACTION_ID = 'workbench.action.quickOpenPreviousEditor';
CommandsRegistry.registerCommand(QUICKOPEN_FOCUS_SECONDARY_ACTION_ID, async function (accessor: ServicesAccessor, prefix: string | null = null) {
	const quickOpenService = accessor.get(IQuickOpenService);

	await quickOpenService.show(undefined, { autoFocus: { autoFocusSecondEntry: true } });
});

export class BaseQuickOpenNavigateAction extends Action {

	constructor(
		id: string,
		label: string,
		private next: boolean,
		private quickNavigate: boolean,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		const keys = this.keybindingService.lookupKeybindings(this.id);
		const quickNavigate = this.quickNavigate ? { keybindings: keys } : undefined;

		this.quickOpenService.navigate(this.next, quickNavigate);
		this.quickInputService.navigate(this.next, quickNavigate);
	}
}

export function getQuickNavigateHandler(id: string, next?: boolean): ICommandHandler {
	return accessor => {
		const keybindingService = accessor.get(IKeybindingService);
		const quickOpenService = accessor.get(IQuickOpenService);
		const quickInputService = accessor.get(IQuickInputService);

		const keys = keybindingService.lookupKeybindings(id);
		const quickNavigate = { keybindings: keys };

		quickOpenService.navigate(!!next, quickNavigate);
		quickInputService.navigate(!!next, quickNavigate);
	};
}

export class QuickOpenNavigateNextAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenNavigateNext';
	static readonly LABEL = nls.localize('quickNavigateNext', "Navigate Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, true, quickOpenService, quickInputService, keybindingService);
	}
}

export class QuickOpenNavigatePreviousAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenNavigatePrevious';
	static readonly LABEL = nls.localize('quickNavigatePrevious', "Navigate Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, true, quickOpenService, quickInputService, keybindingService);
	}
}

export class QuickOpenSelectNextAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenSelectNext';
	static readonly LABEL = nls.localize('quickSelectNext', "Select Next in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, true, false, quickOpenService, quickInputService, keybindingService);
	}
}

export class QuickOpenSelectPreviousAction extends BaseQuickOpenNavigateAction {

	static readonly ID = 'workbench.action.quickOpenSelectPrevious';
	static readonly LABEL = nls.localize('quickSelectPrevious', "Select Previous in Quick Open");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(id, label, false, false, quickOpenService, quickInputService, keybindingService);
	}
}

// TODO@Ben delete eventually when quick open is implemented using quick input
export class LegacyQuickInputQuickOpenController extends Disposable {

	private readonly inQuickOpenWidgets: Record<string, boolean> = Object.create(null);
	private readonly inQuickOpenContext = InQuickOpenContextKey.bindTo(this.contextKeyService);

	constructor(
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.quickOpenService.onShow(() => this.inQuickOpen('quickOpen', true)));
		this._register(this.quickOpenService.onHide(() => this.inQuickOpen('quickOpen', false)));

		this._register(this.quickOpenService.onShow(() => this.quickInputService.hide(true)));

		this._register(this.quickInputService.onShow(() => {
			this.quickOpenService.close();
			this.inQuickOpen('quickInput', true);
		}));

		this._register(this.quickInputService.onHide(() => {
			this.inQuickOpen('quickInput', false);
		}));
	}

	private inQuickOpen(widget: 'quickInput' | 'quickOpen', open: boolean) {
		if (open) {
			this.inQuickOpenWidgets[widget] = true;
		} else {
			delete this.inQuickOpenWidgets[widget];
		}

		if (Object.keys(this.inQuickOpenWidgets).length) {
			if (!this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.set(true);
			}
		} else {
			if (this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.reset();
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LegacyQuickInputQuickOpenController, LifecyclePhase.Ready);
