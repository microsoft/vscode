/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/193160 @connor4312

declare module 'vscode' {
	export interface TestRunProfile {
		/**
		 * Fired when a user has changed whether this is a default profile. The
		 * event contains the new value of {@link isDefault}
		 */
		onDidChangeDefault: Event<boolean>;
	}
}
