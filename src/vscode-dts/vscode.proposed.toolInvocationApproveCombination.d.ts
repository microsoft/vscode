/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @alexr00 https://github.com/microsoft/vscode/issues/302393

declare module 'vscode' {

	export interface LanguageModelToolConfirmationMessages {
		/**
		 * When set, a button will be shown allowing the user to approve this particular
		 * combination of tool and arguments. The value is shown as the label for the
		 * approval option.
		 *
		 * For example, a tool that reads files could set this to `"Allow reading 'foo.txt'"`,
		 * so that the user can approve that specific file without approving all invocations
		 * of the tool.
		 */
		approveCombination?: string | MarkdownString;
	}
}
