/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commonOptions, extensionManagementOptions, troubleshootingOptions, tunnelOptions } from './code';
import codeTunnelCompletionSpec from './code-tunnel';

const codeTunnelInsidersCompletionSpec: Fig.Spec = {
	...codeTunnelCompletionSpec,
	name: 'code-tunnel-insiders',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere, with insider features.',
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel-insiders'),
		...troubleshootingOptions('code-tunnel-insiders'),
		...tunnelOptions
	]
};

export default codeTunnelInsidersCompletionSpec;
