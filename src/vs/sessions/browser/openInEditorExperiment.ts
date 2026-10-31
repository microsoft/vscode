/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../base/common/cancellation.js';
import { isCancellationError } from '../../base/common/errors.js';
import { Event } from '../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue } from '../../base/common/observable.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../platform/log/common/log.js';
import { logExperimentTrigger } from '../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../workbench/common/contextkeys.js';
import { IWorkbenchContribution } from '../../workbench/common/contributions.js';
import { IWorkbenchAssignmentService } from '../../workbench/services/assignment/common/assignmentService.js';
import { IsPhoneLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext, SessionsHideOpenInEditorForFolderlessSessionsContext, SessionsWelcomeVisibleContext } from '../common/contextkeys.js';

/** ExP treatment that hides Open in Editor in quick chats whose active chat has no workspace folder. */
export const HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT = 'sessions.hideOpenInEditorForFolderlessSessions';

/** Where the Agents window title bar can show Open in Editor. */
export const OpenInEditorTitleBarContext = ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate())!;

/**
 * Whether Open in Editor is offered for the active chat. In a quick chat without a folder of its own, the editor
 * would only show an empty window, so the {@link HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT} experiment
 * hides it then. A missing workspace alone doesn't make a chat folderless: no session is active while the window
 * starts, and a session's workspace may still be loading.
 */
export const OpenInEditorAvailableContext = ContextKeyExpr.or(IsQuickChatSessionContext.negate(), SessionHasWorkspaceContext, SessionsHideOpenInEditorForFolderlessSessionsContext.negate())!;

/** Where the experiment arms diverge: only the control arm shows Open in Editor for a quick chat without a folder. */
const FolderlessOpenInEditorContext = ContextKeyExpr.and(OpenInEditorTitleBarContext, IsQuickChatSessionContext, SessionHasWorkspaceContext.negate())!;

/**
 * Applies the {@link HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT} experiment through
 * {@link SessionsHideOpenInEditorForFolderlessSessionsContext} and logs its experiment trigger.
 */
export class OpenInEditorExperimentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.openInEditorExperiment';

	private readonly hideForFolderlessSessionsContext: IContextKey<boolean>;
	private readonly treatmentResolved = observableValue(this, false);
	private readonly treatmentCancellation = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.hideForFolderlessSessionsContext = SessionsHideOpenInEditorForFolderlessSessionsContext.bindTo(contextKeyService);
		this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTreatment()));
		this.updateTreatment();

		const folderlessKeys = new Set(FolderlessOpenInEditorContext.keys());
		const showsFolderlessOpenInEditorInControl = observableFromEvent(this,
			Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(folderlessKeys), this._store),
			() => contextKeyService.contextMatchesRules(FolderlessOpenInEditorContext));
		this._register(autorun(reader => {
			// Every arm shows Open in Editor until the treatment is resolved.
			if (this.treatmentResolved.read(reader) && showsFolderlessOpenInEditorInControl.read(reader)) {
				logExperimentTrigger(telemetryService, HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT);
			}
		}));
	}

	private updateTreatment(): void {
		const cancellation = new CancellationTokenSource();
		this.treatmentCancellation.value = toDisposable(() => {
			cancellation.cancel();
			cancellation.dispose();
		});
		void this.resolveTreatment(cancellation.token);
	}

	private async resolveTreatment(token: CancellationToken): Promise<void> {
		let hide = false;
		try {
			hide = await raceCancellationError(this.assignmentService.getTreatment<boolean>(HIDE_OPEN_IN_EDITOR_FOR_FOLDERLESS_SESSIONS_TREATMENT), token) === true;
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}
			this.logService.warn('[OpenInEditorExperimentContribution] Failed to resolve the folderless Open in Editor treatment; showing Open in Editor.', error);
		}
		// Resolve before applying so the trigger is logged before the arms diverge.
		this.treatmentResolved.set(true, undefined);
		this.hideForFolderlessSessionsContext.set(hide);
	}
}
