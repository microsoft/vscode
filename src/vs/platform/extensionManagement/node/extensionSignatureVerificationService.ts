/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtensionSignatureVerificationService = createDecorator<IExtensionSignatureVerificationService>('IExtensionSignatureVerificationService');

/**
 * A service for verifying signed extensions.
 */
export interface IExtensionSignatureVerificationService {
	readonly _serviceBrand: undefined;

	/**
	 * Verifies an extension file (.vsix) against a signature archive file.
	 * @param { string } vsixFilePath The extension file path.
	 * @param { string } signatureArchiveFilePath The signature archive file path.
	 * @returns { Promise<boolean> } A promise with `true` if the extension is validly signed and trusted;
	 * otherwise, `false` because verification is not enabled (e.g.:  in the OSS version of VS Code).
	 * @throws { ExtensionVerificationError } An error with a code indicating the validity, integrity, or trust issue
	 * found during verification or a more fundamental issue (e.g.:  a required dependency was not found).
	 */
	verify(vsixFilePath: string, signatureArchiveFilePath: string): Promise<boolean>;
}

declare module vsceSign {
	export function verify(vsixFilePath: string, signatureArchiveFilePath: string): Promise<boolean>;
}

/**
 * An error raised during extension signature verification.
 */
export interface ExtensionSignatureVerificationError extends Error {
	readonly code: string;
}

export class ExtensionSignatureVerificationService implements IExtensionSignatureVerificationService {
	declare readonly _serviceBrand: undefined;

	private moduleLoadingPromise: Promise<typeof vsceSign> | undefined;

	private vsceSign(): Promise<typeof vsceSign> {
		if (!this.moduleLoadingPromise) {
			this.moduleLoadingPromise = new Promise(
				(resolve, reject) => require(
					['vsce-sign'],
					async (obj) => {
						const instance = <typeof vsceSign>obj;

						return resolve(instance);
					}, reject));
		}

		return this.moduleLoadingPromise;
	}

	public async verify(vsixFilePath: string, signatureArchiveFilePath: string): Promise<boolean> {
		let module: typeof vsceSign;

		try {
			module = await this.vsceSign();
		} catch (error) {
			return false;
		}

		return module.verify(vsixFilePath, signatureArchiveFilePath);
	}
}
