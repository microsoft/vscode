/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { SelectActionItem, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDebugService, EDITOR_CONTRIBUTION_ID, IDebugEditorContribution } from 'vs/workbench/parts/debug/common/debug';

const $ = dom.$;

export class StartDebugActionItem extends EventEmitter implements IActionItem {

	private static ADD_CONFIGURATION = nls.localize('addConfiguration', "Add Configuration...");
	private static SEPARATOR = '─────────';

	public actionRunner: IActionRunner;
	private container: HTMLElement;
	private start: HTMLElement;
	private selectBox: SelectBox;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		private context: any,
		private action: IAction,
		@IDebugService private debugService: IDebugService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super();
		this.toDispose = [];
		this.selectBox = new SelectBox([], -1);
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => {
			if (e.sourceConfig.launch) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.selectBox.onDidSelect(configurationName => {
			if (configurationName === StartDebugActionItem.ADD_CONFIGURATION) {
				const manager = this.debugService.getConfigurationManager();
				this.selectBox.select(manager.getConfigurationNames().indexOf(this.debugService.getViewModel().selectedConfigurationName));
				manager.openConfigFile(false).done(editor => {
					if (editor) {
						const codeEditor = <ICommonCodeEditor>editor.getControl();
						if (codeEditor) {
							return codeEditor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).addLaunchConfiguration();
						}
					}

					return undefined;
				});
			} else {
				this.debugService.getViewModel().setSelectedConfigurationName(configurationName);
			}
		}));
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'start-debug-action-item');
		this.start = dom.append(container, $('.icon'));
		this.start.title = this.action.label;
		this.start.tabIndex = 0;

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.CLICK, () => {
			this.start.blur();
			this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (this.action.enabled && e.button === 0) {
				dom.addClass(this.start, 'active');
			}
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_UP, () => {
			dom.removeClass(this.start, 'active');
		}));
		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_OUT, () => {
			dom.removeClass(this.start, 'active');
		}));

		this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter)) {
				this.actionRunner.run(this.action, this.context).done(null, errors.onUnexpectedError);
			}
		}));

		this.selectBox.render(dom.append(container, $('.configuration')));
		this.updateOptions();
	}

	public setActionContext(context: any): void {
		this.context = context;
	}

	public isEnabled(): boolean {
		return true;
	}

	public focus(): void {
		this.start.focus();
	}

	public blur(): void {
		this.container.blur();
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}

	private updateOptions(): void {
		const options = this.debugService.getConfigurationManager().getConfigurationNames();
		if (options.length === 0) {
			options.push(nls.localize('noConfigurations', "No Configurations"));
		}
		const selected = options.indexOf(this.debugService.getViewModel().selectedConfigurationName);
		options.push(StartDebugActionItem.SEPARATOR);
		options.push(StartDebugActionItem.ADD_CONFIGURATION);
		this.selectBox.setOptions(options, selected, options.length - 2);
	}
}

export class FocusProcessActionItem extends SelectActionItem {
	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService
	) {
		super(null, action, [], -1);

		this.debugService.getViewModel().onDidFocusStackFrame(() => {
			const process = this.debugService.getViewModel().focusedProcess;
			if (process) {
				const names = this.debugService.getModel().getProcesses().map(p => p.name);
				this.select(names.indexOf(process.name));
			}
		});

		this.debugService.getModel().onDidChangeCallStack(() => {
			this.setOptions(this.debugService.getModel().getProcesses().map(p => p.name));
		});
	}
}
