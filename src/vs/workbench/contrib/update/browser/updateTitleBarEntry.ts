/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { IAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DisablementReason, IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { computeProgressPercent, isMajorMinorVersionChange } from '../common/updateUtils.js';
import './media/updateTitleBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';

const UPDATE_TITLE_BAR_ACTION_ID = 'workbench.actions.updateIndicator';
const UPDATE_TITLE_BAR_CONTEXT = new RawContextKey<boolean>('updateTitleBar', false);

const ACTIONABLE_STATES: readonly StateType[] = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
const DETAILED_STATES: readonly StateType[] = [...ACTIONABLE_STATES, StateType.CheckingForUpdates, StateType.Downloading, StateType.Updating, StateType.Overwriting];

const LAST_KNOWN_VERSION_KEY = 'updateTitleBarEntry/lastKnownVersion';

interface ILastKnownVersion {
	readonly version: string;
	readonly commit: string | undefined;
	readonly timestamp: number;
}

registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
	constructor() {
		super({
			id: UPDATE_TITLE_BAR_ACTION_ID,
			title: localize('updateIndicatorTitleBarAction', 'Update'),
			f1: false,
			menu: [{
				id: MenuId.TitleBarAdjacentCenter,
				order: 0,
				when: UPDATE_TITLE_BAR_CONTEXT,
			}]
		});
	}

	override async run() { }
});

/**
 * Displays update status and actions in the title bar.
 */
export class UpdateTitleBarContribution extends Disposable implements IWorkbenchContribution {
	private readonly context!: IContextKey<boolean>;
	private readonly tooltip!: UpdateTooltip;
	private mode: 'always' | 'detailed' | 'actionable' | 'none' = 'none';
	private state!: State;
	private entry: UpdateTitleBarEntry | undefined;
	private tooltipVisible = false;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this.context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);
		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip, true));

		this.mode = configurationService.getValue<string>('update.titleBar') as typeof this.mode;
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('update.titleBar')) {
				this.mode = configurationService.getValue<string>('update.titleBar') as typeof this.mode;
				this.onStateChange();
			}
		}));

		this.state = updateService.state;
		this._register(updateService.onStateChange((state) => {
			this.state = state;
			this.onStateChange();
		}));

		this._register(actionViewItemService.register(
			MenuId.TitleBarAdjacentCenter,
			UPDATE_TITLE_BAR_ACTION_ID,
			(action, options) => {
				this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, () => {
					this.tooltipVisible = false;
					this.updateContext();
				});
				if (this.tooltipVisible) {
					this.entry.showTooltip();
				}
				return this.entry;
			}
		));

		void this.onStateChange(true);
	}

	private updateContext() {
		switch (this.mode) {
			case 'always':
				this.context.set(true);
				break;
			case 'detailed':
				this.context.set(DETAILED_STATES.includes(this.state.type));
				break;
			case 'actionable':
				this.context.set(ACTIONABLE_STATES.includes(this.state.type));
				break;
			default:
				this.context.set(false);
				break;
		}
	}

	private async onStateChange(startup = false) {
		this.updateContext();
		if (this.mode === 'none' || this.tooltipVisible || !await this.hostService.hadLastFocus()) {
			return;
		}

		let showTooltip = startup && this.detectVersionChange();
		if (showTooltip) {
			this.tooltip.renderPostInstall();
		} else {
			this.tooltip.renderState(this.state);
			switch (this.state.type) {
				case StateType.Disabled:
					if (startup) {
						const reason = this.state.reason;
						showTooltip = reason === DisablementReason.InvalidConfiguration || reason === DisablementReason.RunningAsAdmin;
					}
					break;
				case StateType.Idle:
					showTooltip = !!this.state.error || !!this.state.notAvailable;
					break;
			}
		}

		if (showTooltip) {
			this.tooltipVisible = true;
			this.context.set(true);
			this.entry?.showTooltip();
		}
	}

	private detectVersionChange() {
		let from: ILastKnownVersion | undefined;
		try {
			from = this.storageService.getObject(LAST_KNOWN_VERSION_KEY, StorageScope.APPLICATION);
		} catch { }

		const to: ILastKnownVersion = {
			version: this.productService.version,
			commit: this.productService.commit,
			timestamp: Date.now(),
		};

		if (from?.commit === to.commit) {
			return false;
		}

		this.storageService.store(LAST_KNOWN_VERSION_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);

		if (from) {
			this.trackVersionChange(from, to);
			return isMajorMinorVersionChange(from.version, to.version);
		}

		return false;
	}

	private trackVersionChange(from: ILastKnownVersion, to: ILastKnownVersion) {
		type VersionChangeEvent = {
			fromVersion: string | undefined;
			fromCommit: string | undefined;
			fromVersionTime: number | undefined;
			toVersion: string;
			toCommit: string | undefined;
			timeToUpdateMs: number | undefined;
			updateMode: string | undefined;
			titleBarMode: string | undefined;
		};

		type VersionChangeClassification = {
			owner: 'dmitriv';
			comment: 'Fired when VS Code detects a version change on startup.';
			fromVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous version of VS Code.' };
			fromCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The commit hash of the previous version.' };
			fromVersionTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Timestamp when the previous version was first detected.' };
			toVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current version of VS Code.' };
			toCommit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The commit hash of the current version.' };
			timeToUpdateMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds between the previous version install and this version install.' };
			updateMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The update mode configured by the user.' };
			titleBarMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The title bar update indicator mode configured by the user.' };
		};

		this.telemetryService.publicLog2<VersionChangeEvent, VersionChangeClassification>('update:versionChanged', {
			fromVersion: from.version,
			fromCommit: from.commit,
			fromVersionTime: from.timestamp,
			toVersion: to.version,
			toCommit: to.commit,
			timeToUpdateMs: from.timestamp !== undefined ? to.timestamp - from.timestamp : undefined,
			updateMode: this.configurationService.getValue<string>('update.mode'),
			titleBarMode: this.mode
		});
	}
}

/**
 * Custom action view item for the update indicator in the title bar.
 */
export class UpdateTitleBarEntry extends BaseActionViewItem {
	private content: HTMLElement | undefined;
	private showTooltipOnRender = false;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly tooltip: UpdateTooltip,
		private readonly onUserDismissedTooltip: () => void,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super(undefined, action, options);

		this.action.run = () => this.runAction();
		this._register(this.updateService.onStateChange(state => this.onStateChange(state)));
	}

	public override render(container: HTMLElement) {
		super.render(container);

		this.content = dom.append(container, dom.$('.update-indicator'));
		this.updateTooltip();
		this.onStateChange(this.updateService.state);

		if (this.showTooltipOnRender) {
			this.showTooltipOnRender = false;
			dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip());
		}
	}

	public showTooltip(focus = false) {
		if (!this.content?.isConnected) {
			this.showTooltipOnRender = true;
			return;
		}

		this.hoverService.showInstantHover({
			content: this.tooltip.domNode,
			target: {
				targetElements: [this.content],
				dispose: () => {
					if (!!this.content?.isConnected) {
						this.onUserDismissedTooltip();
					}
				}
			},
			persistence: { sticky: true },
			appearance: { showPointer: true, compact: true },
		}, focus);
	}

	protected override getHoverContents(): IManagedHoverContent {
		return this.tooltip.domNode;
	}

	private runAction() {
		switch (this.updateService.state.type) {
			case StateType.AvailableForDownload:
				this.commandService.executeCommand('update.downloadNow');
				break;
			case StateType.Downloaded:
				this.commandService.executeCommand('update.install');
				break;
			case StateType.Ready:
				this.commandService.executeCommand('update.restart');
				break;
			default:
				this.showTooltip(true);
				break;
		}
	}

	private onStateChange(state: State) {
		if (!this.content) {
			return;
		}

		dom.clearNode(this.content);
		this.content.classList.remove('prominent', 'progress-indefinite', 'progress-percent', 'update-disabled');
		this.content.style.removeProperty('--update-progress');

		const label = dom.append(this.content, dom.$('.indicator-label'));
		label.textContent = localize('updateIndicator.update', "Update");

		switch (state.type) {
			case StateType.Disabled:
				this.content.classList.add('update-disabled');
				break;

			case StateType.CheckingForUpdates:
			case StateType.Overwriting:
				this.renderProgressState(this.content);
				break;

			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Ready:
				this.content.classList.add('prominent');
				break;

			case StateType.Downloading:
				this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
				break;

			case StateType.Updating:
				this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
				break;
		}
	}

	private renderProgressState(content: HTMLElement, percentage?: number) {
		if (percentage !== undefined) {
			content.classList.add('progress-percent');
			content.style.setProperty('--update-progress', `${percentage}%`);
		} else {
			content.classList.add('progress-indefinite');
		}
	}
}
