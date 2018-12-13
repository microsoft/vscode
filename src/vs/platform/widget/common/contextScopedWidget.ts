/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService, RawContextKey, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';

export function bindContextScopedWidget(contextKeyService: IContextKeyService, widget: IContextScopedWidget, contextKey: string): void {
	new RawContextKey<IContextScopedWidget>(contextKey, widget).bindTo(contextKeyService);
}

export function createWidgetScopedContextKeyService(contextKeyService: IContextKeyService, widget: IContextScopedWidget): IContextKeyService {
	return contextKeyService.createScoped(widget.target);
}

export function getContextScopedWidget<T extends IContextScopedWidget>(contextKeyService: IContextKeyService, contextKey: string): T | undefined {
	return contextKeyService.getContext(document.activeElement).getValue(contextKey);
}

export interface IContextScopedWidget {

	readonly target: IContextKeyServiceTarget;

}