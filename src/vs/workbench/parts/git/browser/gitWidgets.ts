/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import react = require('lib/react');
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import lifecycle = require('vs/base/common/lifecycle');
import git = require('vs/workbench/parts/git/common/git');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import {IQuickOpenService} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

import IGitService = git.IGitService;

interface GitStatusbarWidgetProps {
	instantiationService: IInstantiationService;
	gitService: IGitService;
	quickOpenService: IQuickOpenService;
}

interface GitStatusbarWidgetState {
	serviceState: git.ServiceState;
	isBusy: boolean;
	HEAD: git.IBranch;
	ps1: string;
}

class GitStatusbarWidgetSpec extends react.BaseComponent<GitStatusbarWidgetProps, GitStatusbarWidgetState> {

	private serviceListeners: lifecycle.IDisposable[];

	public componentDidMount(): void {
		this.serviceListeners = [
			this.props.gitService.addBulkListener2(() => this.onGitServiceChange())
		];
	}

	public getInitialState(): GitStatusbarWidgetState {
		return {
			serviceState: git.ServiceState.NotInitialized,
			isBusy: false,
			HEAD: null,
			ps1: ''
		};
	}

	public render(): react.ReactHTMLElement {
		if (this.state.serviceState !== git.ServiceState.OK) {
			return react.createElement('span', {
				className: 'git-statusbar-item disabled',
				title: nls.localize('gitNotEnabled', "Git is not enabled in this workspace."),
			}, '\u00a0');
		}

		var HEAD = this.state.HEAD;
		var className = 'git-statusbar-item';
		var label: string;
		var onClick: (e: react.SyntheticEvent)=>void = null;

		if (this.state.isBusy) {
			className += ' busy';
		} else {
			onClick = this.onClick;
		}

		if (!HEAD) {
			label = this.state.ps1;
		} else if (!HEAD.name) {
			label = this.state.ps1;
			className += ' headless';
		} else if (!HEAD.commit || !HEAD.upstream || (!HEAD.ahead && !HEAD.behind)) {
			label = this.state.ps1;
		} else {
			label = strings.format('{0} {1}↓ {2}↑', this.state.ps1, HEAD.behind, HEAD.ahead);
		}

		return react.createElement('a', {
			className: className,
			onClick: onClick
		}, label);
	}

	private onGitServiceChange(): void {
		var service = this.props.gitService;
		var model = service.getModel();

		this.updateState({
			serviceState: service.getState(),
			isBusy: service.getRunningOperations().some(op => op.id === git.ServiceOperations.CHECKOUT || op.id === git.ServiceOperations.BRANCH),
			HEAD: model.getHEAD(),
			ps1: model.getPS1()
		});
	}

	private updateState(update: any, callback?: ()=>void): void {
		this.setState(objects.mixin(update, this.state, false), callback);
	}

	private onClick(e: react.SyntheticEvent): void {
		this.props.quickOpenService.show('git checkout ');
	}
}

var GitStatusbarWidget = react.createFactoryForTS<GitStatusbarWidgetProps>(GitStatusbarWidgetSpec.prototype);

export class GitStatusbarItem implements statusbar.IStatusbarItem {

	private instantiationService: IInstantiationService;
	private gitService: IGitService;
	private quickOpenService: IQuickOpenService;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IGitService gitService: IGitService,
		@IQuickOpenService quickOpenService: IQuickOpenService
	) {
		this.instantiationService = instantiationService;
		this.gitService = gitService;
		this.quickOpenService = quickOpenService;
	}

	public render(container: HTMLElement): lifecycle.IDisposable {
		react.render(
			GitStatusbarWidget({
				instantiationService: this.instantiationService,
				gitService: this.gitService,
				quickOpenService: this.quickOpenService
			}),
			container
		);

		return lifecycle.toDisposable(() => react.unmountComponentAtNode(container));
	}
}