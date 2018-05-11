/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import * as dom from 'vs/base/browser/dom';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { localize } from 'vs/nls';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

namespace schema {

	export interface IUserFriendlyWebviewDescriptor {
		viewType: string;
		icon?: {
			light: string;
			dark: string;
		};
	}

	export function isValidViewDescriptors(viewDescriptors: IUserFriendlyWebviewDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(viewDescriptors)) {
			collector.error(localize('requirearray', "views must be an array"));
			return false;
		}

		for (let descriptor of viewDescriptors) {
			if (typeof descriptor.viewType !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'viewType'));
				return false;
			}

			if (descriptor.icon) {
				if (typeof descriptor.icon.dark !== 'string') {
					collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'icon.dark'));
					return false;
				}
				if (typeof descriptor.icon.light !== 'string') {
					collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'icon.light'));
					return false;
				}
			}
		}

		return true;
	}

	const webviewDescriptor: IJSONSchema = {
		type: 'object',
		properties: {
			viewType: {
				description: localize('vscode.extension.contributes.webview.viewType', 'The unique identifier of the view.'),
				type: 'string'
			},
			icon: {
				type: 'object',
				properties: {
					light: {
						type: 'string'
					},
					dark: {
						type: 'string'
					}
				}
			}
		}
	};

	export const webviewsContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.webviews', "Contributes webviews to the editor"),
		type: 'array',
		items: webviewDescriptor,
		default: []
	};
}


ExtensionsRegistry.registerExtensionPoint<schema.IUserFriendlyWebviewDescriptor[]>('webviews', [], schema.webviewsContribution)
	.setHandler((extensions) => {
		for (let extension of extensions) {
			const { value, collector } = extension;

			if (!schema.isValidViewDescriptors(value, collector)) {
				return;
			}

			const viewIds: string[] = [];
			const viewDescriptors: IWebviewDescriptor[] = value.map(item => {
				const viewDescriptor = <IWebviewDescriptor>{
					viewType: item.viewType,
					icon: item.icon ? {
						light: join(extension.description.extensionFolderPath, item.icon.light),
						dark: join(extension.description.extensionFolderPath, item.icon.dark),
					} : undefined
				};

				// validate
				if (viewIds.indexOf(viewDescriptor.viewType) !== -1) {
					collector.error(localize('duplicateView1', "Cannot register multiple webview with same viewtype `{0}`", viewDescriptor.viewType));
					return null;
				}
				// if (registeredViews.some(v => v.id === viewDescriptor.id)) {
				// 	collector.error(localize('duplicateView2', "A view with id `{0}` is already registered in the location `{1}`", viewDescriptor.id, viewDescriptor.location.id));
				// 	return null;
				// }

				viewIds.push(viewDescriptor.viewType);
				return viewDescriptor;
			});

			WebviewsRegistry.registerViews(viewDescriptors);
		}
	});

export interface IWebviewDescriptor {
	viewType: string;
	icon?: {
		light: string;
		dark: string;
	};
}

export const WebviewsRegistry = new class {
	readonly _webviews = new Map<string, IWebviewDescriptor>();
	_styleElement: HTMLStyleElement;

	constructor() {
		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'webview-icons';
	}

	public get(viewType: string): IWebviewDescriptor | undefined {
		return this._webviews.get(viewType);
	}

	public registerViews(views: IWebviewDescriptor[]) {
		const cssRules: string[] = [];
		for (const view of views) {
			this._webviews.set(view.viewType, view);
			if (view.icon) {
				cssRules.push(`.show-file-icons .${escapeCSS(view.viewType)}-name-file-icon::before { background-image: url(${view.icon.light}); }`);
			}
		}
		this._styleElement.innerHTML += cssRules.join('\n');
	}
};

function escapeCSS(str: string) {
	return window['CSS'].escape(str);
}
