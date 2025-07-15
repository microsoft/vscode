/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { MainThreadCustomEditors } from './mainThreadCustomEditors.js';
import { MainThreadWebviewPanels } from './mainThreadWebviewPanels.js';
import { MainThreadWebviews } from './mainThreadWebviews.js';
import { MainThreadWebviewsViews } from './mainThreadWebviewViews.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { extHostCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

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
