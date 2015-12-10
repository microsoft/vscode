/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import { assign } from 'vs/base/common/objects';
import { emmet as $, append } from 'vs/base/browser/dom';
import { IDisposable, combinedDispose } from 'vs/base/common/lifecycle';
import { IGitService, ServiceState, IBranch, ServiceOperations } from 'vs/workbench/parts/git/common/git';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

interface IState {
	serviceState: ServiceState;
	isBusy: boolean;
	HEAD: IBranch;
	ps1: string;
}

export class GitStatusbarItem implements IStatusbarItem {

	private instantiationService: IInstantiationService;
	private gitService: IGitService;
	private quickOpenService: IQuickOpenService;
	private state: IState;
	private element: HTMLElement;
	private toDispose: IDisposable[];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IGitService gitService: IGitService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		this.instantiationService = instantiationService;
		this.gitService = gitService;
		this.quickOpenService = quickOpenService;
		this.toDispose = [];

		this.state = {
			serviceState: ServiceState.NotInitialized,
			isBusy: false,
			HEAD: null,
			ps1: ''
		};
	}

	public render(container: HTMLElement): IDisposable {
		this.element = append(container, $('a'));
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
			ps1: model.getPS1()
		});
	}

	private setState(state: IState): void {
		this.state = state;

		let disabled = false;
		let className = 'git-statusbar-item';
		let textContent: string;
		let title = '';
		let onclick: () => void = null;

		if (state.serviceState !== ServiceState.OK) {
			disabled = true;
			className += ' disabled';
			title = nls.localize('gitNotEnabled', "Git is not enabled in this workspace.");
			textContent = '\u00a0';
		} else {
			const HEAD = state.HEAD;

			if (state.isBusy) {
				className += ' busy';
			} else {
				onclick = () => this.onClick();
			}

			if (!HEAD) {
				textContent = state.ps1;
			} else if (!HEAD.name) {
				textContent = state.ps1;
				className += ' headless';
			} else if (!HEAD.commit || !HEAD.upstream || (!HEAD.ahead && !HEAD.behind)) {
				textContent = state.ps1;
			} else {
				textContent = strings.format('{0} {1}↓ {2}↑', state.ps1, HEAD.behind, HEAD.ahead);
			}
		}

		this.element.className = className;
		this.element.title = title;
		this.element.textContent = textContent;
		this.element.onclick = onclick;

		if (disabled) {
			this.element.setAttribute('disabled', 'disabled');
		} else {
			this.element.removeAttribute('disabled');
		}
	}

	private onClick(): void {
		this.quickOpenService.show('git checkout ');
	}
}