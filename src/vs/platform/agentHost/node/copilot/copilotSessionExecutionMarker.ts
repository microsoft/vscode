/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { ILogService } from '../../../log/common/log.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';

export const COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY = 'copilot.awaitingFirstSdkOperation';

interface IDeferredCopilotSdkExecution {
	readonly sdkSessionId: string;
	readonly startTime: number;
	readonly modifiedTime: number;
}

function isDeferredCopilotSdkExecution(value: unknown): value is IDeferredCopilotSdkExecution {
	if (!isRecord(value)) {
		return false;
	}
	return typeof value.sdkSessionId === 'string'
		&& typeof value.startTime === 'number'
		&& Number.isFinite(value.startTime)
		&& typeof value.modifiedTime === 'number'
		&& Number.isFinite(value.modifiedTime);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseDeferredCopilotSdkExecution(value: string, session: URI, logService: ILogService): IDeferredCopilotSdkExecution | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (isDeferredCopilotSdkExecution(parsed)) {
			return parsed;
		}
		logService.warn(`[Copilot] Ignoring malformed deferred SDK execution marker for ${session.toString()}`);
		return undefined;
	} catch (error) {
		logService.warn(`[Copilot] Ignoring malformed deferred SDK execution marker for ${session.toString()}`, error);
		return undefined;
	}
}

export async function getDeferredCopilotSdkExecution(sessionDataService: ISessionDataService, session: URI, sdkSessionId: string, logService: ILogService): Promise<IDeferredCopilotSdkExecution | undefined> {
	const dbRef = await sessionDataService.tryOpenDatabase(session);
	if (!dbRef) {
		return undefined;
	}
	try {
		const value = await dbRef.object.getMetadata(COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY);
		if (!value) {
			return undefined;
		}
		const parsed = parseDeferredCopilotSdkExecution(value, session, logService);
		return parsed?.sdkSessionId === sdkSessionId ? parsed : undefined;
	} finally {
		dbRef.dispose();
	}
}

export async function deferCopilotSdkExecution(sessionDataService: ISessionDataService, session: URI, sdkSessionId: string, logService: ILogService): Promise<void> {
	const dbRef = sessionDataService.openDatabase(session);
	try {
		const existing = await dbRef.object.getMetadata(COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY);
		const existingMarker = existing ? parseDeferredCopilotSdkExecution(existing, session, logService) : undefined;
		const timestamp = Date.now();
		await dbRef.object.setMetadata(COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY, JSON.stringify({
			sdkSessionId,
			startTime: existingMarker?.sdkSessionId === sdkSessionId ? existingMarker.startTime : timestamp,
			modifiedTime: timestamp,
		}));
	} finally {
		dbRef.dispose();
	}
}

export async function allowCopilotSdkExecution(sessionDataService: ISessionDataService, session: URI, sdkSessionId: string, logService: ILogService): Promise<string | undefined> {
	const dbRef = sessionDataService.openDatabase(session);
	try {
		const value = await dbRef.object.getMetadata(COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY);
		if (!value) {
			return;
		}
		const marker = parseDeferredCopilotSdkExecution(value, session, logService);
		if (marker?.sdkSessionId === sdkSessionId) {
			await dbRef.object.deleteMetadata([COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY]);
			return value;
		}
		return undefined;
	} finally {
		dbRef.dispose();
	}
}

export async function restoreDeferredCopilotSdkExecution(sessionDataService: ISessionDataService, session: URI, marker: string): Promise<void> {
	const dbRef = sessionDataService.openDatabase(session);
	try {
		await dbRef.object.setMetadata(COPILOT_DEFERRED_SDK_EXECUTION_METADATA_KEY, marker);
	} finally {
		dbRef.dispose();
	}
}
