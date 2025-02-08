/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../common/errors.js';

export function createTrustedTypesPolicy<Options extends TrustedTypePolicyOptions>(
	policyName: string,
	policyOptions?: Options,
): undefined | Pick<TrustedTypePolicy<Options>, 'name' | Extract<keyof Options, keyof TrustedTypePolicyOptions>> {

	interface IMonacoEnvironment {
		createTrustedTypesPolicy<Options extends TrustedTypePolicyOptions>(
			policyName: string,
			policyOptions?: Options,
		): undefined | Pick<TrustedTypePolicy<Options>, 'name' | Extract<keyof Options, keyof TrustedTypePolicyOptions>>;
	}
	const monacoEnvironment: IMonacoEnvironment | undefined = (globalThis as any).MonacoEnvironment;

	if (monacoEnvironment?.createTrustedTypesPolicy) {
		try {
			return monacoEnvironment.createTrustedTypesPolicy(policyName, policyOptions);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
	try {
		return (globalThis as any).trustedTypes?.createPolicy(policyName, policyOptions);
	} catch (err) {
		onUnexpectedError(err);
		return undefined;
	}
}
