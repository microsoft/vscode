/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ExtensionType, IExtension, isResolverExtension } from 'vs/platform/extensions/common/extensions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INotificationService, IPromptChoice, NotificationPriority, Severity } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

// --- bisect service

export const IExtensionBisectService = createDecorator<IExtensionBisectService>('IExtensionBisectService');

export interface IExtensionBisectService {

	readonly _serviceBrand: undefined;

	isDisabledByBisect(extension: IExtension): boolean;
	isActive: boolean;
	disabledCount: number;
	start(extensions: ILocalExtension[]): Promise<void>;
	next(seeingBad: boolean): Promise<{ id: string; bad: boolean } | undefined>;
	reset(): Promise<void>;
}

class BisectState {

	static fromJSON(raw: string | undefined): BisectState | undefined {
		if (!raw) {
			return undefined;
		}
		try {
			interface Raw extends BisectState { }
			const data: Raw = JSON.parse(raw);
			return new BisectState(data.extensions, data.low, data.high, data.mid);
		} catch {
			return undefined;
		}
	}

	constructor(
		readonly extensions: string[],
		readonly low: number,
		readonly high: number,
		readonly mid: number = ((low + high) / 2) | 0
	) { }
}

class ExtensionBisectService implements IExtensionBisectService {

	declare readonly _serviceBrand: undefined;

	private static readonly _storageKey = 'extensionBisectState';

	private readonly _state: BisectState | undefined;
	private readonly _disabled = new Map<string, boolean>();

	constructor(
		@ILogService logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkbenchEnvironmentService private readonly _envService: IWorkbenchEnvironmentService
	) {
		const raw = _storageService.get(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
		this._state = BisectState.fromJSON(raw);

		if (this._state) {
			const { mid, high } = this._state;
			for (let i = 0; i < this._state.extensions.length; i++) {
				const isDisabled = i >= mid && i < high;
				this._disabled.set(this._state.extensions[i], isDisabled);
			}
			logService.warn('extension BISECT active', [...this._disabled]);
		}
	}

	get isActive() {
		return !!this._state;
	}

	get disabledCount() {
		return this._state ? this._state.high - this._state.mid : -1;
	}

	isDisabledByBisect(extension: IExtension): boolean {
		if (!this._state) {
			// bisect isn't active
			return false;
		}
		if (isResolverExtension(extension.manifest, this._envService.remoteAuthority)) {
			// the current remote resolver extension cannot be disabled
			return false;
		}
		if (this._isEnabledInEnv(extension)) {
			// Extension enabled in env cannot be disabled
			return false;
		}
		const disabled = this._disabled.get(extension.identifier.id);
		return disabled ?? false;
	}

	private _isEnabledInEnv(extension: IExtension): boolean {
		return Array.isArray(this._envService.enableExtensions) && this._envService.enableExtensions.some(id => areSameExtensions({ id }, extension.identifier));
	}

	async start(extensions: ILocalExtension[]): Promise<void> {
		if (this._state) {
			throw new Error('invalid state');
		}
		const extensionIds = extensions.map(ext => ext.identifier.id);
		const newState = new BisectState(extensionIds, 0, extensionIds.length, 0);
		this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(newState), StorageScope.APPLICATION, StorageTarget.MACHINE);
		await this._storageService.flush();
	}

	async next(seeingBad: boolean): Promise<{ id: string; bad: boolean } | undefined> {
		if (!this._state) {
			throw new Error('invalid state');
		}
		// check if bad when all extensions are disabled
		if (seeingBad && this._state.mid === 0 && this._state.high === this._state.extensions.length) {
			return { bad: true, id: '' };
		}
		// check if there is only one left
		if (this._state.low === this._state.high - 1) {
			await this.reset();
			return { id: this._state.extensions[this._state.low], bad: seeingBad };
		}
		// the second half is disabled so if there is still bad it must be
		// in the first half
		const nextState = new BisectState(
			this._state.extensions,
			seeingBad ? this._state.low : this._state.mid,
			seeingBad ? this._state.mid : this._state.high,
		);
		this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(nextState), StorageScope.APPLICATION, StorageTarget.MACHINE);
		await this._storageService.flush();
		return undefined;
	}

	async reset(): Promise<void> {
		this._storageService.remove(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
		await this._storageService.flush();
	}
}

registerSingleton(IExtensionBisectService, ExtensionBisectService, InstantiationType.Delayed);

// --- bisect UI

class ExtensionBisectUi {

	static ctxIsBisectActive = new RawContextKey<boolean>('isExtensionBisectActive', false);

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionBisectService private readonly _extensionBisectService: IExtensionBisectService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		if (_extensionBisectService.isActive) {
			ExtensionBisectUi.ctxIsBisectActive.bindTo(contextKeyService).set(true);
			this._showBisectPrompt();
		}
	}

	private _showBisectPrompt(): void {

		const goodPrompt: IPromptChoice = {
			label: localize('I cannot reproduce', "I can't reproduce"),
			run: () => this._commandService.executeCommand('extension.bisect.next', false)
		};
		const badPrompt: IPromptChoice = {
			label: localize('This is Bad', "I can reproduce"),
			run: () => this._commandService.executeCommand('extension.bisect.next', true)
		};
		const stop: IPromptChoice = {
			label: 'Stop Bisect',
			run: () => this._commandService.executeCommand('extension.bisect.stop')
		};

		const message = this._extensionBisectService.disabledCount === 1
			? localize('bisect.singular', "Extension Bisect is active and has disabled 1 extension. Check if you can still reproduce the problem and proceed by selecting from these options.")
			: localize('bisect.plural', "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", this._extensionBisectService.disabledCount);

		this._notificationService.prompt(
			Severity.Info,
			message,
			[goodPrompt, badPrompt, stop],
			{ sticky: true, priority: NotificationPriority.URGENT }
		);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ExtensionBisectUi,
	LifecyclePhase.Restored
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'extension.bisect.start',
			title: { value: localize('title.start', "Start Extension Bisect"), original: 'Start Extension Bisect' },
			category: Categories.Help,
			f1: true,
			precondition: ExtensionBisectUi.ctxIsBisectActive.negate(),
			menu: {
				id: MenuId.ViewContainerTitle,
				when: ContextKeyExpr.equals('viewContainer', 'workbench.view.extensions'),
				group: '2_enablement',
				order: 4
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const hostService = accessor.get(IHostService);
		const extensionManagement = accessor.get(IExtensionManagementService);
		const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
		const extensionsBisect = accessor.get(IExtensionBisectService);

		const extensions = (await extensionManagement.getInstalled(ExtensionType.User)).filter(ext => extensionEnablementService.isEnabled(ext));

		const res = await dialogService.confirm({
			message: localize('msg.start', "Extension Bisect"),
			detail: localize('detail.start', "Extension Bisect will use binary search to find an extension that causes a problem. During the process the window reloads repeatedly (~{0} times). Each time you must confirm if you are still seeing problems.", 2 + Math.log2(extensions.length) | 0),
			primaryButton: localize({ key: 'msg2', comment: ['&& denotes a mnemonic'] }, "&&Start Extension Bisect")
		});

		if (res.confirmed) {
			await extensionsBisect.start(extensions);
			hostService.reload();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'extension.bisect.next',
			title: { value: localize('title.isBad', "Continue Extension Bisect"), original: 'Continue Extension Bisect' },
			category: Categories.Help,
			f1: true,
			precondition: ExtensionBisectUi.ctxIsBisectActive
		});
	}

	async run(accessor: ServicesAccessor, seeingBad: boolean | undefined): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const hostService = accessor.get(IHostService);
		const bisectService = accessor.get(IExtensionBisectService);
		const productService = accessor.get(IProductService);
		const extensionEnablementService = accessor.get(IGlobalExtensionEnablementService);
		const issueService = accessor.get(IWorkbenchIssueService);

		if (!bisectService.isActive) {
			return;
		}
		if (seeingBad === undefined) {
			const goodBadStopCancel = await this._checkForBad(dialogService, bisectService);
			if (goodBadStopCancel === null) {
				return;
			}
			seeingBad = goodBadStopCancel;
		}
		if (seeingBad === undefined) {
			await bisectService.reset();
			hostService.reload();
			return;
		}
		const done = await bisectService.next(seeingBad);
		if (!done) {
			hostService.reload();
			return;
		}

		if (done.bad) {
			// DONE but nothing found
			await dialogService.info(
				localize('done.msg', "Extension Bisect"),
				localize('done.detail2', "Extension Bisect is done but no extension has been identified. This might be a problem with {0}.", productService.nameShort)
			);

		} else {
			// DONE and identified extension
			const res = await dialogService.confirm({
				type: Severity.Info,
				message: localize('done.msg', "Extension Bisect"),
				primaryButton: localize({ key: 'report', comment: ['&& denotes a mnemonic'] }, "&&Report Issue & Continue"),
				cancelButton: localize('continue', "Continue"),
				detail: localize('done.detail', "Extension Bisect is done and has identified {0} as the extension causing the problem.", done.id),
				checkbox: { label: localize('done.disbale', "Keep this extension disabled"), checked: true }
			});
			if (res.checkboxChecked) {
				await extensionEnablementService.disableExtension({ id: done.id }, undefined);
			}
			if (res.confirmed) {
				await issueService.openReporter({ extensionId: done.id });
			}
		}
		await bisectService.reset();
		hostService.reload();
	}

	private async _checkForBad(dialogService: IDialogService, bisectService: IExtensionBisectService): Promise<boolean | undefined | null> {
		const { result } = await dialogService.prompt<boolean | undefined | null>({
			type: Severity.Info,
			message: localize('msg.next', "Extension Bisect"),
			detail: localize('bisect', "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", bisectService.disabledCount),
			buttons: [
				{
					label: localize({ key: 'next.good', comment: ['&& denotes a mnemonic'] }, "I ca&&n't reproduce"),
					run: () => false // good now
				},
				{
					label: localize({ key: 'next.bad', comment: ['&& denotes a mnemonic'] }, "I can &&reproduce"),
					run: () => true // bad
				},
				{
					label: localize({ key: 'next.stop', comment: ['&& denotes a mnemonic'] }, "&&Stop Bisect"),
					run: () => undefined // stop
				}
			],
			cancelButton: {
				label: localize({ key: 'next.cancel', comment: ['&& denotes a mnemonic'] }, "&&Cancel Bisect"),
				run: () => null // cancel
			}
		});
		return result;
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'extension.bisect.stop',
			title: { value: localize('title.stop', "Stop Extension Bisect"), original: 'Stop Extension Bisect' },
			category: Categories.Help,
			f1: true,
			precondition: ExtensionBisectUi.ctxIsBisectActive
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionsBisect = accessor.get(IExtensionBisectService);
		const hostService = accessor.get(IHostService);
		await extensionsBisect.reset();
		hostService.reload();
	}
});
