/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../common/errors.js';
import { getMonacoEnvironment } from './browser.js';

type TrustedTypePolicyOptions = import('trusted-types/lib/index.d.ts').TrustedTypePolicyOptions;
type TrustedTypePolicyFactory = import('trusted-types/lib/index.d.ts').TrustedTypePolicyFactory;
type TrustedTypesGlobal = typeof globalThis & { trustedTypes?: TrustedTypePolicyFactory };

export function createTrustedTypesPolicy<Options extends TrustedTypePolicyOptions>(
	policyName: string,
	policyOptions?: Options,
): undefined | Pick<TrustedTypePolicy, 'name' | Extract<keyof Options, keyof TrustedTypePolicyOptions>> {

	const monacoEnvironment = getMonacoEnvironment();

	if (monacoEnvironment?.createTrustedTypesPolicy) {
		try {
			return monacoEnvironment.createTrustedTypesPolicy(policyName, policyOptions);
		} catch (err) {
			onUnexpectedError(err);
			return undefined;
		}
	}
	try {
		return (globalThis as TrustedTypesGlobal).trustedTypes?.createPolicy(policyName, policyOptions);
	} catch (err) {
		onUnexpectedError(err);
		return undefined;
	}
}
