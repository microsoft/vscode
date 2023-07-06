/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface ICSSPluginConfig {
	disabled?: boolean;
}

/**
 * Invoked by the loader at run-time
 *
 * @skipMangle
 */
export function load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
	config = config || {};
	const cssConfig = <ICSSPluginConfig>(config['vs/css'] || {});

	if (cssConfig.disabled) {
		// the plugin is asked to not create any style sheets
		load({});
		return;
	}

	const cssUrl = req.toUrl(name + '.css');
	loadCSS(name, cssUrl, () => {
		load({});
	}, (err: any) => {
		if (typeof load.error === 'function') {
			load.error('Could not find ' + cssUrl + '.');
		}
	});
}

function loadCSS(name: string, cssUrl: string, callback: () => void, errorback: (err: any) => void): void {
	if (linkTagExists(name, cssUrl)) {
		callback();
		return;
	}
	createLinkTag(name, cssUrl, callback, errorback);
}

function linkTagExists(name: string, cssUrl: string): boolean {
	const links = document.getElementsByTagName('link');
	for (let i = 0, len = links.length; i < len; i++) {
		const nameAttr = links[i].getAttribute('data-name');
		const hrefAttr = links[i].getAttribute('href');
		if (nameAttr === name || hrefAttr === cssUrl) {
			return true;
		}
	}
	return false;
}

function createLinkTag(name: string, cssUrl: string, callback: () => void, errorback: (err: any) => void): void {
	const linkNode = document.createElement('link');
	linkNode.setAttribute('rel', 'stylesheet');
	linkNode.setAttribute('type', 'text/css');
	linkNode.setAttribute('data-name', name);

	attachListeners(name, linkNode, callback, errorback);
	linkNode.setAttribute('href', cssUrl);

	const head = document.head || document.getElementsByTagName('head')[0];
	head.appendChild(linkNode);
}

function attachListeners(name: string, linkNode: HTMLLinkElement, callback: () => void, errorback: (err: any) => void): void {
	const unbind = () => {
		linkNode.removeEventListener('load', loadEventListener);
		linkNode.removeEventListener('error', errorEventListener);
	};
	const loadEventListener = (e: any) => {
		unbind();
		callback();
	};
	const errorEventListener = (e: any) => {
		unbind();
		errorback(e);
	};
	linkNode.addEventListener('load', loadEventListener);
	linkNode.addEventListener('error', errorEventListener);
}
