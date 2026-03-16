/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { Command } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Downloading, IUpdateService, StateType, State as UpdateState, Updating } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { computeProgressPercent, formatBytes } from '../common/updateUtils.js';
import './media/updateStatusBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';

/**
 * Displays update status and actions in the status bar.
 */
export class UpdateStatusBarContribution extends Disposable implements IWorkbenchContribution {
	private static readonly actionableStates = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
	private readonly accessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly tooltip!: UpdateTooltip;
	private lastStateType: StateType | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip, false));

		this._register(updateService.onStateChange(this.onStateChange.bind(this)));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('update.statusBar') || e.affectsConfiguration('update.titleBar')) {
				this.onStateChange(updateService.state);
			}
		}));

		this.onStateChange(updateService.state);
	}

	private onStateChange(state: UpdateState) {
		const titleBarMode = this.configurationService.getValue<string>('update.titleBar');
		if (titleBarMode !== 'none') {
			this.accessor.clear();
			return;
		}

		const mode = this.configurationService.getValue<string>('update.statusBar');
		if (mode === 'hidden' || mode === 'actionable' && !UpdateStatusBarContribution.actionableStates.includes(state.type)) {
			this.accessor.clear();
			return;
		}

		if (this.lastStateType !== state.type) {
			this.accessor.clear();
			this.lastStateType = state.type;
		}

		this.tooltip.renderState(state);
		switch (state.type) {
			case StateType.CheckingForUpdates:
				this.updateEntry(
					localize('updateStatus.checkingForUpdates', "$(loading~spin) Checking for updates..."),
					localize('updateStatus.checkingForUpdatesAria', "Checking for updates"),
					ShowTooltipCommand,
				);
				break;

			case StateType.AvailableForDownload:
				this.updateEntry(
					localize('updateStatus.updateAvailableStatus', "$(circle-filled) Update available, click to download."),
					localize('updateStatus.updateAvailableAria', "Update available, click to download."),
					'update.downloadNow'
				);
				break;

			case StateType.Downloading:
				this.updateEntry(
					this.getDownloadingText(state),
					localize('updateStatus.downloadingUpdateAria', "Downloading update"),
					ShowTooltipCommand
				);
				break;

			case StateType.Downloaded:
				this.updateEntry(
					localize('updateStatus.updateReadyStatus', "$(circle-filled) Update downloaded, click to install."),
					localize('updateStatus.updateReadyAria', "Update downloaded, click to install."),
					'update.install'
				);
				break;

			case StateType.Updating:
				this.updateEntry(
					this.getUpdatingText(state),
					undefined,
					ShowTooltipCommand
				);
				break;

			case StateType.Ready:
				this.updateEntry(
					localize('updateStatus.restartToUpdateStatus', "$(circle-filled) Update is ready, click to restart."),
					localize('updateStatus.restartToUpdateAria', "Update is ready, click to restart."),
					'update.restart'
				);
				break;

			case StateType.Overwriting:
				this.updateEntry(
					localize('updateStatus.downloadingNewerUpdateStatus', "$(loading~spin) Downloading update..."),
					localize('updateStatus.downloadingNewerUpdateAria', "Downloading a newer update"),
					ShowTooltipCommand
				);
				break;

			default:
				this.accessor.clear();
				break;
		}
	}

	private updateEntry(text: string, ariaLabel: string | undefined, command: string | Command) {
		const entry: IStatusbarEntry = {
			text,
			ariaLabel: ariaLabel ?? text,
			name: localize('updateStatus', "Update Status"),
			tooltip: this.tooltip?.domNode,
			command
		};

		if (this.accessor.value) {
			this.accessor.value.update(entry);
		} else {
			this.accessor.value = this.statusbarService.addEntry(
				entry,
				'status.update',
				StatusbarAlignment.LEFT,
				-Number.MAX_VALUE
			);
		}
	}

	private getDownloadingText({ downloadedBytes, totalBytes }: Downloading): string {
		if (downloadedBytes !== undefined && totalBytes !== undefined && totalBytes > 0) {
			const percent = computeProgressPercent(downloadedBytes, totalBytes) ?? 0;
			return localize('updateStatus.downloadUpdateProgressStatus', "$(loading~spin) Downloading update: {0} / {1} • {2}%",
				formatBytes(downloadedBytes),
				formatBytes(totalBytes),
				percent);
		} else {
			return localize('updateStatus.downloadUpdateStatus', "$(loading~spin) Downloading update...");
		}
	}

	private getUpdatingText({ currentProgress, maxProgress }: Updating): string {
		const percentage = computeProgressPercent(currentProgress, maxProgress);
		if (percentage !== undefined) {
			return localize('updateStatus.installingUpdateProgressStatus', "$(loading~spin) Installing update: {0}%", percentage);
		} else {
			return localize('updateStatus.installingUpdateStatus', "$(loading~spin) Installing update...");
		}
	}
}
