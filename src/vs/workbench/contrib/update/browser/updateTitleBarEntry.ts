/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHoverContent, IManagedHoverOptions, IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';
import { IAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { AnchorAlignment } from '../../../../base/common/layout.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, IMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DisablementReason, IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { UpdateTitleBarChatInProgressContext, UpdateTitleBarContext, UpdateTitleBarEditorVisibleContext } from '../common/update.js';
import { computeProgressPercent } from '../common/updateUtils.js';
import './media/updateTitleBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';

const UPDATE_TITLE_BAR_ACTION_ID = 'workbench.actions.updateIndicator';

const DISABLED_REMINDER_LAST_SHOWN_KEY = 'update/disabledReminderLastShown';
const DISABLED_REMINDER_PERIOD = 30 * 24 * 60 * 60 * 1000; // 30 days

const UPDATE_TITLE_BAR_SETTING = 'update.titleBar';

const ACTIONABLE_STATES: readonly StateType[] = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
const DETAILED_STATES: readonly StateType[] = [...ACTIONABLE_STATES, StateType.CheckingForUpdates, StateType.Downloading, StateType.Updating, StateType.Overwriting, StateType.Cancelling];

/**
 * Optional secondary placement for the update indicator (e.g. used by the Agents
 * app). Limited to one because the contribution tracks a single rendered entry.
 */
let additionalMenuPlacement: { readonly menuId: MenuId; readonly item: Omit<IMenuItem, 'command'> } | undefined;

export function registerUpdateTitleBarMenuPlacement(menuId: MenuId, item: Omit<IMenuItem, 'command'> = {}): void {
	if (additionalMenuPlacement) {
		throw new Error('An additional update title bar menu placement is already registered');
	}
	additionalMenuPlacement = { menuId, item };
}

registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
	constructor() {
		super({
			id: UPDATE_TITLE_BAR_ACTION_ID,
			title: localize('updateIndicatorTitleBarAction', 'Update'),
			f1: false,
			menu: [{
				id: MenuId.TitleBarUpdate,
				order: 0,
				when: UpdateTitleBarEditorVisibleContext,
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
	private tooltipFocused = false;

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatService chatService: IChatService,
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

		this.context = UpdateTitleBarContext.bindTo(contextKeyService);
		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));

		const chatInProgressContext = UpdateTitleBarChatInProgressContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			chatInProgressContext.set(chatService.requestInProgressObs.read(reader));
		}));

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
			MenuId.TitleBarUpdate,
			UPDATE_TITLE_BAR_ACTION_ID,
			(action, options) => this.createEntry(instantiationService, action, options)
		));

		if (additionalMenuPlacement) {
			const { menuId, item } = additionalMenuPlacement;
			MenuRegistry.appendMenuItem(menuId, {
				...item,
				command: {
					id: UPDATE_TITLE_BAR_ACTION_ID,
					title: localize('updateIndicatorTitleBarAction', 'Update'),
				},
				when: ContextKeyExpr.and(UpdateTitleBarContext, UpdateTitleBarChatInProgressContext.negate(), item.when),
			});
			this._register(actionViewItemService.register(
				menuId,
				UPDATE_TITLE_BAR_ACTION_ID,
				(action, options) => this.createEntry(instantiationService, action, options)
			));
		}

		void this.onStateChange(true);
	}

	private createEntry(instantiationService: IInstantiationService, action: IAction, options: IBaseActionViewItemOptions): UpdateTitleBarEntry {
		this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, focus => {
			this.tooltipVisible = true;
			this.tooltipFocused = focus;
		}, () => {
			this.tooltipVisible = false;
			this.tooltipFocused = false;
			if (!ACTIONABLE_STATES.includes(this.state.type) && !DETAILED_STATES.includes(this.state.type)) {
				this.context.set(false);
			}
		});
		if (this.tooltipVisible) {
			this.entry.showTooltip(this.tooltipFocused);
		}
		return this.entry;
	}

	private async onStateChange(startup = false) {
		if (this.configurationService.getValue<boolean>(UPDATE_TITLE_BAR_SETTING) === false) {
			this.tooltipVisible = false;
			this.tooltipFocused = false;
			this.context.set(false);
			return;
		}

		// Tooltip already shown or window not last focused: only sync content and indicator visibility.
		if (this.tooltipVisible || !await this.hostService.hadLastFocus()) {
			this.context.set(this.tooltipVisible || ACTIONABLE_STATES.includes(this.state.type));
			this.tooltip.renderState(this.state);
			return;
		}

		this.tooltip.renderState(this.state);

		// Set the context key only once. Toggling it (e.g. off then on) recreates the entry on every
		// state update, which for frequent updates like download progress flashes the tooltip (#311938).
		let context = ACTIONABLE_STATES.includes(this.state.type);
		let showTooltip = false;
		switch (this.state.type) {
			case StateType.Disabled:
				if (startup) {
					const reason = this.state.reason;
					if (reason === DisablementReason.InvalidConfiguration || reason === DisablementReason.RunningAsAdmin || reason === DisablementReason.RunningX64OnArm64) {
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
				context = this.state.explicit;
				break;
			case StateType.Cancelling:
				context = true;
				break;
			case StateType.Restarting:
				context = true;
				break;
		}

		if (showTooltip) {
			this.tooltipVisible = true;
			context = true;
		}

		this.context.set(context);

		if (showTooltip) {
			this.entry?.showTooltip();
			if (this.state.type === StateType.Disabled) {
				this.storageService.store(DISABLED_REMINDER_LAST_SHOWN_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}
	}

}

/**
 * Custom action view item for the update indicator in the title bar.
 */
export class UpdateTitleBarEntry extends BaseActionViewItem {
	private content: HTMLElement | undefined;
	private tooltipFocusOnRender: boolean | undefined;
	private readonly visibleTooltip = this._register(new MutableDisposable<IHoverWidget>());

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly tooltip: UpdateTooltip,
		private readonly onDidShowTooltip: (focus: boolean) => void,
		private readonly onUserDismissedTooltip: () => void,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super(undefined, action, options);

		this.action.run = () => this.runAction();
		this._register(this.updateService.onStateChange(state => this.onStateChange(state)));
		this._register(this.commandService.onDidExecuteCommand(event => {
			if (event.commandId === 'workbench.action.showHover' && this.isFocused()) {
				this.focusTooltip();
			}
		}));
	}

	public override render(container: HTMLElement) {
		super.render(container);

		this.content = dom.append(container, dom.$('.update-indicator'));
		container.setAttribute('role', 'button');
		this.updateTooltip();
		this.onStateChange(this.updateService.state);

		if (this.tooltipFocusOnRender !== undefined) {
			const focus = this.tooltipFocusOnRender;
			this.tooltipFocusOnRender = undefined;
			dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip(focus));
		}
	}

	public showTooltip(focus = false) {
		if (!this.element?.isConnected) {
			this.tooltipFocusOnRender = focus;
			return;
		}

		const hover = this.hoverService.showInstantHover({
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
			position: { anchorAlignment: AnchorAlignment.RIGHT },
			trapFocus: focus,
		}, focus);

		if (hover) {
			this.visibleTooltip.value = hover;
			this.onDidShowTooltip(focus);
		}
	}

	private focusTooltip(): void {
		this.visibleTooltip.clear();
		this.showTooltip(true);
	}

	protected override getHoverContents(): IManagedHoverContent {
		return this.tooltip.domNode;
	}

	protected override getHoverOptions(): IManagedHoverOptions {
		return { position: { anchorAlignment: AnchorAlignment.RIGHT } };
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

			case StateType.Cancelling:
				label.textContent = localize('updateIndicator.cancelling', "Cancelling...");
				this.renderProgressState(this.content);
				break;

			default:
				label.textContent = localize('updateIndicator.update', "Update");
				break;
		}

		this.element?.setAttribute('aria-label', label.textContent);
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
