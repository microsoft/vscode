/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextViewService, IContextViewDelegate } from './contextView';
import { ContextView } from 'vs/base/browser/ui/contextview/contextview';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILogService } from 'vs/platform/log/common/log';

export class ContextViewService implements IContextViewService {
	public _serviceBrand: any;

	private contextView: ContextView;

	constructor(
		container: HTMLElement,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private logService: ILogService
	) {
		this.contextView = new ContextView(container);
	}

	public dispose(): void {
		this.contextView.dispose();
	}

	// ContextView

	public setContainer(container: HTMLElement): void {
		this.logService.trace('ContextViewService#setContainer');
		this.contextView.setContainer(container);
	}

	public showContextView(delegate: IContextViewDelegate): void {
		this.logService.trace('ContextViewService#showContextView');
		this.contextView.show(delegate);
	}

	public layout(): void {
		this.contextView.layout();
	}

	public hideContextView(data?: any): void {
		this.logService.trace('ContextViewService#hideContextView');
		this.contextView.hide(data);
	}
}