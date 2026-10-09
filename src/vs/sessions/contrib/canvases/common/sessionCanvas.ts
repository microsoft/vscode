/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { IChat, ISession, ISessionCanvas } from '../../../services/sessions/common/session.js';

export const REVEAL_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.revealCanvas';

export function createSessionCanvasReference(session: ISession, chat: IChat, canvas: ISessionCanvas): ICanvasReference {
	return {
		providerId: session.providerId,
		session: session.resource,
		chat: chat.resource,
		canvas: canvas.resource,
	};
}

export function getSessionCanvasInstanceLabels(canvases: readonly ISessionCanvas[]): readonly string[] {
	const titleCounts = new Map<string, number>();
	const instanceIdCounts = new Map<string, number>();
	for (const canvas of canvases) {
		titleCounts.set(canvas.title, (titleCounts.get(canvas.title) ?? 0) + 1);
		if (canvas.instanceId) {
			instanceIdCounts.set(canvas.instanceId, (instanceIdCounts.get(canvas.instanceId) ?? 0) + 1);
		}
	}

	const labels = new Array<string>(canvases.length);
	const usedLabels = new Set<string>();
	for (let index = 0; index < canvases.length; index++) {
		const canvas = canvases[index];
		if (titleCounts.get(canvas.title) === 1) {
			labels[index] = canvas.title;
			usedLabels.add(canvas.title);
		}
	}

	const titleIndexes = new Map<string, number>();
	for (let index = 0; index < canvases.length; index++) {
		const canvas = canvases[index];
		if (titleCounts.get(canvas.title) === 1) {
			continue;
		}

		const titleIndex = (titleIndexes.get(canvas.title) ?? 0) + 1;
		titleIndexes.set(canvas.title, titleIndex);
		const instanceLabel = canvas.instanceId && instanceIdCounts.get(canvas.instanceId) === 1
			? canvas.instanceId
			: String(titleIndex);
		let label = localize('canvas.instanceTitle', "{0} ({1})", canvas.title, instanceLabel);
		let collisionIndex = 2;
		while (usedLabels.has(label)) {
			label = localize('canvas.instanceTitleCollision', "{0} ({1}, {2})", canvas.title, instanceLabel, String(collisionIndex++));
		}
		labels[index] = label;
		usedLabels.add(label);
	}
	return labels;
}
