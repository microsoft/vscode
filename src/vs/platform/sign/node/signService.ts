/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractSignService, IVsdaValidator } from 'vs/platform/sign/common/abstractSignService';
import { ISignService } from 'vs/platform/sign/common/sign';

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

export class SignService extends AbstractSignService implements ISignService {
	protected override getValidator(): Promise<IVsdaValidator> {
		return this.vsda().then(vsda => new vsda.validator());
	}
	protected override signValue(arg: string): Promise<string> {
		return this.vsda().then(vsda => new vsda.signer().sign(arg));
	}

	private async vsda(): Promise<typeof vsda> {
		// ESM-uncomment-begin
		// const mod = 'vsda';
		// const { default: vsda } = await import(mod);
		// return vsda;
		// ESM-uncomment-end

		// ESM-comment-begin
		const { importAMDNodeModule } = await import('vs/amdX');
		return importAMDNodeModule('vsda', 'index.js');
		// ESM-comment-end
	}
}
