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
import {IDisposable} from 'vs/base/common/lifecycle';
import {IAction, Action} from 'vs/base/common/actions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IOutputChannelRegistry, Extensions, IOutputService, OUTPUT_EDITOR_INPUT_ID, OUTPUT_MODE_ID, OUTPUT_PANEL_ID} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/common/outputEditorInput';
import {SelectActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IInstantiationService, INullService} from 'vs/platform/instantiation/common/instantiation';

export class ToggleOutputAction extends Action {

	public static ID = 'workbench.action.output.toggleOutput';
	public static LABEL = nls.localize('toggleOutput', "Toggle Output");

	constructor(
		id: string, label: string,
		@IPartService private partService: IPartService,
		@IPanelService private panelService: IPanelService,
		@IOutputService private outputService: IOutputService
	) {
		super(id, label);
	}

	public run(event?: any): Promise {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === OUTPUT_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return Promise.as(null);
		}

		return this.outputService.showOutput();
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
		@IOutputService private outputService: IOutputService
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
		this.outputService.clearOutput(this.outputService.getActiveChannel());
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
	private outputListenerDispose: IDisposable;

	constructor(
		action: IAction,
		input: OutputEditorInput,
		@IOutputService private outputService: IOutputService
	) {
		super(null, action, SwitchOutputActionItem.getChannels(outputService, input), SwitchOutputActionItem.getChannels(outputService, input).indexOf(input.getChannel()));

		this.input = input;

		this.outputListenerDispose = this.outputService.onOutputChannel(this.onOutputChannel, this);
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

		if (this.outputListenerDispose) {
			this.outputListenerDispose.dispose();
			delete this.outputListenerDispose;
		}

		delete this.input;
	}
}