/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISessionsListPresentation = createDecorator<ISessionsListPresentation>('sessionsListPresentation');
export type SessionNameKind = 'newGroup' | 'group' | 'session' | 'chat';

/** List presentation selected by the entry; session and group mutations remain list-owned. */
export interface ISessionsListPresentation {
	readonly _serviceBrand: undefined;
	readonly sectionRowHeight: number | undefined;
	editName(kind: SessionNameKind, value: string, editInline: () => boolean, accept: (value: string) => void | Promise<void>): boolean;
	renderHeader(container: HTMLElement): IDisposable;
	decorateList(container: HTMLElement, refresh: () => void, isAtTop: () => boolean): IDisposable;
}
