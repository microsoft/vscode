/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineFixture, defineFixtureGroup } from '@vscode/component-explorer';


export default defineFixtureGroup({ path: 'workbench/' }, {
	Workbench: defineFixture({
		isolation: 'iframe',
		//labels: { kind: 'screenshot' },
		render: async (container, context) => {
			container.style.width = '1500px';
			container.style.height = '700px';

			console.log('loading');
			try {
				// Setup document head and body
				const doc = container.ownerDocument;
				const head = doc.createElement('head');
				const meta1 = doc.createElement('meta');
				meta1.setAttribute('charset', 'utf-8');
				head.appendChild(meta1);

				const meta2 = doc.createElement('meta');
				meta2.id = 'vscode-workbench-web-configuration';
				meta2.setAttribute('data-settings', '{"workspaceUri":{"$mid":1,"path":"/default.code-workspace","scheme":"tmp"},"productConfiguration":{"enableTelemetry":false,"extensionsGallery":{"nlsBaseUrl":"https://www.vscode-unpkg.net/_lp/","serviceUrl":"https://marketplace.visualstudio.com/_apis/public/gallery","searchUrl":"https://marketplace.visualstudio.com/_apis/public/gallery/searchrelevancy/extensionquery","servicePPEUrl":"https://marketplace.vsallin.net/_apis/public/gallery","cacheUrl":"https://vscode.blob.core.windows.net/gallery/index","itemUrl":"https://marketplace.visualstudio.com/items","publisherUrl":"https://marketplace.visualstudio.com/publishers","resourceUrlTemplate":"https://{publisher}.vscode-unpkg.net/{publisher}/{name}/{version}/{path}","controlUrl":"https://az764295.vo.msecnd.net/extensions/marketplace.json"},"configurationSync.store":{"url":"https://vscode-sync-insiders.trafficmanager.net/","stableUrl":"https://vscode-sync.trafficmanager.net/","insidersUrl":"https://vscode-sync-insiders.trafficmanager.net/","canSwitch":true,"authenticationProviders":{"github":{"scopes":["user:email"]},"microsoft":{"scopes":["openid","profile","email","offline_access"]}}},"enableSyncingProfiles":true,"editSessions.store":{"url":"https://vscode-sync.trafficmanager.net/","authenticationProviders":{"microsoft":{"scopes":["openid","profile","email","offline_access"]},"github":{"scopes":["user:email"]}}},"linkProtectionTrustedDomains":["https://*.visualstudio.com","https://*.microsoft.com","https://aka.ms","https://*.gallerycdn.vsassets.io","https://*.github.com","https://login.microsoftonline.com","https://*.vscode.dev","https://*.github.dev","https://gh.io"],"trustedExtensionAuthAccess":["vscode.git","vscode.github","ms-vscode.remote-repositories","github.remotehub","ms-vscode.azure-repos","ms-vscode.remote-server","github.vscode-pull-request-github","github.codespaces","ms-vsliveshare.vsliveshare","github.copilot","github.copilot-chat"],"webEndpointUrlTemplate":"http://{{uuid}}.localhost:8080/static/sources","webviewContentExternalBaseUrlTemplate":"http://{{uuid}}.localhost:8080/static/sources/out/vs/workbench/contrib/webview/browser/pre/"}}');
				head.appendChild(meta2);

				const meta3 = doc.createElement('meta');
				meta3.id = 'vscode-workbench-builtin-extensions';
				meta3.setAttribute('data-settings', '{{WORKBENCH_BUILTIN_EXTENSIONS}}');
				head.appendChild(meta3);

				const body = doc.createElement('body');
				body.setAttribute('aria-label', '');

				if (doc.documentElement) {
					doc.documentElement.appendChild(head);
					doc.documentElement.appendChild(body);
				}

				globalThis._VSCODE_FILE_ROOT = 'http://localhost:5199/out/';

				await import('../../../../../../build/vite/index-workbench.js');
			} catch (err) {
				console.error('Error loading workbench:', err);
				container.textContent = 'Failed to load workbench. See console for details.';
				return;
			}
			container.style.width = '1500px';
			container.style.height = '700px';
			console.log('rendering');
		},
	}),
});
