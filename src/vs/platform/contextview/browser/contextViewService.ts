/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextViewService, IContextViewDelegate } from './contextView';
import { ContextView } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';

export class ContextViewService extends Disposable implements IContextViewService {
	_serviceBrand: any;

	private contextView: ContextView;

	constructor(
		@ILayoutService readonly layoutService: ILayoutService
	) {
		super();

		this.contextView = this._register(new ContextView(layoutService.container));
		this.layout();

		this._register(layoutService.onLayout(() => this.layout()));
	}

	// ContextView

	setContainer(container: HTMLElement): void {
		this.contextView.setContainer(container);
	}

	showContextView(delegate: IContextViewDelegate): void {
		this.contextView.show(delegate);
	}

	layout(): void {
		this.contextView.layout();
	}

	hideContextView(data?: any): void {
		this.contextView.hide(data);
	}
}