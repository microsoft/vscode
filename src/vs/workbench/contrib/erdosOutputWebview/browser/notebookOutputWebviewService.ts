/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';
import { ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageWebOutput } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const ERDOS_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID = 'erdosNotebookOutputWebview';

export const IErdosNotebookOutputWebviewService =
	createDecorator<IErdosNotebookOutputWebviewService>(
		ERDOS_NOTEBOOK_OUTPUT_WEBVIEW_SERVICE_ID);

export interface INotebookOutputWebview extends IDisposable {
	readonly id: string;
	readonly sessionId: string;
	readonly webview: IOverlayWebview;
	readonly onDidRender: Event<void>;
}

export interface IErdosNotebookOutputWebviewService {
	readonly _serviceBrand: undefined;

	createNotebookOutputWebview(
		opts: {
			id: string;
			runtime: ILanguageRuntimeSession;
			output: ILanguageRuntimeMessageOutput;
			viewType?: string;
		}
	): Promise<INotebookOutputWebview | undefined>;

	createMultiMessageWebview(opts:
		{
			runtimeId: string;
			preReqMessages: ILanguageRuntimeMessageWebOutput[];
			displayMessage: ILanguageRuntimeMessageWebOutput;
			viewType?: string;
		}): Promise<INotebookOutputWebview | undefined>;
}




