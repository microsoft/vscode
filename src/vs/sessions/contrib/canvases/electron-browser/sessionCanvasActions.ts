/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionCanvasReopenTarget, ISessionCanvasService } from '../common/sessionCanvas.js';

export const REOPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.reopenCanvas';

const reopenCanvasWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext,
);

export function registerSessionCanvasAddTabActions(canvasService: ISessionCanvasService): IDisposable {
	const store = new DisposableStore();
	let commandSequence = 0;
	store.add(autorun(reader => {
		const targets = canvasService.reopenableCanvases.read(reader);
		const labels = getCanvasInstanceLabels(targets);
		for (let index = 0; index < targets.length; index++) {
			const target = targets[index];
			const commandId = `${REOPEN_SESSION_CANVAS_COMMAND_ID}.${++commandSequence}`;
			reader.store.add(CommandsRegistry.registerCommand(commandId, () => canvasService.reopenCanvas(target.reference)));
			reader.store.add(MenuRegistry.appendMenuItem(Menus.SessionsEditorTabsBarAddTab, {
				command: {
					id: commandId,
					title: labels[index],
					icon: Codicon.preview,
				},
				group: 'navigation',
				order: 4 + index,
				when: reopenCanvasWhen,
			}));
		}
	}));
	return store;
}

function getCanvasInstanceLabels(targets: readonly ISessionCanvasReopenTarget[]): string[] {
	const titleCounts = new Map<string, number>();
	const instanceIdCounts = new Map<string, number>();
	for (const { canvas } of targets) {
		titleCounts.set(canvas.title, (titleCounts.get(canvas.title) ?? 0) + 1);
		if (canvas.instanceId) {
			instanceIdCounts.set(canvas.instanceId, (instanceIdCounts.get(canvas.instanceId) ?? 0) + 1);
		}
	}

	const titleIndexes = new Map<string, number>();
	return targets.map(({ canvas }) => {
		if (titleCounts.get(canvas.title) === 1) {
			return canvas.title;
		}

		const titleIndex = (titleIndexes.get(canvas.title) ?? 0) + 1;
		titleIndexes.set(canvas.title, titleIndex);
		const instanceLabel = canvas.instanceId && instanceIdCounts.get(canvas.instanceId) === 1
			? canvas.instanceId
			: String(titleIndex);
		return localize('canvas.instanceTitle', "{0} ({1})", canvas.title, instanceLabel);
	});
}
