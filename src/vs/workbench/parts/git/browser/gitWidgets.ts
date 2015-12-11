/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import { assign } from 'vs/base/common/objects';
import { onUnexpectedError } from 'vs/base/common/errors';
import { emmet as $, append, show, hide, addClass } from 'vs/base/browser/dom';
import { IDisposable, combinedDispose } from 'vs/base/common/lifecycle';
import { IGitService, ServiceState, IBranch, ServiceOperations, IRemote } from 'vs/workbench/parts/git/common/git';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SyncAction, PublishAction } from './gitActions';

interface IState {
	serviceState: ServiceState;
	isBusy: boolean;
	HEAD: IBranch;
	remotes: IRemote[];
	ps1: string;
}

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

	private syncAction: SyncAction;
	private publishAction: PublishAction;

	private toDispose: IDisposable[];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IGitService gitService: IGitService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		this.instantiationService = instantiationService;
		this.gitService = gitService;
		this.quickOpenService = quickOpenService;

		this.syncAction = instantiationService.createInstance(SyncAction, SyncAction.ID, SyncAction.LABEL);
		this.publishAction = instantiationService.createInstance(PublishAction, PublishAction.ID, PublishAction.LABEL);

		this.toDispose = [
			this.syncAction,
			this.publishAction
		];

		this.state = {
			serviceState: ServiceState.NotInitialized,
			isBusy: false,
			HEAD: null,
			remotes: [],
			ps1: ''
		};
	}

	public render(container: HTMLElement): IDisposable {
		this.element = append(container, $('.git-statusbar-group'));
		this.branchElement = append(this.element, $('a'));
		this.publishElement = append(this.element, $('a'));
		this.syncElement = append(this.element, $('a'));
		append(this.syncElement, $('span.octicon.octicon-sync'));
		this.syncLabelElement = append(this.syncElement, $('span'));

		this.setState(this.state);
		this.toDispose.push(this.gitService.addBulkListener2(() => this.onGitServiceChange()));
		return combinedDispose(...this.toDispose);
	}

	private onGitServiceChange(): void {
		const model = this.gitService.getModel();

		this.setState({
			serviceState: this.gitService.getState(),
			isBusy: this.gitService.getRunningOperations().some(op => op.id === ServiceOperations.CHECKOUT || op.id === ServiceOperations.BRANCH),
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
		this.publishElement.className = 'octicon octicon-cloud-upload';
		this.syncLabelElement.textContent = aheadBehindLabel;
		this.syncElement.className = 'git-statusbar-sync-item' + (aheadBehindLabel ? '' : ' empty');

		if (isGitDisabled) {
			hide(this.branchElement);
			hide(this.publishElement);
			hide(this.syncElement);
		} else {
			show(this.branchElement);

			if (state.HEAD && !!state.HEAD.upstream) {
				show(this.syncElement);
				hide(this.publishElement);
			} else if (state.remotes.length > 0) {
				hide(this.syncElement);
				show(this.publishElement);
			} else {
				hide(this.syncElement);
				hide(this.publishElement);
			}
		}

		if (this.syncAction.enabled) {
			this.syncElement.onclick = () => this.onSyncClick();
		} else {
			this.syncElement.onclick = null;
			addClass(this.syncElement, 'disabled');
		}

		if (this.publishAction.enabled) {
			this.publishElement.onclick = () => this.onPublishClick();
		} else {
			this.publishElement.onclick = null;
			addClass(this.publishElement, 'disabled');
		}
	}

	private onBranchClick(): void {
		this.quickOpenService.show('git checkout ');
	}

	private onPublishClick(): void {
		this.publishAction.run().done(null, onUnexpectedError);
	}

	private onSyncClick(): void {
		this.syncAction.run().done(null, onUnexpectedError);
	}
}