/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchIssueService } from '../common/issue.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IExtensionBisectService } from '../../../services/extensionManagement/browser/extensionBisect.js';
import { INotificationHandle, INotificationService, IPromptChoice, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ServicesAccessor, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';

const ITroubleshootIssueService = createDecorator<ITroubleshootIssueService>('ITroubleshootIssueService');

interface ITroubleshootIssueService {
	_serviceBrand: undefined;
	isActive(): boolean;
	start(): Promise<void>;
	resume(): Promise<void>;
	stop(): Promise<void>;
}

enum TroubleshootStage {
	EXTENSIONS = 1,
	WORKBENCH,
}

type TroubleShootResult = 'good' | 'bad' | 'stop';

class TroubleShootState {

	static fromJSON(raw: string | undefined): TroubleShootState | undefined {
		if (!raw) {
			return undefined;
		}
		try {
			interface Raw extends TroubleShootState { }
			const data: Raw = JSON.parse(raw);
			if (
				(data.stage === TroubleshootStage.EXTENSIONS || data.stage === TroubleshootStage.WORKBENCH)
				&& typeof data.profile === 'string'
			) {
				return new TroubleShootState(data.stage, data.profile);
			}
		} catch { /* ignore */ }
		return undefined;
	}

	constructor(
		readonly stage: TroubleshootStage,
		readonly profile: string,
	) { }
}

class TroubleshootIssueService extends Disposable implements ITroubleshootIssueService {

	readonly _serviceBrand: undefined;

	static readonly storageKey = 'issueTroubleshootState';

	private notificationHandle: INotificationHandle | undefined;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IDialogService private readonly dialogService: IDialogService,
		@IExtensionBisectService private readonly extensionBisectService: IExtensionBisectService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService,
		@IProductService private readonly productService: IProductService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
	}

	isActive(): boolean {
		return this.state !== undefined;
	}

	async start(): Promise<void> {
		if (this.isActive()) {
			throw new Error('invalid state');
		}

		const res = await this.dialogService.confirm({
			message: localize('troubleshoot issue', "Troubleshoot Issue"),
			detail: localize('detail.start', "Issue troubleshooting is a process to help you identify the cause for an issue. The cause for an issue can be a misconfiguration, due to an extension, or be {0} itself.\n\nDuring the process the window reloads repeatedly. Each time you must confirm if you are still seeing the issue.", this.productService.nameLong),
			primaryButton: localize({ key: 'msg', comment: ['&& denotes a mnemonic'] }, "&&Troubleshoot Issue"),
			custom: true
		});

		if (!res.confirmed) {
			return;
		}

		const originalProfile = this.userDataProfileService.currentProfile;
		await this.userDataProfileImportExportService.createTroubleshootProfile();
		this.state = new TroubleShootState(TroubleshootStage.EXTENSIONS, originalProfile.id);
		await this.resume();
	}

	async resume(): Promise<void> {
		if (!this.isActive()) {
			return;
		}

		if (this.state?.stage === TroubleshootStage.EXTENSIONS && !this.extensionBisectService.isActive) {
			await this.reproduceIssueWithExtensionsDisabled();
		}

		if (this.state?.stage === TroubleshootStage.WORKBENCH) {
			await this.reproduceIssueWithEmptyProfile();
		}

		await this.stop();
	}

	async stop(): Promise<void> {
		if (!this.isActive()) {
			return;
		}

		if (this.notificationHandle) {
			this.notificationHandle.close();
			this.notificationHandle = undefined;
		}

		if (this.extensionBisectService.isActive) {
			await this.extensionBisectService.reset();
		}

		const profile = this.userDataProfilesService.profiles.find(p => p.id === this.state?.profile) ?? this.userDataProfilesService.defaultProfile;
		this.state = undefined;
		await this.userDataProfileManagementService.switchProfile(profile);
	}

	private async reproduceIssueWithExtensionsDisabled(): Promise<void> {
		if (!(await this.extensionManagementService.getInstalled(ExtensionType.User)).length) {
			this.state = new TroubleShootState(TroubleshootStage.WORKBENCH, this.state!.profile);
			return;
		}

		const result = await this.askToReproduceIssue(localize('profile.extensions.disabled', "Issue troubleshooting is active and has temporarily disabled all installed extensions. Check if you can still reproduce the problem and proceed by selecting from these options."));
		if (result === 'good') {
			const profile = this.userDataProfilesService.profiles.find(p => p.id === this.state!.profile) ?? this.userDataProfilesService.defaultProfile;
			await this.reproduceIssueWithExtensionsBisect(profile);
		}
		if (result === 'bad') {
			this.state = new TroubleShootState(TroubleshootStage.WORKBENCH, this.state!.profile);
		}
		if (result === 'stop') {
			await this.stop();
		}
	}

	private async reproduceIssueWithEmptyProfile(): Promise<void> {
		await this.userDataProfileManagementService.createAndEnterTransientProfile();
		this.updateState(this.state);
		const result = await this.askToReproduceIssue(localize('empty.profile', "Issue troubleshooting is active and has temporarily reset your configurations to defaults. Check if you can still reproduce the problem and proceed by selecting from these options."));
		if (result === 'stop') {
			await this.stop();
		}
		if (result === 'good') {
			await this.askToReportIssue(localize('issue is with configuration', "Issue troubleshooting has identified that the issue is caused by your configurations. Please report the issue by exporting your configurations using \"Export Profile\" command and share the file in the issue report."));
		}
		if (result === 'bad') {
			await this.askToReportIssue(localize('issue is in core', "Issue troubleshooting has identified that the issue is with {0}.", this.productService.nameLong));
		}
	}

	private async reproduceIssueWithExtensionsBisect(profile: IUserDataProfile): Promise<void> {
		await this.userDataProfileManagementService.switchProfile(profile);
		const extensions = (await this.extensionManagementService.getInstalled(ExtensionType.User)).filter(ext => this.extensionEnablementService.isEnabled(ext));
		await this.extensionBisectService.start(extensions);
		await this.hostService.reload();
	}

	private askToReproduceIssue(message: string): Promise<TroubleShootResult> {
		return new Promise((c, e) => {
			const goodPrompt: IPromptChoice = {
				label: localize('I cannot reproduce', "I Can't Reproduce"),
				run: () => c('good')
			};
			const badPrompt: IPromptChoice = {
				label: localize('This is Bad', "I Can Reproduce"),
				run: () => c('bad')
			};
			const stop: IPromptChoice = {
				label: localize('Stop', "Stop"),
				run: () => c('stop')
			};
			this.notificationHandle = this.notificationService.prompt(
				Severity.Info,
				message,
				[goodPrompt, badPrompt, stop],
				{ sticky: true, priority: NotificationPriority.URGENT }
			);
		});
	}

	private async askToReportIssue(message: string): Promise<void> {
		let isCheckedInInsiders = false;
		if (this.productService.quality === 'stable') {
			const res = await this.askToReproduceIssueWithInsiders();
			if (res === 'good') {
				await this.dialogService.prompt({
					type: Severity.Info,
					message: localize('troubleshoot issue', "Troubleshoot Issue"),
					detail: localize('use insiders', "This likely means that the issue has been addressed already and will be available in an upcoming release. You can safely use {0} insiders until the new stable version is available.", this.productService.nameLong),
					custom: true
				});
				return;
			}
			if (res === 'stop') {
				await this.stop();
				return;
			}
			if (res === 'bad') {
				isCheckedInInsiders = true;
			}
		}

		await this.issueService.openReporter({
			issueBody: `> ${message} ${isCheckedInInsiders ? `It is confirmed that the issue exists in ${this.productService.nameLong} Insiders` : ''}`,
		});
	}

	private async askToReproduceIssueWithInsiders(): Promise<TroubleShootResult | undefined> {
		const confirmRes = await this.dialogService.confirm({
			type: 'info',
			message: localize('troubleshoot issue', "Troubleshoot Issue"),
			primaryButton: localize('download insiders', "Download {0} Insiders", this.productService.nameLong),
			cancelButton: localize('report anyway', "Report Issue Anyway"),
			detail: localize('ask to download insiders', "Please try to download and reproduce the issue in {0} insiders.", this.productService.nameLong),
			custom: {
				disableCloseAction: true,
			}
		});

		if (!confirmRes.confirmed) {
			return undefined;
		}

		const opened = await this.openerService.open(URI.parse('https://aka.ms/vscode-insiders'));
		if (!opened) {
			return undefined;
		}

		const res = await this.dialogService.prompt<TroubleShootResult>({
			type: 'info',
			message: localize('troubleshoot issue', "Troubleshoot Issue"),
			buttons: [{
				label: localize('good', "I can't reproduce"),
				run: () => 'good'
			}, {
				label: localize('bad', "I can reproduce"),
				run: () => 'bad'
			}],
			cancelButton: {
				label: localize('stop', "Stop"),
				run: () => 'stop'
			},
			detail: localize('ask to reproduce issue', "Please try to reproduce the issue in {0} insiders and confirm if the issue exists there.", this.productService.nameLong),
			custom: {
				disableCloseAction: true,
			}
		});

		return res.result;
	}

	private _state: TroubleShootState | undefined | null;
	get state(): TroubleShootState | undefined {
		if (this._state === undefined) {
			const raw = this.storageService.get(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
			this._state = TroubleShootState.fromJSON(raw);
		}
		return this._state || undefined;
	}

	set state(state: TroubleShootState | undefined) {
		this._state = state ?? null;
		this.updateState(state);
	}

	private updateState(state: TroubleShootState | undefined) {
		if (state) {
			this.storageService.store(TroubleshootIssueService.storageKey, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
		}
	}
}

class IssueTroubleshootUi extends Disposable {

	static ctxIsTroubleshootActive = new RawContextKey<boolean>('isIssueTroubleshootActive', false);

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITroubleshootIssueService private readonly troubleshootIssueService: ITroubleshootIssueService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		this.updateContext();
		if (troubleshootIssueService.isActive()) {
			troubleshootIssueService.resume();
		}
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, TroubleshootIssueService.storageKey, this._register(new DisposableStore()))(() => {
			this.updateContext();
		}));
	}

	private updateContext(): void {
		IssueTroubleshootUi.ctxIsTroubleshootActive.bindTo(this.contextKeyService).set(this.troubleshootIssueService.isActive());
	}

}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(IssueTroubleshootUi, LifecyclePhase.Restored);

registerAction2(class TroubleshootIssueAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.troubleshootIssue.start',
			title: localize2('troubleshootIssue', 'Troubleshoot Issue...'),
			category: Categories.Help,
			f1: true,
			precondition: ContextKeyExpr.and(IssueTroubleshootUi.ctxIsTroubleshootActive.negate(), RemoteNameContext.isEqualTo(''), IsWebContext.negate()),
		});
	}
	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ITroubleshootIssueService).start();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.troubleshootIssue.stop',
			title: localize2('title.stop', 'Stop Troubleshoot Issue'),
			category: Categories.Help,
			f1: true,
			precondition: IssueTroubleshootUi.ctxIsTroubleshootActive
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ITroubleshootIssueService).stop();
	}
});


registerSingleton(ITroubleshootIssueService, TroubleshootIssueService, InstantiationType.Delayed);
