/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ILanguageRuntimeMetadata, RuntimeState, ILanguageRuntimeClientCreatedEvent, LanguageRuntimeSessionMode } from './languageRuntimeService.js';

export interface ILanguageRuntimeSession extends IDisposable {
	readonly sessionId: string;
	readonly runtimeMetadata: ILanguageRuntimeMetadata;
	readonly metadata: {
		sessionMode: LanguageRuntimeSessionMode;
	};

	onDidChangeRuntimeState?: Event<void>;
	onDidCreateClientInstance?: Event<ILanguageRuntimeClientCreatedEvent>;
	getRuntimeState?(): RuntimeState;
	listClients?(): Promise<any[]>;
}
