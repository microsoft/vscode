/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorAction } from 'vs/editor/common/editorCommon';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class InternalEditorAction implements IEditorAction {

	public readonly id: string;
	public readonly label: string;
	public readonly alias: string;

	private readonly _precondition: ContextKeyExpr | null;
	private readonly _run: () => Promise<void>;
	private readonly _contextKeyService: IContextKeyService;

	constructor(
		id: string,
		label: string,
		alias: string,
		precondition: ContextKeyExpr | null,
		run: () => Promise<void>,
		contextKeyService: IContextKeyService
	) {
		this.id = id;
		this.label = label;
		this.alias = alias;
		this._precondition = precondition;
		this._run = run;
		this._contextKeyService = contextKeyService;
	}

	public isSupported(): boolean {
		return this._contextKeyService.contextMatchesRules(this._precondition);
	}

	public run(): Promise<void> {
		if (!this.isSupported()) {
			return Promise.resolve(undefined);
		}

		const r = this._run();
		return r ? r : Promise.resolve(undefined);
	}
}
