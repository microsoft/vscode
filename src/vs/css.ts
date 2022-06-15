/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

namespace CSSLoaderPlugin {

	interface ICSSPluginConfig {
		disabled?: boolean;
	}

	class BrowserCSSLoader {

		public load(name: string, cssUrl: string, callback: () => void, errorback: (err: any) => void): void {
			if (this._linkTagExists(name, cssUrl)) {
				callback();
				return;
			}
			this._createLinkTag(name, cssUrl, callback, errorback);
		}

		private _linkTagExists(name: string, cssUrl: string): boolean {
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

		private _createLinkTag(name: string, cssUrl: string, callback: () => void, errorback: (err: any) => void): void {
			const linkNode = document.createElement('link');
			linkNode.setAttribute('rel', 'stylesheet');
			linkNode.setAttribute('type', 'text/css');
			linkNode.setAttribute('data-name', name);

			this._attachListeners(name, linkNode, callback, errorback);
			linkNode.setAttribute('href', cssUrl);

			const head = document.head || document.getElementsByTagName('head')[0];
			head.appendChild(linkNode);
		}

		private _attachListeners(name: string, linkNode: HTMLLinkElement, callback: () => void, errorback: (err: any) => void): void {
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
	}

	export class CSSPlugin implements AMDLoader.ILoaderPlugin {

		private _cssLoader = new BrowserCSSLoader();

		public load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
			config = config || {};
			const cssConfig = <ICSSPluginConfig>(config['vs/css'] || {});

			if (cssConfig.disabled) {
				// the plugin is asked to not create any style sheets
				load({});
				return;
			}

			const cssUrl = req.toUrl(name + '.css');
			this._cssLoader.load(name, cssUrl, () => {
				load({});
			}, (err: any) => {
				if (typeof load.error === 'function') {
					load.error('Could not find ' + cssUrl + '.');
				}
			});
		}
	}

	define('vs/css', new CSSPlugin());
}
