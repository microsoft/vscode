/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomeOverlay';
import { $, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/platform';
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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

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

const OVERLAY_VISIBLE = new RawContextKey<boolean>('interfaceOverviewVisible', false);

let welcomeOverlay: WelcomeOverlay;

export class WelcomeOverlayAction extends Action {

	public static ID = 'workbench.action.showInterfaceOverview';
	public static LABEL = localize('welcomeOverlay', "User Interface Overview");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		if (!welcomeOverlay) {
			welcomeOverlay = this.instantiationService.createInstance(WelcomeOverlay);
		}
		welcomeOverlay.show();
		return null;
	}
}

export class HideWelcomeOverlayAction extends Action {

	public static ID = 'workbench.action.hideInterfaceOverview';
	public static LABEL = localize('hideWelcomeOverlay', "Hide Interface Overview");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		if (welcomeOverlay) {
			welcomeOverlay.hide();
		}
		return null;
	}
}

class WelcomeOverlay {

	private _toDispose: IDisposable[] = [];
	private _overlayVisible: IContextKey<boolean>;
	private _overlay: Builder;

	constructor(
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		this._overlayVisible = OVERLAY_VISIBLE.bindTo(this._contextKeyService);
		this.create();
	}

	private create(): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);

		const offset = this.partService.getTitleBarOffset();
		this._overlay = $(container.parentElement)
			.div({ 'class': 'welcomeOverlay' })
			.style({ top: `${offset}px` })
			.style({ height: `calc(100% - ${offset}px)` })
			.display('none');

		this._overlay.on('click', () => this.hide(), this._toDispose);
		this.commandService.onWillExecuteCommand(() => this.hide());

		$(this._overlay).div({ 'class': 'commandPalettePlaceholder' });

		const editorOpen = !!this.editorService.getVisibleEditors().length;
		keys.filter(key => !('withEditor' in key) || key.withEditor === editorOpen)
			.forEach(({ id, arrow, label, command, arrowLast }) => {
				const div = $(this._overlay).div({ 'class': ['key', id] });
				if (!arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
				$(div).span({ 'class': 'label' }).text(label);
				if (command) {
					const shortcut = this.keybindingService.lookupKeybinding(command);
					if (shortcut) {
						$(div).span({ 'class': 'shortcut' }).text(shortcut.getLabel());
					}
				}
				if (arrowLast) {
					$(div).span({ 'class': 'arrow' }).innerHtml(arrow);
				}
			});
	}

	public show() {
		if (this._overlay.style('display') !== 'block') {
			this._overlay.display('block');
			const workbench = document.querySelector('.monaco-workbench') as HTMLElement;
			dom.addClass(workbench, 'blur-background');
			this._overlayVisible.set(true);
			this.updateProblemsKey();
		}
	}

	private updateProblemsKey() {
		const problems = document.querySelector('.task-statusbar-item');
		const key = this._overlay.getHTMLElement().querySelector('.key.problems') as HTMLElement;
		if (problems instanceof HTMLElement) {
			const target = problems.getBoundingClientRect();
			const bounds = this._overlay.getHTMLElement().getBoundingClientRect();
			const bottom = bounds.bottom - target.top + 3;
			const left = (target.left + target.right) / 2 - bounds.left;
			key.style.bottom = bottom + 'px';
			key.style.left = left + 'px';
		} else {
			key.style.bottom = null;
			key.style.left = null;
		}
	}

	public hide() {
		if (this._overlay.style('display') !== 'none') {
			this._overlay.display('none');
			const workbench = document.querySelector('.monaco-workbench') as HTMLElement;
			dom.removeClass(workbench, 'blur-background');
			this._overlayVisible.reset();
		}
	}

	dispose() {
		this._toDispose = dispose(this._toDispose);
	}
}

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WelcomeOverlayAction, WelcomeOverlayAction.ID, WelcomeOverlayAction.LABEL), 'Help: Show Interface Overview', localize('help', "Help"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(HideWelcomeOverlayAction, HideWelcomeOverlayAction.ID, HideWelcomeOverlayAction.LABEL, { primary: KeyCode.Escape }, OVERLAY_VISIBLE), 'Help: Hide Interface Overview', localize('help', "Help"));
