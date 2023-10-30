/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/46726

	export interface IssueUriRequestHandler {
		/**
		 *Handle the request by the issue reporter for the Uri you want to direct the user to.
		 */
		handleIssueUrlRequest(): ProviderResult<Uri>;
	}

	export interface IssueDataProvider {
		/**
		 * Provide the data to be used in the issue reporter.
		 */
		provideIssueData(token: CancellationToken): ProviderResult<string>;

		/**
		 * Provide the template to be used in the description of issue reporter.
		 */
		provideIssueTemplate(token: CancellationToken): ProviderResult<string>;
	}

	export namespace env {
		/**
		 * Register an {@link IssueUriRequestHandler}. By registering an issue uri request handler,
		 * you can direct the built-in issue reporter to your issue reporting web experience of choice.
		 * The Uri that the handler returns will be opened in the user's browser.
		 *
		 * Examples of this include:
		 * - Using GitHub Issue Forms or GitHub Discussions you can pre-fill the issue creation with relevant information from the current workspace using query parameters
		 * - Directing to a different web form that isn't on GitHub for reporting issues
		 *
		 * @param handler the issue uri request handler to register for this extension.
		 */
		export function registerIssueUriRequestHandler(handler: IssueUriRequestHandler): Disposable;

		/**
		 * Register an {@link IssueDataProvider}. By registering an issue data provider,
		 * you can provide additional information to the built-in issue reporter.
		 * The repo url must be provided by package.json's repository field.
		 *
		 * Examples:
		 * - Provide additional information about the current workspace, current extension, current user, or OS
		 * - Provide data in the form of a string to the secondary description/data text box of the issue reporter.
		 * - Provide a template for the description of the issue reporter
		 *
		 * @param provider the issue data provider to register for this extension.
		 */
		export function registerIssueDataProvider(provider: IssueDataProvider): Disposable;
	}
}
