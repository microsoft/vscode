/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { getSessionCanvasReferenceKey, ISessionCanvasReference, ISessionCanvasReopenTarget, ISessionCanvasService } from '../common/sessionCanvas.js';

export const REOPEN_SESSION_CANVAS_COMMAND_ID = 'workbench.action.agentSessions.reopenCanvas';

const reopenCanvasWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	IsTopRightEditorGroupContext,
);

class CanvasAddTabActionRegistration extends Disposable {

	private readonly menuRegistration = this._register(new MutableDisposable<IDisposable>());
	private title: string | undefined;
	private order: number | undefined;

	constructor(
		readonly commandId: string,
		reference: ISessionCanvasReference,
		canvasService: ISessionCanvasService,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(commandId, () => canvasService.reopenCanvas(reference)));
	}

	update(title: string, order: number): void {
		if (this.title === title && this.order === order) {
			return;
		}
		this.title = title;
		this.order = order;
		this.menuRegistration.value = MenuRegistry.appendMenuItem(Menus.SessionsEditorTabsBarAddTab, {
			command: {
				id: this.commandId,
				title,
				icon: Codicon.preview,
			},
			group: 'navigation',
			order,
			when: reopenCanvasWhen,
		});
	}
}

export function registerSessionCanvasAddTabActions(canvasService: ISessionCanvasService): IDisposable {
	const store = new DisposableStore();
	const registrations = store.add(new DisposableMap<string, CanvasAddTabActionRegistration>());
	let commandSequence = 0;
	store.add(autorun(reader => {
		const targets = canvasService.reopenableCanvases.read(reader);
		const labels = getCanvasInstanceLabels(targets);
		const activeKeys = new Set<string>();
		for (let index = 0; index < targets.length; index++) {
			const target = targets[index];
			const key = getSessionCanvasReferenceKey(target.reference);
			activeKeys.add(key);
			let registration = registrations.get(key);
			if (!registration) {
				registration = new CanvasAddTabActionRegistration(
					`${REOPEN_SESSION_CANVAS_COMMAND_ID}.${++commandSequence}`,
					target.reference,
					canvasService,
				);
				registrations.set(key, registration);
			}
			registration.update(labels[index], 4 + index);
		}
		for (const key of [...registrations.keys()]) {
			if (!activeKeys.has(key)) {
				registrations.deleteAndDispose(key);
			}
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

	const labels = new Array<string>(targets.length);
	const usedLabels = new Set<string>();
	for (let index = 0; index < targets.length; index++) {
		const { canvas } = targets[index];
		if (titleCounts.get(canvas.title) === 1) {
			labels[index] = canvas.title;
			usedLabels.add(canvas.title);
		}
	}

	const titleIndexes = new Map<string, number>();
	for (let index = 0; index < targets.length; index++) {
		const { canvas } = targets[index];
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
