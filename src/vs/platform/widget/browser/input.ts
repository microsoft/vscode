/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { HistoryInputBox, IHistoryInputOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { FindInput, IFindInputOptions } from 'vs/base/browser/ui/findinput/findInput';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { createWidgetScopedContextKeyService, IWidget } from 'vs/platform/widget/browser/widget';

export const HistoryInputBoxContext = 'historyInputBox';

export class ContextScopedHistoryInputBox extends HistoryInputBox implements IWidget {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IHistoryInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createWidgetScopedContextKeyService(contextKeyService, this, HistoryInputBoxContext));
	}
}

export class ContextScopedFindInput extends FindInput {

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider, options: IFindInputOptions,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(container, contextViewProvider, options);
		this._register(createWidgetScopedContextKeyService(contextKeyService, this.inputBox, HistoryInputBoxContext));
	}

}