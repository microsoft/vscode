/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageRuntimeMetadata, IRuntimeManager, RuntimeState } from '../../languageRuntime/common/languageRuntimeService.js';
import { Event } from '../../../../base/common/event.js';
import { IRuntimeSessionMetadata } from '../../runtimeSession/common/runtimeSessionService.js';

export const IRuntimeStartupService =
	createDecorator<IRuntimeStartupService>('runtimeStartupService');

export interface IRuntimeAutoStartEvent {
	runtime: ILanguageRuntimeMetadata;
	newSession: boolean;
}

export interface ISessionRestoreFailedEvent {
	sessionId: string;
	error: Error;
}

export interface SerializedSessionMetadata {
	sessionName: string;
	metadata: IRuntimeSessionMetadata;
	sessionState: RuntimeState;
	lastUsed: number;
	runtimeMetadata: ILanguageRuntimeMetadata;
	workingDirectory: string;
	localWindowId: string;
}

export interface IRuntimeStartupService {
	readonly _serviceBrand: undefined;

	getPreferredRuntime(languageId: string): ILanguageRuntimeMetadata | undefined;
	hasAffiliatedRuntime(): boolean;
	getAffiliatedRuntimeMetadata(languageId: string): ILanguageRuntimeMetadata | undefined;
	getAffiliatedRuntimes(): Array<ILanguageRuntimeMetadata>;
	clearAffiliatedRuntime(languageId: string): void;
	onWillAutoStartRuntime: Event<IRuntimeAutoStartEvent>;
	completeDiscovery(id: number): void;
	rediscoverAllRuntimes(): Promise<void>;
	getRestoredSessions(): Promise<SerializedSessionMetadata[]>;
	onSessionRestoreFailure: Event<ISessionRestoreFailedEvent>;
	registerRuntimeManager(manager: IRuntimeManager): IDisposable;
}
