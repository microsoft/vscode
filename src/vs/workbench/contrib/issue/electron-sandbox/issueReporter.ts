/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(async function () {

	type IBootstrapWindow = import('vs/platform/window/electron-sandbox/window.js').IBootstrapWindow;
	type IIssueReporterMain = import('vs/workbench/contrib/issue/electron-sandbox/issueReporterMain').IIssueReporterMain;
	type OldIssueReporterWindowConfiguration = import('vs/platform/issue/common/issue.js').OldIssueReporterWindowConfiguration;

	const bootstrapWindow: IBootstrapWindow = (window as any).MonacoBootstrapWindow; // defined by bootstrap-window.ts

	const { result, configuration } = await bootstrapWindow.load<IIssueReporterMain, OldIssueReporterWindowConfiguration>('vs/workbench/contrib/issue/electron-sandbox/issueReporterMain', {
		configureDeveloperSettings: function () {
			return {
				forceEnableDeveloperKeybindings: true,
				disallowReloadKeybinding: true
			};
		}
	});

	result.startup(configuration);
}());
