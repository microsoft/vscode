/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PackageJSONShape {
	isPreRelease?: boolean;
	buildType: 'prod' | 'dev';
	version: string;
	completionsCoreVersion: string;
	build: string;
	publisher: string;
	name: string;
	engines: {
		vscode: string;
	};
	contributes: {
		configuration: {
			title: string;
			id: string;
			properties: {
				[key: string]: {
					default?: any;
					tags?: string[];
				};
			};
		}[];
		languageModelTools: {
			name: string;
			toolReferenceName: string;
			displayName: string;
			modelDescription: string;
			inputSchema: any;
			canBeReferencedInPrompt: boolean;
			tags?: string[];
		}[];
		languageModelToolSets: {
			name: string;
			tools: string[];
		}[];
	};
}

declare const require: any; // TODO@bpasero we need package.json support in web via bundling

export const packageJson: PackageJSONShape = require('../../../../package.json');
export const isProduction = (packageJson.buildType !== 'dev');
export const isPreRelease = (packageJson.isPreRelease || !isProduction);
export const vscodeEngineVersion = packageJson.engines.vscode;
