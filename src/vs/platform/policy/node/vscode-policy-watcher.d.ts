/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode-policy-watcher' {
	interface Watcher {
		dispose(): void;
	}

	interface Policies {
		[policyName: string]: {
			type: string
		};
	}

	interface PolicyValues {
		[policyName: string]: string | number | boolean;
	}

	function createWatcher(
		productName: string,
		policies: Policies,
		onDidChange: (update: PolicyValues) => void
	): Watcher;

	namespace createWatcher { }

	export = createWatcher;
}
