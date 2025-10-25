/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { ICodeEditor } from '../../browser/editorBrowser.js';
import { AbstractCodeEditorService, GlobalStyleSheet } from '../../browser/services/abstractCodeEditorService.js';
import { CommandsRegistry, ICommandEvent, ICommandService } from '../../../platform/commands/common/commands.js';
import { IResourceEditorInput } from '../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';

export class TestCodeEditorService extends AbstractCodeEditorService {

	public readonly globalStyleSheet = new TestGlobalStyleSheet();

	protected override _createGlobalStyleSheet(): GlobalStyleSheet {
		return this.globalStyleSheet;
	}

	getActiveCodeEditor(): ICodeEditor | null {
		return null;
	}
	public lastInput?: IResourceEditorInput;
	override openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {
		this.lastInput = input;
		return Promise.resolve(null);
	}
}

export class TestGlobalStyleSheet extends GlobalStyleSheet {

	public rules: string[] = [];

	constructor() {
		super(null!);
	}

	public override insertRule(selector: string, rule: string): void {
		this.rules.unshift(`${selector} {${rule}}`);
	}

	public override removeRulesContainingSelector(ruleName: string): void {
		for (let i = 0; i < this.rules.length; i++) {
			if (this.rules[i].indexOf(ruleName) >= 0) {
				this.rules.splice(i, 1);
				i--;
			}
		}
	}

	public read(): string {
		return this.rules.join('\n');
	}
}

export class TestCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _instantiationService: IInstantiationService;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(instantiationService: IInstantiationService) {
		this._instantiationService = instantiationService;
	}

	public executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]) as T;
			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}
}
