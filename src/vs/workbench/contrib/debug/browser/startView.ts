/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewletPane, IViewletPaneOptions } from 'vs/workbench/browser/parts/views/paneViewlet';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StartAction, RunAction, ConfigureAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { equals } from 'vs/base/common/arrays';
const $ = dom.$;

export class StartView extends ViewletPane {

	static ID = 'workbench.debug.startView';
	static LABEL = localize('start', "Start");

	private debugButton!: Button;
	private runButton!: Button;
	private firstMessageContainer!: HTMLElement;
	private secondMessageContainer!: HTMLElement;
	private debuggerLabels: string[] | undefined = undefined;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private readonly themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IDebugService private readonly debugService: IDebugService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileDialogService private readonly dialogService: IFileDialogService
	) {
		super({ ...(options as IViewletPaneOptions), ariaHeaderLabel: localize('debugStart', "Debug Start Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
		this._register(editorService.onDidActiveEditorChange(() => this.updateView()));
		this._register(this.debugService.getConfigurationManager().onDidRegisterDebugger(() => this.updateView()));
	}

	private updateView(): void {
		const activeEditor = this.editorService.activeTextEditorWidget;
		const debuggerLabels = this.debugService.getConfigurationManager().getDebuggerLabelsForEditor(activeEditor);
		if (!equals(this.debuggerLabels, debuggerLabels)) {
			this.debuggerLabels = debuggerLabels;
			const enabled = this.debuggerLabels.length > 0;

			this.debugButton.enabled = enabled;
			this.runButton.enabled = enabled;
			this.debugButton.label = this.debuggerLabels.length !== 1 ? localize('debug', "Debug") : localize('debugWith', "Debug with {0}", this.debuggerLabels[0]);
			this.runButton.label = this.debuggerLabels.length !== 1 ? localize('run', "Run") : localize('runWith', "Run with {0}", this.debuggerLabels[0]);

			const emptyWorkbench = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
			this.firstMessageContainer.innerHTML = '';
			this.secondMessageContainer.innerHTML = '';
			const secondMessageElement = $('span');
			this.secondMessageContainer.appendChild(secondMessageElement);

			const setSecondMessage = () => {
				secondMessageElement.textContent = localize('specifyHowToRun', "To futher configure Debug and Run");
				const clickElement = $('span.click');
				clickElement.textContent = localize('configure', " create a launch.json file.");
				clickElement.onclick = () => this.commandService.executeCommand(ConfigureAction.ID);
				this.secondMessageContainer.appendChild(clickElement);
			};
			const setSecondMessageWithFolder = () => {
				secondMessageElement.textContent = localize('noLaunchConfiguration', "To futher configure Debug and Run, ");
				const clickElement = $('span.click');
				clickElement.textContent = localize('openFolder', " open a folder");
				clickElement.onclick = () => this.dialogService.pickFolderAndOpen({ forceNewWindow: false });
				this.secondMessageContainer.appendChild(clickElement);

				const moreText = $('span.moreText');
				moreText.textContent = localize('andconfigure', " and create a launch.json file.");
				this.secondMessageContainer.appendChild(moreText);
			};

			if (enabled && !emptyWorkbench) {
				setSecondMessage();
			}

			if (enabled && emptyWorkbench) {
				setSecondMessageWithFolder();
			}

			if (!enabled && !emptyWorkbench) {
				const firstMessageElement = $('span');
				this.firstMessageContainer.appendChild(firstMessageElement);
				firstMessageElement.textContent = localize('simplyDebugAndRun', "Open a file which can be debugged or run.");

				setSecondMessage();
			}

			if (!enabled && emptyWorkbench) {
				const clickElement = $('span.click');
				clickElement.textContent = localize('openFile', "Open a file");
				clickElement.onclick = () => this.dialogService.pickFileAndOpen({ forceNewWindow: false });

				this.firstMessageContainer.appendChild(clickElement);
				const firstMessageElement = $('span');
				this.firstMessageContainer.appendChild(firstMessageElement);
				firstMessageElement.textContent = localize('canBeDebuggedOrRun', " which can be debugged or run.");


				setSecondMessageWithFolder();
			}
		}
	}

	protected renderBody(container: HTMLElement): void {
		this.firstMessageContainer = $('.top-section');
		container.appendChild(this.firstMessageContainer);

		this.debugButton = new Button(container);
		this._register(this.debugButton.onDidClick(() => {
			this.commandService.executeCommand(StartAction.ID);
		}));
		attachButtonStyler(this.debugButton, this.themeService);

		this.runButton = new Button(container);
		this.runButton.label = localize('run', "Run");

		dom.addClass(container, 'debug-start-view');
		this._register(this.runButton.onDidClick(() => {
			this.commandService.executeCommand(RunAction.ID);
		}));
		attachButtonStyler(this.runButton, this.themeService);

		this.secondMessageContainer = $('.section');
		container.appendChild(this.secondMessageContainer);

		this.updateView();
	}

	protected layoutBody(_: number, __: number): void {
		// no-op
	}

	focus(): void {
		this.runButton.focus();
	}
}
