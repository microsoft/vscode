/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	/**
	 * Namespace for handling credentials.
	 */
	export namespace credentials {

		/**
		 * Read a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise for the secret of the credential.
		 */
		export function readSecret(service: string, account: string): Thenable<string | undefined>;

		/**
		 * Write a secret to the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @param secret The secret of the credential to write to the credential store.
		 * @return A promise indicating completion of the operation.
		 */
		export function writeSecret(service: string, account: string, secret: string): Thenable<void>;

		/**
		 * Delete a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise resolving to true if there was a secret for that service and account.
		 */
		export function deleteSecret(service: string, account: string): Thenable<boolean>;
	}
}
