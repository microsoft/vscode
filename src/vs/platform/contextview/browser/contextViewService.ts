/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextViewService, IContextViewDelegate } from './contextView';
import { ContextView } from 'vs/base/browser/ui/contextview/contextview';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';

export class ContextViewService extends Disposable implements IContextViewService {
	_serviceBrand: any;

	private contextView: ContextView;

	constructor(
		container: HTMLElement,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.contextView = this._register(new ContextView(container));
	}

	// ContextView

	setContainer(container: HTMLElement): void {
		this.logService.trace('ContextViewService#setContainer');
		this.contextView.setContainer(container);
	}

	showContextView(delegate: IContextViewDelegate): void {
		this.logService.trace('ContextViewService#showContextView');
		this.contextView.show(delegate);
	}

	layout(): void {
		this.contextView.layout();
	}

	hideContextView(data?: any): void {
		this.logService.trace('ContextViewService#hideContextView');
		this.contextView.hide(data);
	}
}