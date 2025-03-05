/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { filepaths } from '../helpers/filepaths';
import code, { getInstalledExtensions } from './code';

const codeInsidersCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-insiders',
	description: 'Visual Studio Code Insiders',
	options: [
		...(code as Fig.Subcommand).options!,
		{
			name: '--disable-extension',
			description: 'Disable an extension',
			args: {
				name: 'extension-id',
				generators: {
					script: ['code-insiders', '--list-extensions', '--show-versions'],
					postProcess: getInstalledExtensions,
				}
			},
		},
		{
			name: '--uninstall-extension',
			description: 'Uninstalls an extension',
			args: {
				name: 'extension-id',
				generators: {
					script: ['code-insiders', '--list-extensions', '--show-versions'],
					postProcess: getInstalledExtensions,
				}
			},
		},
		{
			name: '--install-extension',
			description:
				`Installs or updates an extension. The argument is either an extension id or a path to a VSIX. The identifier of an extension is '\${ publisher }.\${ name }'. Use '--force' argument to update to latest version. To install a specific version provide '@\${version}'. For example: 'vscode.csharp@1.2.3'`,
			args: {
				name: 'extension-id[@version] | path-to-vsix',
				generators: [
					{
						script: ['code-insiders', '--list-extensions', '--show-versions'],
						postProcess: getInstalledExtensions,
					},
					filepaths({
						extensions: ['vsix'],
					}),
				],
			},
		},
	]
};

export default codeInsidersCompletionSpec;
