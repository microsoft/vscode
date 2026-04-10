/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { IRequestLogger, LoggedRequestKind } from '../../../../platform/requestLogger/node/requestLogger';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';

export class InlineEditLogger extends Disposable {
	private readonly _requests: InlineEditRequestLogContext[] = [];

	constructor(
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
	) {
		super();
	}

	/**
	 * Add a live log entry that appears immediately in the tree with dynamic content.
	 * Content and icon are resolved on-demand from the logContext, and the entry
	 * refreshes automatically as the logContext state changes.
	 */
	addLive(request: InlineEditRequestLogContext): void {
		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: request.getDebugName(),
			icon: () => request.getIcon(),
			startTimeMs: request.time,
			markdownContent: () => request.toLogDocument(),
			onDidChange: request.onDidChange,
			isVisible: () => request.includeInLogTree,
		});
		this._pushRequest(request);
	}

	private _pushRequest(request: InlineEditRequestLogContext): void {
		this._requests.push(request);
		if (this._requests.length > 100) {
			this._requests.shift();
		}
	}

	public getRequestById(requestId: number): InlineEditRequestLogContext | undefined {
		return this._requests.find(request => request.requestId === requestId);
	}
}
