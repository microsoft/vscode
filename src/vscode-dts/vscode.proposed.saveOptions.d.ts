/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/** Represents options to configure the behavior of saving a {@link TextDocument text document} or a {@link NotebookDocument notebook document}. */
	export interface SaveOptions {
		/**
		 * Instructs the save operation to skip any save participants.
		 */
		skipSaveParticipants?: boolean;
	}

	export interface TextDocument {
		save(options?: SaveOptions): Thenable<boolean>;
	}

	export interface NotebookDocument {
		save(options?: SaveOptions): Thenable<boolean>;
	}
}
