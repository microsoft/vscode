/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import { Delayer } from 'vs/base/common/async';
import { $, append, show, hide, toggleClass } from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { IDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IGitService, ServiceState, IBranch, ServiceOperations, IRemote } from 'vs/workbench/parts/git/common/git';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { SyncAction, PublishAction } from './gitActions';
import Severity from 'vs/base/common/severity';
import { IMessageService } from 'vs/platform/message/common/message';

interface IState {
	serviceState: ServiceState;
	isBusy: boolean;
	isSyncing: boolean;
	HEAD: IBranch;
	remotes: IRemote[];
	ps1: string;
}

const DisablementDelay = 500;

export class GitStatusbarItem implements IStatusbarItem {

	private instantiationService: IInstantiationService;
	private gitService: IGitService;
	private quickOpenService: IQuickOpenService;
	private state: IState;
	private element: HTMLElement;
	private branchElement: HTMLElement;
	private publishElement: HTMLElement;
	private syncElement: HTMLElement;
	private syncLabelElement: HTMLElement;
	private disablementDelayer: Delayer<void>;

	private syncAction: SyncAction;
	private publishAction: PublishAction;

	private toDispose: IDisposable[];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IGitService gitService: IGitService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.instantiationService = instantiationService;
		this.gitService = gitService;
		this.quickOpenService = quickOpenService;
		this.disablementDelayer = new Delayer<void>(DisablementDelay);

		this.syncAction = instantiationService.createInstance(SyncAction, SyncAction.ID, SyncAction.LABEL);
		this.publishAction = instantiationService.createInstance(PublishAction, PublishAction.ID, PublishAction.LABEL);

		this.toDispose = [
			this.syncAction,
			this.publishAction
		];

		this.state = {
			serviceState: ServiceState.NotInitialized,
			isBusy: false,
			isSyncing: false,
			HEAD: null,
			remotes: [],
			ps1: ''
		};
	}

	public render(container: HTMLElement): IDisposable {
		this.element = append(container, $('.git-statusbar-group'));

		this.branchElement = append(this.element, $('a'));

		this.publishElement = append(this.element, $('a.octicon.octicon-cloud-upload'));
		this.publishElement.title = nls.localize('publishBranch', "Publish Branch");
		this.publishElement.onclick = () => this.onPublishClick();

		this.syncElement = append(this.element, $('a.git-statusbar-sync-item'));
		this.syncElement.title = nls.localize('syncBranch', "Synchronize Changes");
		this.syncElement.onclick = () => this.onSyncClick();
		append(this.syncElement, $('span.octicon.octicon-sync'));

		this.syncLabelElement = append(this.syncElement, $('span.ahead-behind'));

		this.setState(this.state);
		this.toDispose.push(this.gitService.addBulkListener2(() => this.onGitServiceChange()));
		return combinedDisposable(this.toDispose);
	}

	private onGitServiceChange(): void {
		const model = this.gitService.getModel();

		this.setState({
			serviceState: this.gitService.getState(),
			isBusy: this.gitService.getRunningOperations().some(op => op.id === ServiceOperations.CHECKOUT || op.id === ServiceOperations.BRANCH),
			isSyncing: this.gitService.getRunningOperations().some(op => op.id === ServiceOperations.SYNC),
			HEAD: model.getHEAD(),
			remotes: model.getRemotes(),
			ps1: model.getPS1()
		});
	}

	private setState(state: IState): void {
		this.state = state;

		let isGitDisabled = false;
		let className = 'git-statusbar-branch-item';
		let textContent: string;
		let aheadBehindLabel = '';
		let title = '';
		let onclick: () => void = null;

		if (state.serviceState !== ServiceState.OK) {
			isGitDisabled = true;
			className += ' disabled';
			title = nls.localize('gitNotEnabled', "Git is not enabled in this workspace.");
			textContent = '\u00a0';
		} else {
			const HEAD = state.HEAD;

			if (state.isBusy) {
				className += ' busy';
			} else {
				onclick = () => this.onBranchClick();
			}

			if (!HEAD) {
				textContent = state.ps1;
			} else if (!HEAD.name) {
				textContent = state.ps1;
				className += ' headless';
			} else if (!HEAD.commit || !HEAD.upstream || (!HEAD.ahead && !HEAD.behind)) {
				textContent = state.ps1;
			} else {
				textContent = state.ps1;
				aheadBehindLabel = strings.format('{0}↓ {1}↑', HEAD.behind, HEAD.ahead);
			}
		}

		this.branchElement.className = className;
		this.branchElement.title = title;
		this.branchElement.textContent = textContent;
		this.branchElement.onclick = onclick;
		this.syncLabelElement.textContent = aheadBehindLabel;

		if (isGitDisabled) {
			hide(this.branchElement);
			hide(this.publishElement);
			hide(this.syncElement);
		} else {
			show(this.branchElement);

			if (state.HEAD && !!state.HEAD.upstream) {
				show(this.syncElement);
				toggleClass(this.syncElement, 'syncing', this.state.isSyncing);
				toggleClass(this.syncElement, 'empty', !aheadBehindLabel);
				this.disablementDelayer.trigger(
					() => toggleClass(this.syncElement, 'disabled', !this.syncAction.enabled),
					this.syncAction.enabled ? 0 : DisablementDelay
				);
				hide(this.publishElement);
			} else if (state.remotes.length > 0) {
				hide(this.syncElement);
				show(this.publishElement);
				this.disablementDelayer.trigger(
					() => toggleClass(this.publishElement, 'disabled', !this.publishAction.enabled),
					this.publishAction.enabled ? 0 : DisablementDelay
				);
			} else {
				hide(this.syncElement);
				hide(this.publishElement);
			}
		}
	}

	private onBranchClick(): void {
		this.quickOpenService.show('git checkout ');
	}

	private onPublishClick(): void {
		this.runAction(this.publishAction);
	}

	private onSyncClick(): void {
		this.runAction(this.syncAction);
	}

	private runAction(action: IAction): void {
		if (!action.enabled) {
			return;
		}

		this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'status bar' });

		action.run()
			.done(null, err => this.messageService.show(Severity.Error, err));
	}
}
