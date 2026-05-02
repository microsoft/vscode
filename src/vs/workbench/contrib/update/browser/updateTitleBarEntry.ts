/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { IAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DisablementReason, IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { InEditorZenModeContext } from '../../../common/contextkeys.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { computeProgressPercent } from '../common/updateUtils.js';
import { waitForState } from '../../../../base/common/observable.js';
import './media/updateTitleBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';

const UPDATE_TITLE_BAR_ACTION_ID = 'workbench.actions.updateIndicator';
const UPDATE_TITLE_BAR_CONTEXT = new RawContextKey<boolean>('updateTitleBar', false);

const DISABLED_REMINDER_LAST_SHOWN_KEY = 'update/disabledReminderLastShown';
const DISABLED_REMINDER_PERIOD = 30 * 24 * 60 * 60 * 1000; // 30 days

const UPDATE_TITLE_BAR_SETTING = 'update.titleBar';

const ACTIONABLE_STATES: readonly StateType[] = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
const DETAILED_STATES: readonly StateType[] = [...ACTIONABLE_STATES, StateType.CheckingForUpdates, StateType.Downloading, StateType.Updating, StateType.Overwriting];

registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
	constructor() {
		super({
			id: UPDATE_TITLE_BAR_ACTION_ID,
			title: localize('updateIndicatorTitleBarAction', 'Update'),
			f1: false,
			menu: [{
				id: MenuId.TitleBarAdjacentCenter,
				order: 0,
				when: ContextKeyExpr.and(UPDATE_TITLE_BAR_CONTEXT, InEditorZenModeContext.negate(), ContextKeyExpr.not('inDebugMode')),
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
	private state!: State;
	private entry: UpdateTitleBarEntry | undefined;
	private tooltipVisible = false;
	private readonly pendingShow = this._register(new MutableDisposable());

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatService private readonly chatService: IChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this.context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);
		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));

		this.state = updateService.state;
		this._register(updateService.onStateChange((state) => {
			this.state = state;
			this.onStateChange();
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(UPDATE_TITLE_BAR_SETTING)) {
				this.onStateChange();
			}
		}));

		this._register(actionViewItemService.register(
			MenuId.TitleBarAdjacentCenter,
			UPDATE_TITLE_BAR_ACTION_ID,
			(action, options) => {
				this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, () => {
					this.tooltipVisible = false;
					if (!ACTIONABLE_STATES.includes(this.state.type) && !DETAILED_STATES.includes(this.state.type)) {
						this.context.set(false);
					}
				});
				if (this.tooltipVisible) {
					this.entry.showTooltip();
				}
				return this.entry;
			}
		));

		void this.onStateChange(true);
	}

	private async onStateChange(startup = false) {
		this.pendingShow.clear();

		if (this.configurationService.getValue<boolean>(UPDATE_TITLE_BAR_SETTING) === false) {
			this.context.set(false);
			return;
		}

		if (ACTIONABLE_STATES.includes(this.state.type)) {
			await this.setContextWhenChatIdle(true);
		} else {
			this.context.set(false);
		}

		if (this.tooltipVisible || !await this.hostService.hadLastFocus()) {
			this.tooltip.renderState(this.state);
			return;
		}

		this.tooltip.renderState(this.state);
		let showTooltip = false;
		switch (this.state.type) {
			case StateType.Disabled:
				if (startup) {
					const reason = this.state.reason;
					if (reason === DisablementReason.InvalidConfiguration || reason === DisablementReason.RunningAsAdmin) {
						const lastShown = this.storageService.getNumber(DISABLED_REMINDER_LAST_SHOWN_KEY, StorageScope.APPLICATION);
						showTooltip = lastShown === undefined || (Date.now() - lastShown) >= DISABLED_REMINDER_PERIOD;
					}
				}
				break;
			case StateType.Idle:
				showTooltip = !!this.state.error;
				break;
			case StateType.Downloading:
			case StateType.Updating:
			case StateType.Overwriting:
				this.context.set(this.state.explicit);
				break;
			case StateType.Restarting:
				this.context.set(true);
				break;
		}

		if (showTooltip) {
			this.tooltipVisible = true;
			this.context.set(true);
			this.entry?.showTooltip();
			if (this.state.type === StateType.Disabled) {
				this.storageService.store(DISABLED_REMINDER_LAST_SHOWN_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}
	}

	private async setContextWhenChatIdle(value: boolean) {
		if (!this.chatService.requestInProgressObs.get()) {
			this.context.set(value);
			return;
		}

		const cts = new CancellationTokenSource();
		this.pendingShow.value = toDisposable(() => cts.dispose(true));
		try {
			await waitForState(this.chatService.requestInProgressObs, inProgress => !inProgress, undefined, cts.token);
			this.context.set(value);
		} catch {
			// cancelled — a newer state change superseded this one
		}
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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
		if (!this.element?.isConnected) {
			this.showTooltipOnRender = true;
			return;
		}

		this.hoverService.showInstantHover({
			content: this.tooltip.domNode,
			target: {
				targetElements: [this.element],
				dispose: () => {
					if (!!this.element?.isConnected) {
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

	private async runAction() {
		let commandId: string | undefined;
		switch (this.updateService.state.type) {
			case StateType.AvailableForDownload:
				commandId = 'update.downloadNow';
				break;
			case StateType.Downloaded:
				commandId = 'update.install';
				break;
			case StateType.Ready:
				commandId = 'update.restart';
				break;
			default:
				this.showTooltip(true);
				return;
		}

		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'titlebar' });
		await this.commandService.executeCommand(commandId);
	}

	private onStateChange(state: State) {
		if (!this.content) {
			return;
		}

		dom.clearNode(this.content);
		this.content.classList.remove('prominent', 'progress-indefinite', 'progress-percent', 'update-disabled');
		this.content.style.removeProperty('--update-progress');

		const label = dom.append(this.content, dom.$('.indicator-label'));
		switch (state.type) {
			case StateType.Disabled:
				label.textContent = localize('updateIndicator.update', "Update");
				this.content.classList.add('update-disabled');
				break;

			case StateType.CheckingForUpdates:
				label.textContent = localize('updateIndicator.checking', "Checking...");
				this.renderProgressState(this.content);
				break;

			case StateType.Overwriting:
				label.textContent = localize('updateIndicator.overwriting', "Updating...");
				this.renderProgressState(this.content);
				break;

			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Ready:
				label.textContent = localize('updateIndicator.update', "Update");
				this.content.classList.add('prominent');
				break;

			case StateType.Downloading:
				label.textContent = localize('updateIndicator.downloading', "Downloading...");
				this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
				break;

			case StateType.Updating:
				label.textContent = localize('updateIndicator.installing', "Installing...");
				this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
				break;

			case StateType.Restarting:
				label.textContent = localize('updateIndicator.restarting', "Restarting...");
				this.renderProgressState(this.content);
				break;

			default:
				label.textContent = localize('updateIndicator.update', "Update");
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
