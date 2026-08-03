/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { stringHash } from '../../../base/common/hash.js';
import { IOffsetEdit } from './diffComputeService.js';
import { ToolResultFileEditContent } from './state/sessionState.js';
import { URI } from '../../../base/common/uri.js';
import { EditTelemetryTrigger } from '../../telemetry/common/editTelemetry.js';

export const FILE_EDIT_ATTRIBUTION_PROPERTY = '_vscodeEditAttribution';
// Workbench edit-source tracking reports a coverage gap when Agent Host attribution exceeds this cap.
export const MAX_EDIT_ATTRIBUTION_FILE_SIZE = 5 * 1024 * 1024;
const EDIT_ATTRIBUTION_RESOURCE_SCHEME = 'agent-edit-attribution';

interface IFileEditAttributionMarkerBase {
	readonly version: 1;
	readonly editId: string;
	readonly sequence: number;
}

export interface ITrackedFileEditAttributionMarker extends IFileEditAttributionMarkerBase {
	readonly status?: 'tracked';
	readonly beforeDigest: string;
	readonly afterDigest: string;
}

export interface ISkippedFileEditAttributionMarker extends IFileEditAttributionMarkerBase {
	readonly status: 'skipped';
	readonly reason: 'fileTooLarge';
	readonly insertedCount: number;
}

export type IFileEditAttributionMarker = ITrackedFileEditAttributionMarker | ISkippedFileEditAttributionMarker;

export type AttributedToolResultFileEditContent = ToolResultFileEditContent & {
	readonly [FILE_EDIT_ATTRIBUTION_PROPERTY]: IFileEditAttributionMarker;
};

export interface IAgentEditAttribution {
	readonly sessionUri: string;
	readonly turnId: string;
	readonly toolCallId: string;
	readonly filePath: string;
	readonly beforeText: string;
	readonly afterText: string;
	readonly changes: readonly IOffsetEdit[];
	readonly modelId: string | undefined;
	readonly toolName: string;
}

export const IAgentEditAttributionService = createDecorator<IAgentEditAttributionService>('agentEditAttributionService');

export interface IAgentEditAttributionService {
	readonly _serviceBrand: undefined;
	/** Disabling attribution is permanent for the lifetime of the service. */
	setEnabled(enabled: boolean): void;
	recordEdit(edit: IAgentEditAttribution): Promise<IFileEditAttributionMarker | undefined>;
	flushSession(sessionUri: string): Promise<void>;
	prepareFlush(params: IPrepareEditAttributionFlushParams): Promise<IPreparedEditAttributionFlush | undefined>;
	commitFlush(params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult>;
	cancelFlush(params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult>;
}

export class NullAgentEditAttributionService implements IAgentEditAttributionService {
	declare readonly _serviceBrand: undefined;

	setEnabled(_enabled: boolean): void { }

	async recordEdit(_edit: IAgentEditAttribution): Promise<IFileEditAttributionMarker | undefined> {
		return undefined;
	}

	async flushSession(_sessionUri: string): Promise<void> { }
	async prepareFlush(_params: IPrepareEditAttributionFlushParams): Promise<IPreparedEditAttributionFlush | undefined> { return undefined; }
	async commitFlush(_params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult> { return { outcome: 'missing', agentModifiedCount: 0 }; }
	async cancelFlush(_params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult> { return { outcome: 'missing', agentModifiedCount: 0 }; }
}

export interface IPrepareEditAttributionFlushParams {
	readonly resource: URI;
	readonly trigger: EditTelemetryTrigger;
	readonly statsUuid: string;
	readonly isDirty: boolean;
	readonly flushToken: string;
	readonly languageId: string;
}

export interface IPreparedEditAttributionFlush {
	readonly flushToken: string;
	readonly agentModifiedCount: number;
	readonly lastSequence?: number;
}

export interface ICommitEditAttributionFlushParams {
	readonly flushToken: string;
	readonly totalModifiedCount: number;
}

export interface ICancelEditAttributionFlushParams {
	readonly flushToken: string;
}

export type EditAttributionFlushOutcome = 'committed' | 'cancelled' | 'missing';

export interface IEditAttributionFlushResult {
	readonly outcome: EditAttributionFlushOutcome;
	readonly agentModifiedCount: number;
}

export function getFileEditAttributionMarker(content: ToolResultFileEditContent): IFileEditAttributionMarker | undefined {
	const marker = (content as Partial<AttributedToolResultFileEditContent>)[FILE_EDIT_ATTRIBUTION_PROPERTY];
	if (
		marker?.version !== 1 ||
		typeof marker.editId !== 'string' ||
		!Number.isSafeInteger(marker.sequence) ||
		marker.sequence < 0
	) {
		return undefined;
	}
	if (marker.status === 'skipped') {
		return marker.reason === 'fileTooLarge' && Number.isSafeInteger(marker.insertedCount) && marker.insertedCount >= 0 ? marker : undefined;
	}
	if (marker.status !== undefined && marker.status !== 'tracked') {
		return undefined;
	}
	return typeof marker.beforeDigest === 'string' && typeof marker.afterDigest === 'string' ? marker : undefined;
}

export function createFileEditContentDigest(content: string): string {
	return `${content.length}:${stringHash(content, 0)}:${stringHash(content, 5381)}`;
}

export function buildPrepareEditAttributionResource(params: IPrepareEditAttributionFlushParams): URI {
	return buildEditAttributionResource('prepare', {
		resource: params.resource.toString(),
		trigger: params.trigger,
		statsUuid: params.statsUuid,
		isDirty: params.isDirty,
		flushToken: params.flushToken,
		languageId: params.languageId,
	});
}

export function buildCommitEditAttributionResource(params: ICommitEditAttributionFlushParams): URI {
	return buildEditAttributionResource('commit', params);
}

export function buildCancelEditAttributionResource(params: ICancelEditAttributionFlushParams): URI {
	return buildEditAttributionResource('cancel', params);
}

export type EditAttributionResourceRequest =
	| { readonly kind: 'prepare'; readonly params: IPrepareEditAttributionFlushParams }
	| { readonly kind: 'commit'; readonly params: ICommitEditAttributionFlushParams }
	| { readonly kind: 'cancel'; readonly params: ICancelEditAttributionFlushParams };

export function parseEditAttributionResource(resource: URI): EditAttributionResourceRequest | undefined {
	if (resource.scheme !== EDIT_ATTRIBUTION_RESOURCE_SCHEME) {
		return undefined;
	}
	const kind = resource.path.substring(1);
	const payload = new URLSearchParams(resource.query).get('payload');
	if (!payload) {
		return undefined;
	}
	try {
		const value = JSON.parse(payload) as Record<string, string | number | boolean>;
		if (
			kind === 'prepare' &&
			typeof value.resource === 'string' &&
			isEditTelemetryTrigger(value.trigger) &&
			typeof value.statsUuid === 'string' &&
			typeof value.isDirty === 'boolean' &&
			typeof value.flushToken === 'string' &&
			typeof value.languageId === 'string'
		) {
			return {
				kind,
				params: {
					resource: URI.parse(value.resource),
					trigger: value.trigger,
					statsUuid: value.statsUuid,
					isDirty: value.isDirty,
					flushToken: value.flushToken,
					languageId: value.languageId,
				},
			};
		}
		if (kind === 'commit' && typeof value.flushToken === 'string' && typeof value.totalModifiedCount === 'number') {
			return {
				kind,
				params: {
					flushToken: value.flushToken,
					totalModifiedCount: value.totalModifiedCount,
				},
			};
		}
		if (kind === 'cancel' && typeof value.flushToken === 'string') {
			return {
				kind,
				params: {
					flushToken: value.flushToken,
				},
			};
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function buildEditAttributionResource(kind: EditAttributionResourceRequest['kind'], value: object): URI {
	const params = new URLSearchParams();
	params.set('payload', JSON.stringify(value));
	return URI.from({
		scheme: EDIT_ATTRIBUTION_RESOURCE_SCHEME,
		path: `/${kind}`,
		query: params.toString(),
	});
}

function isEditTelemetryTrigger(value: string | number | boolean | undefined): value is EditTelemetryTrigger {
	return value === '10hours' || value === 'hashChange' || value === 'branchChange' || value === 'closed' || value === 'time';
}
