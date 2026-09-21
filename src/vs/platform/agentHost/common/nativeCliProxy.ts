/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export type NativeCliProxyKind = 'claude' | 'codex';

export interface INativeCliProxyModel {
	readonly id: string;
	readonly name: string;
}

/** A local capability for one terminal launch, not an upstream account credential. */
export interface INativeCliProxyConfiguration {
	readonly leaseId: string;
	readonly baseUrl: string;
	readonly token: string;
	readonly model: string;
	readonly models?: readonly INativeCliProxyModel[];
	readonly settingsFile?: string;
}

export const INativeCliProxyService = createDecorator<INativeCliProxyService>('nativeCliProxyService');

/** Local management IPC only; never exposed over AHP or remote-host connections. */
export interface INativeCliProxyService {
	readonly _serviceBrand: undefined;
	/** Tears down every live gateway. Called during host shutdown, before the process is killed. */
	releaseNativeCliResources(): void;
	getNativeCliModels(kind: NativeCliProxyKind): Promise<readonly INativeCliProxyModel[]>;
	startNativeCliProxy(sessionId: string, kind: NativeCliProxyKind, modelId?: string): Promise<INativeCliProxyConfiguration>;
	retainNativeCliProxy(sessionId: string, leaseId: string): Promise<boolean>;
	releaseNativeCliProxy(sessionId: string, leaseId: string): Promise<void>;
}
