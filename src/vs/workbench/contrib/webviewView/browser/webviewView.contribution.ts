/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewsExtensions, IViewResolverRegistry } from 'vs/workbench/api/browser/viewsExtensionPoint';
import { IViewDescriptor } from 'vs/workbench/common/views';
import { WebviewViewPane } from 'vs/workbench/contrib/webviewView/browser/webviewViewPane';
import { IWebviewViewService, WebviewViewService } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';

registerSingleton(IWebviewViewService, WebviewViewService, true);

Registry.as<IViewResolverRegistry>(ViewsExtensions.ViewResolverRegistry)
	.register('webview', {
		resolve: (viewDescriptor: IViewDescriptor): IViewDescriptor => {
			return {
				...viewDescriptor,
				ctorDescriptor: new SyncDescriptor(WebviewViewPane)
			};
		}
	});
