/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionsListPresentation, SessionNameKind } from './sessionsListPresentation.js';

export class DefaultSessionsListPresentation implements ISessionsListPresentation {
	declare readonly _serviceBrand: undefined;
	readonly sectionRowHeight = undefined;

	editName(_kind: SessionNameKind, _value: string, editInline: () => boolean): boolean {
		return editInline();
	}

	renderHeader(): IDisposable { return Disposable.None; }
	decorateList(): IDisposable { return Disposable.None; }
}

registerSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
