/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';
import { IWebviewService } from './webview.js';
import { WebviewElement } from './webviewElement.js';

/**
 * Blocks an unattended restart while a webview that retains its context is loaded, for example
 * the Simple Browser, the video player or an MCP app: webviews retain their context when their
 * state can't be saved and restored. Their element is only created once they are first shown.
 */
export class WebviewUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.webviewUnattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@IWebviewService webviewService: IWebviewService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => Iterable.some(webviewService.webviews, webview => webview instanceof WebviewElement && !!webview.options.retainContextWhenHidden) ? 'webview.retainedContext' : undefined
		}));
	}
}
