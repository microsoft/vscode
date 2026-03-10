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
		@IUpdateService updateService: IUpdateService,
	) {
		super();

		if (isWeb) {
			return; // Electron only
		}

		this._register(actionViewItemService.register(
			MenuId.CommandCenter,
			UPDATE_TITLE_BAR_ACTION_ID,
			(action, options) => instantiationService.createInstance(UpdateTitleBarEntry, action, options)
		));

		const context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);
		const actionableStates = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];

		const updateVisibility = () => {
			const mode = configurationService.getValue<string>('update.titleBar');
			const state = updateService.state;
			context.set(mode === 'detailed' || mode === 'actionable' && actionableStates.includes(state.type));
		};

		this._register(updateService.onStateChange(updateVisibility));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('update.titleBar')) {
				updateVisibility();
			}
		}));

		updateVisibility();
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
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super(undefined, action, options);

		this.action.run = this.runAction.bind(this);
		this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));

		this._register(this.updateService.onStateChange(this.onStateChange.bind(this)));
	}

	public override render(container: HTMLElement) {
		super.render(container);

		this.content = dom.append(container, dom.$('.update-indicator'));
		this.updateTooltip();
		this.onStateChange(this.updateService.state);
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

	private showTooltip() {
		if (!this.content) {
			return;
		}

		this.hoverService.showInstantHover({
			content: this.tooltip.domNode,
			target: this.content,
			persistence: { sticky: true },
			appearance: { showPointer: true },
		}, true);
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

		let showTooltip = false;
		switch (state.type) {
			case StateType.Disabled:
				this.content.classList.add('update-disabled');
				showTooltip = state.reason === DisablementReason.InvalidConfiguration || state.reason === DisablementReason.RunningAsAdmin;
				break;

			case StateType.Idle:
				showTooltip = !!state.error || state.notAvailable || this.isMajorMinorVersionChange();
				break;

			case StateType.CheckingForUpdates:
			case StateType.Overwriting:
				this.renderProgressState(this.content);
				break;

			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Ready:
				this.content.classList.add('prominent');
				showTooltip = true;
				break;

			case StateType.Downloading:
				this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
				break;

			case StateType.Updating:
				this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
				break;
		}

		if (showTooltip) {
			this.showTooltip();
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

	private renderProgressState(content: HTMLElement, percentage?: number) {
		if (percentage !== undefined) {
			content.classList.add('progress-percent');
			content.style.setProperty('--update-progress', `${percentage}%`);
		} else {
			content.classList.add('progress-indefinite');
		}
	}
}
