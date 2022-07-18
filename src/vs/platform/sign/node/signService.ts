/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessage, ISignService } from 'vs/platform/sign/common/sign';

declare module vsda {
	// the signer is a native module that for historical reasons uses a lower case class name
	// eslint-disable-next-line @typescript-eslint/naming-convention
	export class signer {
		sign(arg: string): string;
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	export class validator {
		createNewMessage(arg: string): string;
		validate(arg: string): 'ok' | 'error';
	}
}

export class SignService implements ISignService {
	declare readonly _serviceBrand: undefined;

	private static _nextId = 1;
	private readonly validators = new Map<string, vsda.validator>();

	private vsda(): Promise<typeof vsda> {
		return new Promise((resolve, reject) => require(['vsda'], resolve, reject));
	}

	async createNewMessage(value: string): Promise<IMessage> {
		try {
			const vsda = await this.vsda();
			const validator = new vsda.validator();
			if (validator) {
				const id = String(SignService._nextId++);
				this.validators.set(id, validator);
				return {
					id: id,
					data: validator.createNewMessage(value)
				};
			}
		} catch (e) {
			// ignore errors silently
		}
		return { id: '', data: value };
	}

	async validate(message: IMessage, value: string): Promise<boolean> {
		if (!message.id) {
			return true;
		}

		const validator = this.validators.get(message.id);
		if (!validator) {
			return false;
		}
		this.validators.delete(message.id);
		try {
			return (validator.validate(value) === 'ok');
		} catch (e) {
			// ignore errors silently
			return false;
		}
	}

	async sign(value: string): Promise<string> {
		try {
			const vsda = await this.vsda();
			const signer = new vsda.signer();
			if (signer) {
				return signer.sign(value);
			}
		} catch (e) {
			// ignore errors silently
		}
		return value;
	}
}
