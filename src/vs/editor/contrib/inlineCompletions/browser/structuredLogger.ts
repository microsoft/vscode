/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

export interface IRecordableLogEntry {
	sourceId: string;
	time: number;
}

export interface IRecordableEditorLogEntry extends IRecordableLogEntry {
	modelUri: string;
	modelVersion: number;
}

/**
 * The sourceLabel must not contain '@'!
*/
export function formatRecordableLogEntry<T extends IRecordableLogEntry>(entry: T): string {
	return entry.sourceId + ' @@ ' + JSON.stringify({ ...entry, sourceId: undefined });
}

export class StructuredLogger<T extends IRecordableLogEntry> extends Disposable {
	public static cast<T extends IRecordableLogEntry>(): typeof StructuredLogger<T> {
		return this as typeof StructuredLogger<T>;
	}

	public readonly isEnabled;
	private readonly _contextKeyValue;

	constructor(
		private readonly _contextKey: string,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		super();
		this._contextKeyValue = observableContextKey<string>(this._contextKey, this._contextKeyService).recomputeInitiallyAndOnChange(this._store);
		this.isEnabled = this._contextKeyValue.map(v => v !== undefined);
	}

	public log(data: T): boolean {
		const commandId = this._contextKeyValue.get();
		if (!commandId) {
			return false;
		}
		this._commandService.executeCommand(commandId, data);
		return true;
	}
}

function observableContextKey<T>(key: string, contextKeyService: IContextKeyService): IObservable<T | undefined> {
	return observableFromEvent(contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue<T>(key));
}
