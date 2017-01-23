/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomeOverlay';
import { $ } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ShowAllCommandsAction } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';

interface Key {
	id: string;
	arrow: string;
	label: string;
	command?: string;
	arrowLast?: boolean;
	withEditor?: boolean;
}

const keys: Key[] = [
	{
		id: 'explorer',
		arrow: '&larr;',
		label: localize('welcomeOverlay.explorer', "File explorer"),
		command: 'workbench.view.explorer'
	},
	{
		id: 'search',
		arrow: '&larr;',
		label: localize('welcomeOverlay.search', "Search across files"),
		command: 'workbench.view.search'
	},
	{
		id: 'git',
		arrow: '&larr;',
		label: localize('welcomeOverlay.git', "Source code management"),
		command: SCMPreview.enabled ? 'workbench.view.scm' : 'workbench.view.git'
	},
	{
		id: 'debug',
		arrow: '&larr;',
		label: localize('welcomeOverlay.debug', "Launch and debug"),
		command: 'workbench.view.debug'
	},
	{
		id: 'extensions',
		arrow: '&larr;',
		label: localize('welcomeOverlay.extensions', "Manage extensions"),
		command: 'workbench.view.extensions'
	},
	// {
	// 	id: 'watermark',
	// 	arrow: '&larrpl;',
	// 	label: localize('welcomeOverlay.watermark', "Command Hints"),
	// 	withEditor: false
	// },
	{
		id: 'problems',
		arrow: '&larrpl;',
		label: localize('welcomeOverlay.problems', "View errors and warnings"),
		command: 'workbench.actions.view.problems'
	},
	// {
	// 	id: 'openfile',
	// 	arrow: '&cudarrl;',
	// 	label: localize('welcomeOverlay.openfile', "File Properties"),
	// 	arrowLast: true,
	// 	withEditor: true
	// },
	{
		id: 'commandPalette',
		arrow: '&nwarr;',
		label: localize('welcomeOverlay.commandPalette', "Find and run all commands"),
		command: ShowAllCommandsAction.ID
	},
];

export class WelcomeOverlayAction extends Action {

	public static ID = 'workbench.action.weclomeOverlay';
	public static LABEL = localize('weclomeOverlay', "User Interface Key");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const welcomeOverlay = document.querySelector('.monaco-workbench > .welcomeOverlay') as HTMLDivElement;
		const welcomePage = document.getElementById('workbench.parts.editor') as HTMLDivElement;
		welcomeOverlay.style.display = 'block';
		dom.addClass(welcomePage, 'blur-background');
		return null;
	}
}

export class WelcomeOverlayContribution implements IWorkbenchContribution {

	constructor(
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		this.partService.joinCreation().then(() => {
			this.create();
		}, errors.onUnexpectedError);
	}

	public getId() {
		return 'vs.welcomeOverlay';
	}

	private create(): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);

		const offset = this.partService.getTitleBarOffset();
		const overlay = $(container.parentElement)
			.div({ 'class': 'welcomeOverlay' })
			.style({ top: `${offset}px` })
			.style({ height: `calc(100% - ${offset}px)` })
			.display('none');

		overlay.on('click', () => {
			overlay.display('none');
			const welcomePage = document.getElementById('workbench.parts.editor') as HTMLDivElement;
			dom.removeClass(welcomePage, 'blur-background');
		});

		const editorOpen = !!this.editorService.getVisibleEditors().length;
		keys.filter(key => !('withEditor' in key) || key.withEditor === editorOpen)
			.forEach(({ id, arrow, label, command, arrowLast }) => {
				const div = $(overlay).div({ 'class': ['key', id] });
				if (!arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
				$(div).span({ 'class': 'label' }).text(label);
				if (command) {
					const shortcut = this.keybindingService.lookupKeybindings(command)
						.slice(0, 1)
						.map(k => this.keybindingService.getLabelFor(k))[0];
					if (shortcut) {
						$(div).span({ 'class': 'shortcut' }).text(shortcut);
					}
				}
				if (arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
			});
		$(overlay).div({ 'class': 'commandPalettePlaceholder' });
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeOverlayContribution);

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WelcomeOverlayAction, WelcomeOverlayAction.ID, WelcomeOverlayAction.LABEL), 'Help: User Interface Overlay', localize('help', "Help"));
