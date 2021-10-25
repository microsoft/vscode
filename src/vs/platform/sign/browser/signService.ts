/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessage, ISignService } from 'vs/platform/sign/common/sign';

export class SignService implements ISignService {

	declare readonly _serviceBrand: undefined;

	private readonly _tkn: string | null;

	constructor(token: string | undefined) {
		this._tkn = token || null;
	}

	async createNewMessage(value: string): Promise<IMessage> {
		return { id: '', data: value };
	}
	async validate(message: IMessage, value: string): Promise<boolean> {
		return true;
	}
	async sign(value: string): Promise<string> {
		return this._tkn || '';
	}
}
