/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessage, ISignService } from 'vs/platform/sign/common/sign';

export interface IVsdaSigner {
	sign(arg: string): string;
}

export interface IVsdaValidator {
	createNewMessage(arg: string): string;
	validate(arg: string): 'ok' | 'error';
	dispose?(): void;
}

export abstract class AbstractSignService implements ISignService {
	declare readonly _serviceBrand: undefined;

	private static _nextId = 1;
	private readonly validators = new Map<string, IVsdaValidator>();

	protected abstract getValidator(): Promise<IVsdaValidator>;
	protected abstract signValue(arg: string): Promise<string>;

	public async createNewMessage(value: string): Promise<IMessage> {
		try {
			const validator = await this.getValidator();
			if (validator) {
				const id = String(AbstractSignService._nextId++);
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
		} finally {
			validator.dispose?.();
		}
	}

	async sign(value: string): Promise<string> {
		try {
			return await this.signValue(value);
		} catch (e) {
			// ignore errors silently
		}
		return value;
	}
}
