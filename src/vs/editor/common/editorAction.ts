/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorAction } from 'vs/editor/common/editorCommon';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class InternalEditorAction implements IEditorAction {

	public readonly id: string;
	public readonly label: string;
	public readonly alias: string;

	private readonly _precondition: ContextKeyExpr;
	private readonly _run: () => void | TPromise<void>;
	private readonly _contextKeyService: IContextKeyService;

	constructor(
		id: string,
		label: string,
		alias: string,
		precondition: ContextKeyExpr,
		run: () => void,
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

	public run(): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0);
		}

		return TPromise.as(this._run());
	}
}
