/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export default {
	framework: '@storybook/html-vite',
	stories: ['../stories-generated/*.mdx', '../stories-generated/*.stories.js'],
	addons: ['@storybook/addon-docs'],
	core: { disableTelemetry: true },
	features: { sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
	async viteFinal(config) {
		const target = process.env.VSCODE_DESIGN_SYSTEM_API;
		if (!target) {
			throw new Error('Start Storybook with npm run dev so the live source API is available.');
		}
		config.server = {
			...config.server,
			proxy: Object.fromEntries(['/api', '/source', '/codicon.ttf'].map(route => [route, { target, changeOrigin: true }])),
		};
		return config;
	},
};
