/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MainThreadCustomEditors } from 'vs/workbench/api/browser/mainThreadCustomEditors';
import { MainThreadWebviewPanels } from 'vs/workbench/api/browser/mainThreadWebviewPanels';
import { MainThreadWebviews } from 'vs/workbench/api/browser/mainThreadWebviews';
import { MainThreadWebviewsViews } from 'vs/workbench/api/browser/mainThreadWebviewViews';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { extHostCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers';

@extHostCustomer
export class MainThreadWebviewManager extends Disposable {
	constructor(
		context: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const webviews = this._register(instantiationService.createInstance(MainThreadWebviews, context));
		context.set(extHostProtocol.MainContext.MainThreadWebviews, webviews);

		const webviewPanels = this._register(instantiationService.createInstance(MainThreadWebviewPanels, context, webviews));
		context.set(extHostProtocol.MainContext.MainThreadWebviewPanels, webviewPanels);

		const customEditors = this._register(instantiationService.createInstance(MainThreadCustomEditors, context, webviews, webviewPanels));
		context.set(extHostProtocol.MainContext.MainThreadCustomEditors, customEditors);

		const webviewViews = this._register(instantiationService.createInstance(MainThreadWebviewsViews, context, webviews));
		context.set(extHostProtocol.MainContext.MainThreadWebviewViews, webviewViews);
	}
}
