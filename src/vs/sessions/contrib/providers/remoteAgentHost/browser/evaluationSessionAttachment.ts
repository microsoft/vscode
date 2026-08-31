/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isRemoteAgentHostSessionType } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IEvaluationSessionAttachment, IEvaluationSessionAttachmentService, IEvaluationSessionIdentity } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/evaluationSessionAttachmentService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

export interface IEvaluationSessionAttachmentStartupServices {
	readonly sessionsManagementService: Pick<ISessionsManagementService, 'getSession' | 'onDidChangeSessions'>;
	readonly sessionsService: Pick<ISessionsService, 'canOpenSession' | 'openSession'> & { readonly activeSession: IObservable<ISession | undefined>; readonly initialRestoreComplete: IObservable<boolean> };
	readonly connectionsService: Pick<IAgentHostConnectionsService, 'connections' | 'resolveSessionResource'>;
	readonly attachmentService: IEvaluationSessionAttachmentService;
	readonly whenWorkbenchRestored: Promise<void>;
	readonly reconcileClientToolSets: () => void;
}
export function parseEvaluationSessionResource(value: string): URI {
	const resource = URI.parse(value, true);
	const id = resource.path.substring(1);
	if (!isRemoteAgentHostSessionType(resource.scheme) || resource.authority || !id
		|| resource.path !== `/${id}` || id.includes('/') || resource.query || resource.fragment
		|| resource.toString() !== value) {
		throw new Error(localize('evaluationSessionAttachment.invalidUri', "The evaluation session URI must be a canonical remote session URI."));
	}
	return resource;
}
export async function startEvaluationSessionAttachment(value: string | undefined, getServices: () => IEvaluationSessionAttachmentStartupServices, token: CancellationToken, onFailure: (error: Error) => void = () => { }): Promise<IDisposable | undefined> {
	if (value === undefined) {
		return undefined;
	}
	const resource = parseEvaluationSessionResource(value);
	const services = getServices();
	let attachment: IEvaluationSessionAttachment | undefined;
	try {
		await waitForState(services.sessionsService.initialRestoreComplete, complete => complete, undefined, token);
		const session = await waitForExactSession(services.sessionsManagementService, resource, token);
		const identity = resolveEvaluationSessionIdentity(resource, session, services.connectionsService);
		if (!await raceCancellationError(services.sessionsService.canOpenSession(session), token)) {
			throw new Error(localize('evaluationSessionAttachment.workspaceNotTrusted', "The evaluation session workspace is not trusted."));
		}
		attachment = services.attachmentService.attach(identity);
		await raceCancellationError(services.sessionsService.openSession(resource), token);
		await waitForState(
			services.sessionsService.activeSession,
			active => active?.resource.toString() === resource.toString(),
			active => active && active.resource.toString() !== resource.toString()
				? new Error(localize('evaluationSessionAttachment.differentSessionActivated', "Opening the evaluation session activated a different session."))
				: false,
			token,
		);
		await raceCancellationError(services.whenWorkbenchRestored, token);
		if (services.sessionsService.activeSession.get()?.resource.toString() !== resource.toString()) {
			throw new Error(localize('evaluationSessionAttachment.changedBeforePublication', "The active evaluation session changed before publication was ready."));
		}
		services.reconcileClientToolSets();
		attachment.markActiveClientPublicationReady();
		const retained = new DisposableStore();
		retained.add(attachment);
		attachment = undefined;
		retained.add(autorun(reader => {
			if (services.sessionsService.activeSession.read(reader)?.resource.toString() !== resource.toString()) {
				retained.dispose();
				onFailure(new Error(localize('evaluationSessionAttachment.activeSessionChanged', "The active evaluation session changed.")));
			}
		}));
		// The SDK supplies the workspace working directory; the driver waits for active-client inventory before sending a turn.
		return retained;
	} catch (error) {
		attachment?.dispose();
		throw error;
	}
}
async function waitForExactSession(service: Pick<ISessionsManagementService, 'getSession' | 'onDidChangeSessions'>, resource: URI, token: CancellationToken): Promise<ISession> {
	for (; ;) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const session = service.getSession(resource);
		if (session?.resource.toString() === resource.toString()) {
			return session;
		}
		const change = Event.toPromise(service.onDidChangeSessions);
		try {
			await raceCancellationError(change, token);
		} finally {
			change.cancel();
		}
	}
}
export function resolveEvaluationSessionIdentity(resource: URI, session: ISession, connectionsService: Pick<IAgentHostConnectionsService, 'connections' | 'resolveSessionResource'>): IEvaluationSessionIdentity {
	const resolution = connectionsService.resolveSessionResource(resource);
	const connection = connectionsService.connections.find(candidate => !candidate.isAmbient && candidate.connection === resolution?.connection);
	const backendSession = (session as ISession & { readonly backendUri?: URI }).backendUri;
	if (!resolution || !connection || session.resource.toString() !== resource.toString()
		|| !URI.isUri(backendSession) || backendSession.authority || backendSession.path !== resource.path
		|| backendSession.query || backendSession.fragment) {
		throw new Error(localize('evaluationSessionAttachment.inexactRemoteHost', "The evaluation session is not backed by the exact connected remote agent host."));
	}
	return { connectionAuthority: connection.authority, backendSession };
}
export class EvaluationSessionAttachmentLifecycle extends Disposable {
	private readonly _attachment = this._register(new MutableDisposable<IDisposable>());
	constructor(value: string | undefined, getServices: () => IEvaluationSessionAttachmentStartupServices, onFailure: (error: Error) => void) {
		super();
		if (value === undefined) {
			return;
		}
		const cancellation = new CancellationTokenSource();
		this._register(toDisposable(() => cancellation.dispose(true)));
		void startEvaluationSessionAttachment(value, getServices, cancellation.token, error => {
			this._attachment.clear();
			onFailure(error);
		}).then(attachment => {
			if (cancellation.token.isCancellationRequested) {
				attachment?.dispose();
			} else {
				this._attachment.value = attachment;
			}
		}).catch(error => {
			if (!isCancellationError(error) && !cancellation.token.isCancellationRequested) {
				onFailure(error);
			}
		});
	}
}
