/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractSignService, IVsdaValidator } from '../common/abstractSignService.js';
import { ISignService } from '../common/sign.js';

export class SignService extends AbstractSignService implements ISignService {
	protected override getValidator(): Promise<IVsdaValidator> {
		return this.vsda().then(vsda => new vsda.validator());
	}
	protected override signValue(arg: string): Promise<string> {
		return this.vsda().then(vsda => new vsda.signer().sign(arg));
	}

	private async vsda(): Promise<typeof vsda> {
		const mod = 'vsda';
		const { default: vsda } = await import(mod);
		return vsda;
	}
}
