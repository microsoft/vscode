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
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StartAction, RunAction, ConfigureAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { equals } from 'vs/base/common/arrays';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
const $ = dom.$;

export class StartView extends ViewPane {

	static ID = 'workbench.debug.startView';
	static LABEL = localize('start', "Start");

	private debugButton!: Button;
	private runButton!: Button;
	private firstMessageContainer!: HTMLElement;
	private secondMessageContainer!: HTMLElement;
	private clickElement: HTMLElement | undefined;
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
		super({ ...(options as IViewPaneOptions), ariaHeaderLabel: localize('debugStart', "Debug Start Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
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
			const debugKeybinding = this.keybindingService.lookupKeybinding(StartAction.ID);
			let debugLabel = this.debuggerLabels.length !== 1 ? localize('debug', "Debug") : localize('debugWith', "Debug with {0}", this.debuggerLabels[0]);
			if (debugKeybinding) {
				debugLabel += ` (${debugKeybinding.getLabel()})`;
			}
			this.debugButton.label = debugLabel;

			let runLabel = this.debuggerLabels.length !== 1 ? localize('run', "Run") : localize('runWith', "Run with {0}", this.debuggerLabels[0]);
			const runKeybinding = this.keybindingService.lookupKeybinding(RunAction.ID);
			if (runKeybinding) {
				runLabel += ` (${runKeybinding.getLabel()})`;
			}
			this.runButton.label = runLabel;

			const emptyWorkbench = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
			this.firstMessageContainer.innerHTML = '';
			this.secondMessageContainer.innerHTML = '';
			const secondMessageElement = $('span');
			this.secondMessageContainer.appendChild(secondMessageElement);

			const setSecondMessage = () => {
				secondMessageElement.textContent = localize('specifyHowToRun', "To further configure Debug and Run");
				this.clickElement = this.createClickElement(localize('configure', " create a launch.json file."), () => this.commandService.executeCommand(ConfigureAction.ID));
				this.secondMessageContainer.appendChild(this.clickElement);
			};
			const setSecondMessageWithFolder = () => {
				secondMessageElement.textContent = localize('noLaunchConfiguration', "To further configure Debug and Run, ");
				this.clickElement = this.createClickElement(localize('openFolder', " open a folder"), () => this.dialogService.pickFolderAndOpen({ forceNewWindow: false }));
				this.secondMessageContainer.appendChild(this.clickElement);

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
				this.clickElement = this.createClickElement(localize('openFile', "Open a file"), () => this.dialogService.pickFileAndOpen({ forceNewWindow: false }));
				this.firstMessageContainer.appendChild(this.clickElement);
				const firstMessageElement = $('span');
				this.firstMessageContainer.appendChild(firstMessageElement);
				firstMessageElement.textContent = localize('canBeDebuggedOrRun', " which can be debugged or run.");

				setSecondMessageWithFolder();
			}
		}
	}

	private createClickElement(textContent: string, action: () => any): HTMLSpanElement {
		const clickElement = $('span.click');
		clickElement.textContent = textContent;
		clickElement.onclick = action;
		clickElement.tabIndex = 0;
		clickElement.onkeyup = (e) => {
			const keyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.keyCode === KeyCode.Enter || (keyboardEvent.keyCode === KeyCode.Space)) {
				action();
			}
		};

		return clickElement;
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
		if (this.debugButton.enabled) {
			this.debugButton.focus();
		} else if (this.clickElement) {
			this.clickElement.focus();
		}
	}
}
