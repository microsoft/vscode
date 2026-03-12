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
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DisablementReason, IUpdateService, State, StateType } from '../../../../platform/update/common/update.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { computeProgressPercent, tryParseVersion } from '../common/updateUtils.js';
import './media/updateTitleBarEntry.css';
import { UpdateTooltip } from './updateTooltip.js';

const UPDATE_TITLE_BAR_ACTION_ID = 'workbench.actions.updateIndicator';
const UPDATE_TITLE_BAR_CONTEXT = new RawContextKey<boolean>('updateTitleBar', false);
const LAST_KNOWN_VERSION_KEY = 'updateTitleBar/lastKnownVersion';
const ACTIONABLE_STATES: readonly StateType[] = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];

registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
	constructor() {
		super({
			id: UPDATE_TITLE_BAR_ACTION_ID,
			title: localize('updateIndicatorTitleBarAction', 'Update'),
			f1: false,
			menu: [{
				id: MenuId.CommandCenter,
				order: 10003,
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
	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		const context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);

		const updateContext = () => {
			const mode = configurationService.getValue<string>('update.titleBar');
			const state = updateService.state.type;
			context.set(mode === 'detailed' || mode === 'actionable' && ACTIONABLE_STATES.includes(state));
		};

		let entry: UpdateTitleBarEntry | undefined;
		let showTooltipOnRender = false;

		this._register(actionViewItemService.register(
			MenuId.CommandCenter,
			UPDATE_TITLE_BAR_ACTION_ID,
			(action, options) => {
				entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, updateContext, showTooltipOnRender);
				showTooltipOnRender = false;
				return entry;
			}
		));

		const onStateChange = () => {
			if (this.shouldShowTooltip(updateService.state)) {
				if (context.get()) {
					entry?.showTooltip();
				} else {
					context.set(true);
					showTooltipOnRender = true;
				}
			} else {
				updateContext();
			}
		};

		this._register(updateService.onStateChange(onStateChange));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('update.titleBar')) {
				updateContext();
			}
		}));

		onStateChange();
	}

	private shouldShowTooltip(state: State): boolean {
		switch (state.type) {
			case StateType.Disabled:
				return state.reason === DisablementReason.InvalidConfiguration || state.reason === DisablementReason.RunningAsAdmin;
			case StateType.Idle:
				return !!state.error || state.notAvailable || this.isMajorMinorVersionChange();
			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Ready:
				return true;
			default:
				return false;
		}
	}

	private isMajorMinorVersionChange(): boolean {
		const currentVersion = this.productService.version;
		const lastKnownVersion = this.storageService.get(LAST_KNOWN_VERSION_KEY, StorageScope.APPLICATION);
		this.storageService.store(LAST_KNOWN_VERSION_KEY, currentVersion, StorageScope.APPLICATION, StorageTarget.MACHINE);
		if (!lastKnownVersion) {
			return false;
		}

		const current = tryParseVersion(currentVersion);
		const last = tryParseVersion(lastKnownVersion);
		if (!current || !last) {
			return false;
		}

		return current.major !== last.major || current.minor !== last.minor;
	}
}

/**
 * Custom action view item for the update indicator in the title bar.
 */
export class UpdateTitleBarEntry extends BaseActionViewItem {
	private content: HTMLElement | undefined;
	private readonly tooltip: UpdateTooltip;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly onDisposeTooltip: () => void,
		private showTooltipOnRender: boolean,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super(undefined, action, options);

		this.action.run = () => this.runAction();
		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));

		this._register(this.updateService.onStateChange(state => this.updateContent(state)));
	}

	public override render(container: HTMLElement) {
		super.render(container);

		this.content = dom.append(container, dom.$('.update-indicator'));
		this.updateTooltip();
		this.updateContent(this.updateService.state);

		if (this.showTooltipOnRender) {
			this.showTooltipOnRender = false;
			dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip());
		}
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
				this.showTooltip();
				break;
		}
	}

	public showTooltip() {
		if (!this.content?.isConnected) {
			return;
		}

		this.hoverService.showInstantHover({
			content: this.tooltip.domNode,
			target: {
				targetElements: [this.content],
				dispose: () => this.onDisposeTooltip(),
			},
			persistence: { sticky: true },
			appearance: { showPointer: true },
		}, true);
	}

	private updateContent(state: State) {
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
