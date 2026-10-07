/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { URI } from '../../../../base/common/uri.js';
import type { IRepositoryPickResult } from '../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';

export const ISessionsPresentation = createDecorator<ISessionsPresentation>('sessionsPresentation');
export type SessionNameKind = 'newGroup' | 'group' | 'session' | 'chat';

/** Entry-owned UI additions. The default leaves the existing workbench presentation unchanged. */
export interface ISessionsPresentation {
	readonly _serviceBrand: undefined;
	readonly sectionRowHeight?: number;
	readonly omitEmptyStateIcon?: boolean;
	readDiffText?(uri: URI): Promise<string>;
	promptForName?(kind: SessionNameKind, value: string): Promise<string | undefined>;
	/** Presents provider-supplied repositories; authentication and repository URL handling stay with the caller. */
	pickRepository?(getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>, token: CancellationToken): Promise<IRepositoryPickResult | undefined>;
	renderNewSessionHeader(container: HTMLElement, before: HTMLElement): IDisposable;
	renderSessionsHeader(container: HTMLElement): IDisposable;
	decorateSessionsList(container: HTMLElement, refresh: () => void, isAtTop: () => boolean): IDisposable;
}

export class DefaultSessionsPresentation implements ISessionsPresentation {
	declare readonly _serviceBrand: undefined;
	renderNewSessionHeader(): IDisposable { return Disposable.None; }
	renderSessionsHeader(): IDisposable { return Disposable.None; }
	decorateSessionsList(): IDisposable { return Disposable.None; }
}

registerSingleton(ISessionsPresentation, DefaultSessionsPresentation, InstantiationType.Delayed);
