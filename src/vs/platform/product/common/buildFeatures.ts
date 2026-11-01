/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IBuildFeatures {
	readonly copilotChat: boolean;
	readonly chatPanel: boolean;
	readonly agentSessionsUI: true;
	readonly git: boolean;
	readonly sourceControlUI: boolean;
	readonly scmService: boolean;
	readonly debugUI: boolean;
	readonly debugService: boolean;
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
	// The TypeScript watch pipeline does not run the Vite/build feature injection.
	// Keep Electron development launches aligned with this repository's minimal profile.
	copilotChat: false,
	chatPanel: false,
	agentSessionsUI: true,
	git: false,
	sourceControlUI: false,
	scmService: true,
	debugUI: false,
	debugService: true,
	tasks: false,
	notebooks: false,
	testing: false,
	remote: false,
	extensionsUI: true,
	welcome: false,
	review: false,
	sync: false,
	productServices: false,
	terminal: true,
	agents: { codex: true, claude: true },
};

export const buildFeatures = typeof __VSCODE_BUILD_FEATURES__ === 'undefined'
	? developmentBuildFeatures
	: __VSCODE_BUILD_FEATURES__;
