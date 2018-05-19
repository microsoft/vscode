/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IModelDecorationOptions } from 'vs/editor/common/model';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { AbstractCodeEditorService } from 'vs/editor/browser/services/abstractCodeEditorService';
import { ICommandService, ICommandEvent, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';

export class TestCodeEditorService extends AbstractCodeEditorService {
	public registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void { }
	public removeDecorationType(key: string): void { }
	public resolveDecorationOptions(decorationTypeKey: string, writable: boolean): IModelDecorationOptions { return null; }
}

export class TestCommandService implements ICommandService {
	_serviceBrand: any;

	private readonly _instantiationService: IInstantiationService;

	private readonly _onWillExecuteCommand: Emitter<ICommandEvent> = new Emitter<ICommandEvent>();
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;

	constructor(instantiationService: IInstantiationService) {
		this._instantiationService = instantiationService;
	}

	public executeCommand<T>(id: string, ...args: any[]): TPromise<T> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return TPromise.wrapError<T>(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler].concat(args));
			return TPromise.as(result);
		} catch (err) {
			return TPromise.wrapError<T>(err);
		}
	}
}
