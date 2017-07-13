/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/deploymentView';
import nls = require('vs/nls');
import * as errors from 'vs/base/common/errors';
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { $ } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { focusBorder, textLinkForeground, textLinkActiveForeground } from 'vs/platform/theme/common/colorRegistry';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import URI from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';


const TARGETS = [
	{
		id: 'azure',
		label: nls.localize('deployToAzure', "Deploy to Azure App Service"),
		uri: () => URI.parse('https://code.visualstudio.com/tutorials/nodejs-deployment/getting-started#vscode')
	},
	{
		id: 'aws',
		label: nls.localize('deployToAWS', "Deploy to Elastic Beanstalk (AWS)"),
		uri: () => URI.parse('http://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb3-cli-git.html')
	},
	{
		id: 'heroku',
		label: nls.localize('deployToHeroku', "Deploy to Heroku"),
		uri: () => URI.parse('https://devcenter.heroku.com/articles/git')
	},
];

export class DeploymentView extends CollapsibleView {

	public static ID: string = 'workbench.deploymentView';
	public static NAME = nls.localize('deployment', "Deployment");
	public static HEADER_HEIGHT = 22;
	public static HEIGHT = 80;

	private deploymentLink: HTMLAnchorElement;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IOpenerService private openerService: IOpenerService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('deploymentSection', "Deployment Section"), sizing: ViewSizing.Fixed }, keybindingService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'deployment-view');

		let section = $('div.section').appendTo(container);

		this.deploymentLink = document.createElement('a');
		this.deploymentLink.innerText = nls.localize('deployApplication', "Deploy your application using Git");
		this.deploymentLink.classList.add('pointer');
		this.deploymentLink.classList.add('prominent');
		this.deploymentLink.tabIndex = 0;
		this.deploymentLink.href = 'javascript:void(0)';
		this.deploymentLink.addEventListener('click', e => {
			this.pickTargetService();
			e.preventDefault();
			e.stopPropagation();
		});
		section.append(this.deploymentLink);
	}

	private pickTargetService() {
		this.telemetryService.publicLog('deploymentClicked');
		this.quickOpenService.pick(TARGETS, { placeHolder: nls.localize('pickTargetService', "Pick target service") })
			.then(pick => {
				if (pick) {
					this.telemetryService.publicLog('deploymentServicePicked', { id: pick.id });
				} else {
					this.telemetryService.publicLog('deploymentCanceled');
				}
				return pick && this.openerService.open(pick.uri());
			})
			.then(null, errors.onUnexpectedError);
	}

	layoutBody(size: number): void {
		// no-op
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public focusBody(): void {
		if (this.deploymentLink) {
			this.deploymentLink.focus();
		}
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return TPromise.as(null);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
	}
}

// theming

registerThemingParticipant((theme, collector) => {
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.deployment-view a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.deployment-view a:hover,
			.deployment-view a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.deployment-view a:focus { outline-color: ${focusColor}; }`);
	}
});
