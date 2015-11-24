/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import errors = require('vs/base/common/errors');
import arrays = require('vs/base/common/arrays');
import {IAction, Action} from 'vs/base/common/actions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IOutputChannelRegistry, Extensions, IOutputService, OUTPUT_EDITOR_INPUT_ID, OUTPUT_MODE_ID} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/browser/outputEditorInput';
import {SelectActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IWorkbenchEditorService}  from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {IInstantiationService, INullService} from 'vs/platform/instantiation/common/instantiation';

export class GlobalShowOutputAction extends Action {

	public static ID = 'workbench.action.output.showOutput';
	public static LABEL = nls.localize('showOutput', "Show Output");

	constructor(
		id: string,
		label: string,
		@IOutputService private outputService: IOutputService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);

		this.order = 20; // Allow other actions to position before or after
		this.class = 'output-action showoutput';
	}

	public run(event?: any): Promise {
		let channelToOpen: string = null;

		// Check for previously opened output
		let channels = <OutputEditorInput[]>this.quickOpenService.getEditorHistory().filter((i) => i instanceof OutputEditorInput);
		if (channels.length > 0) {

			// See if output is already opened and just focus it
			let editors = this.editorService.getVisibleEditors();
			if (editors.some((e) => {
				if (e.input instanceof OutputEditorInput) {
					this.editorService.focusEditor(e);

					return true;
				}

				return false;
			})) {
				return Promise.as(null);
			}

			// Otherwise pick a channel from the list
			channelToOpen = channels[0].getChannel();
		}

		// Fallback to any contributed channel otherwise if we dont have history
		else {
			channelToOpen = (<IOutputChannelRegistry>Registry.as(Extensions.OutputChannels)).getChannels()[0];
		}

		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));

		return this.outputService.showOutput(channelToOpen, sideBySide, false /* Do not preserve Focus */);
	}
}

export class ToggleOutputAction extends Action {

	public static ID = 'workbench.action.output.toggleOutput';
	public static LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(event?: any): Promise {
		let activeInput = this.editorService.getActiveEditorInput();

		// Restore Previous Non-Output Editor
		if (activeInput instanceof OutputEditorInput) {
			let history = this.quickOpenService.getEditorHistory();
			for (let i = 1; i < history.length; i++) {
				if (!(history[i] instanceof OutputEditorInput)) {
					return this.editorService.openEditor(history[i]);
				}
			}
		}

		// Show Output
		else {
			let action = this.instantiationService.createInstance(GlobalShowOutputAction, GlobalShowOutputAction.ID, GlobalShowOutputAction.LABEL);
			action.run().done(() => action.dispose(), errors.onUnexpectedError);
		}

		return Promise.as(true);
	}
}

export class ClearOutputAction extends EditorInputAction {

	constructor( @INullService ns) {
		super('workbench.output.action.clearOutput', nls.localize('clearOutput', "Clear Output"), 'output-action clear-output');
	}

	public run(): Promise {
		let outputEditorInput = <OutputEditorInput>this.input;
		outputEditorInput.clearOutput();

		return Promise.as(true);
	}
}

export class ClearOutputEditorAction extends EditorAction {

	public static ID = 'editor.action.clearoutput';

	constructor(
		descriptor: IEditorActionDescriptorData,
		editor: ICommonCodeEditor,
		@IWorkbenchEditorService private myEditorService: IWorkbenchEditorService
	) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
	}

	public getGroupId(): string {
		return 'clear';
	}

	public isSupported(): boolean {
		let model = this.editor.getModel();
		let mode = model && model.getMode();

		return mode && mode.getId() === OUTPUT_MODE_ID && super.isSupported();
	}

	public run(): TPromise<boolean> {
		let input = this.myEditorService.getActiveEditorInput();
		if (input && input.getId() === OUTPUT_EDITOR_INPUT_ID) {
			let outputEditorInput = <OutputEditorInput>input;
			outputEditorInput.clearOutput();

			return Promise.as(true);
		}

		return TPromise.as(false);
	}
}

export class SwitchOutputAction extends EditorInputAction {

	public static ID = 'workbench.output.action.switchBetweenOutputs';

	constructor( @IOutputService private outputService: IOutputService) {
		super(SwitchOutputAction.ID, nls.localize('switchToOutput.label', "Switch to Output"));

		this.class = 'output-action switch-to-output';
	}

	public isEnabled(): boolean {
		return super.isEnabled() && this.input instanceof OutputEditorInput;
	}

	public run(channel?: string): Promise {
		return this.outputService.showOutput(channel);
	}
}

export class SwitchOutputActionItem extends SelectActionItem {
	private input: OutputEditorInput;

	constructor(
		action: IAction,
		input: OutputEditorInput,
		@IOutputService private outputService: IOutputService
	) {
		super(null, action, SwitchOutputActionItem.getChannels(outputService, input), SwitchOutputActionItem.getChannels(outputService, input).indexOf(input.getChannel()));

		this.input = input;

		this.outputService.onOutputChannel.add(this.onOutputChannel, this);
	}

	private onOutputChannel(): void {
		let channels = SwitchOutputActionItem.getChannels(this.outputService, this.input);
		let selected = channels.indexOf(this.input.getChannel());

		this.setOptions(channels, selected);
	}

	private static getChannels(outputService: IOutputService, input: OutputEditorInput): string[] {
		const contributedChannels = (<IOutputChannelRegistry>Registry.as(Extensions.OutputChannels)).getChannels();
		const usedChannels = outputService.getChannels();
		usedChannels.push(input.getChannel());

		return arrays.distinct(contributedChannels.concat(usedChannels)).sort(); // sort by name
	}

	public dispose(): void {
		super.dispose();

		this.outputService.onOutputChannel.remove(this.onOutputChannel, this);
		delete this.input;
	}
}