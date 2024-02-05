/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorAction } from 'vs/editor/common/editorCommon';
import { ICommandMetadata } from 'vs/platform/commands/common/commands';
import { ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class InternalEditorAction implements IEditorAction {

	constructor(
		public readonly id: string,
		public readonly label: string,
		public readonly alias: string,
		public readonly metadata: ICommandMetadata | undefined,
		private readonly _precondition: ContextKeyExpression | undefined,
		private readonly _run: (args: unknown) => Promise<void>,
		private readonly _contextKeyService: IContextKeyService
	) { }

	public isSupported(): boolean {
		return this._contextKeyService.contextMatchesRules(this._precondition);
	}

	public run(args: unknown): Promise<void> {
		if (!this.isSupported()) {
			return Promise.resolve(undefined);
		}

		return this._run(args);
	}
}
