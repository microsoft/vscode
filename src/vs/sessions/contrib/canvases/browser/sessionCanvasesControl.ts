/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { CanvasesEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import type { IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { createSessionCanvasReference, getSessionCanvasInstanceLabels, getSessionCanvasReferenceKey, ISessionCanvasReference, REVEAL_SESSION_CANVAS_COMMAND_ID } from '../common/sessionCanvas.js';

export class SessionCanvasesControl extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		chat: IObservable<IChat | undefined>,
		enabled: IObservable<boolean>,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		const canvasesEnabled = observableFromEvent(
			this,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(CanvasesEnabledSettingId)),
			() => configurationService.getValue<boolean>(CanvasesEnabledSettingId) === true,
		);
		this.sections = derived(this, reader => {
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			if (!enabled.read(reader) || !canvasesEnabled.read(reader) || currentSession?.capabilities.read(reader).supportsCanvases !== true || !currentChat) {
				return [];
			}

			const canvases = (currentChat.canvases?.read(reader) ?? []).filter(canvas => canvas.source !== undefined);
			const labels = getSessionCanvasInstanceLabels(canvases);
			const entries = canvases.map((canvas, index) => {
				const reference = createSessionCanvasReference(currentSession, currentChat, canvas);
				const label = labels[index];
				return {
					id: getSessionCanvasReferenceKey(reference),
					label,
					icon: Codicon.preview,
					ariaLabel: localize('sessionCanvases.open', "Open canvas {0}", label),
					open: () => this.openCanvas(reference, label),
				};
			});
			return entries.length > 0 ? [{ title: localize('sessionCanvases.title', "Canvases"), entries }] : [];
		});
	}

	private openCanvas(reference: ISessionCanvasReference, label: string): void {
		void this.commandService.executeCommand(REVEAL_SESSION_CANVAS_COMMAND_ID, reference).catch(error => {
			this.notificationService.error(localize('sessionCanvases.openFailed', "Could not open canvas {0}: {1}", label, toErrorMessage(error)));
		});
	}
}
