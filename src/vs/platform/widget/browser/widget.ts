/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export function createWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IWidget, contextKey: string): IContextKeyService {
	const result = contextKeyService.createScoped(widget.element);
	const widgetContext = new RawContextKey<IWidget>(contextKey, widget);
	widgetContext.bindTo(result);
	return result;
}

export interface IWidget {

	readonly element: HTMLElement;

}