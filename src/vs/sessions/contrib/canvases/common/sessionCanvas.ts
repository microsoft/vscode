/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession, ISessionCanvas, ISessionCanvasDefinition } from '../../../services/sessions/common/session.js';

export function createSessionCanvasReference(session: ISession, chat: IChat, canvas: ISessionCanvas): ICanvasReference {
	return {
		providerId: session.providerId,
		session: session.resource,
		chat: chat.resource,
		canvas: canvas.resource,
	};
}

export function getSessionCanvasDefinitionLabels(canvases: readonly ISessionCanvasDefinition[]): readonly string[] {
	const displayNameCounts = new Map<string, number>();
	for (const canvas of canvases) {
		const displayName = canvas.displayName || canvas.canvasId;
		displayNameCounts.set(displayName, (displayNameCounts.get(displayName) ?? 0) + 1);
	}

	const labels: string[] = [];
	const usedLabels = new Set<string>();
	for (const canvas of canvases) {
		const displayName = canvas.displayName || canvas.canvasId;
		let label = displayNameCounts.get(displayName) === 1
			? displayName
			: localize('canvas.definitionTitle', "{0} ({1})", displayName, canvas.extensionName || canvas.extensionId);
		if (usedLabels.has(label)) {
			label = localize('canvas.definitionTitleWithId', "{0} ({1}, {2})", displayName, canvas.extensionName || canvas.extensionId, canvas.canvasId);
		}
		let collisionIndex = 2;
		const baseLabel = label;
		while (usedLabels.has(label)) {
			label = localize('canvas.definitionTitleCollision', "{0} ({1})", baseLabel, String(collisionIndex++));
		}
		labels.push(label);
		usedLabels.add(label);
	}
	return labels;
}

const CANVAS_INSTANCE_ID_MAX_LENGTH = 128;

export function getSessionCanvasDefinitionInstanceId(canvas: ISessionCanvasDefinition): string {
	const raw = `${canvas.extensionId}-${canvas.canvasId}`;
	const normalized = raw
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^[._-]+/, '')
		.replace(/[._-]+$/, '');
	if (normalized === raw && normalized.length <= CANVAS_INSTANCE_ID_MAX_LENGTH) {
		return normalized;
	}

	const hashSuffix = `-${(hash(raw) >>> 0).toString(16).padStart(8, '0')}`;
	const base = normalized
		.slice(0, CANVAS_INSTANCE_ID_MAX_LENGTH - hashSuffix.length)
		.replace(/[._-]+$/, '')
		|| 'canvas';
	return `${base}${hashSuffix}`;
}

export const ISessionCanvasRegistryService = createDecorator<ISessionCanvasRegistryService>('sessionCanvasRegistryService');

export interface ISessionCanvasRegistryService {
	readonly _serviceBrand: undefined;
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;
	openCanvas(canvas: ISessionCanvasDefinition): Promise<void>;
}
