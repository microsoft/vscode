/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import type { IChatPillSection } from '../../../browser/chatPills.js';
import { getCanvasInstanceLabels, getCanvasReferenceKey, ICanvasContext, ICanvasReference, REVEAL_CANVAS_COMMAND_ID } from '../common/canvas.js';

/**
 * Supplies the canvases pill of a chat input from the canvas context of the chat
 * it shows. Each canvas with a live source reveals its tab, reopening it if closed.
 */
export class CanvasesPillControl extends Disposable {

	/** Whether canvases are enabled and the chat can show them, so its input should offer the canvases pill. */
	readonly offered: IObservable<boolean>;
	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		context: IObservable<ICanvasContext | undefined>,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		const enabled = observableFromEvent(
			this,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)),
			() => configurationService.getValue<boolean>(CanvasesEnabledSettingId) === true,
		);
		const offeredContext = derived(this, reader => enabled.read(reader) ? context.read(reader) : undefined);
		this.offered = derived(this, reader => offeredContext.read(reader) !== undefined);
		this.sections = derived(this, reader => {
			const current = offeredContext.read(reader);
			const canvases = current?.canvases.read(reader)?.filter(canvas => canvas.source !== undefined) ?? [];
			if (!current || canvases.length === 0) {
				return [];
			}

			const { providerId, session, chat } = current.owner;
			const labels = getCanvasInstanceLabels(canvases);
			const entries = canvases.map((canvas, index) => {
				const reference: ICanvasReference = { providerId, session, chat, canvas: canvas.resource };
				const label = labels[index];
				return {
					id: getCanvasReferenceKey(reference),
					label,
					icon: Codicon.preview,
					ariaLabel: localize('canvasesPill.open', "Open canvas {0}", label),
					open: () => this.revealCanvas(reference, label),
				};
			});
			return [{ title: localize('canvasesPill.title', "Canvases"), entries }];
		});
	}

	private revealCanvas(reference: ICanvasReference, label: string): void {
		void this.commandService.executeCommand(REVEAL_CANVAS_COMMAND_ID, reference).catch(error => {
			this.notificationService.error(localize('canvasesPill.openFailed', "Could not open canvas {0}: {1}", label, toErrorMessage(error)));
		});
	}
}
