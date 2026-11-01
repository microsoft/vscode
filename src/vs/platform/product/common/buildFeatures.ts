/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IBuildFeatures {
	readonly copilotChat: boolean;
	readonly agentSessionsUI: true;
	readonly git: boolean;
	readonly scm: boolean;
	readonly debug: boolean;
	readonly tasks: boolean;
	readonly notebooks: boolean;
	readonly testing: boolean;
	readonly remote: boolean;
	readonly extensionsUI: boolean;
	readonly welcome: boolean;
	readonly review: boolean;
	readonly sync: boolean;
	readonly productServices: boolean;
	readonly terminal: true;
	readonly agents: { readonly codex: boolean; readonly claude: boolean };
}

declare const __VSCODE_BUILD_FEATURES__: IBuildFeatures;

const developmentBuildFeatures: IBuildFeatures = {
	copilotChat: true,
	agentSessionsUI: true,
	git: true,
	scm: true,
	debug: true,
	tasks: true,
	notebooks: true,
	testing: true,
	remote: true,
	extensionsUI: true,
	welcome: true,
	review: true,
	sync: true,
	productServices: true,
	terminal: true,
	agents: { codex: true, claude: true },
};

export const buildFeatures = typeof __VSCODE_BUILD_FEATURES__ === 'undefined'
	? developmentBuildFeatures
	: __VSCODE_BUILD_FEATURES__;
