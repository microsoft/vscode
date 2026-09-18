/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatContentMarkdownRenderer } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { IComparisonCandidate, IComparisonRun, ISessionComparisonService } from '../common/comparison.js';

export function getCandidateStatus(candidate: IComparisonCandidate, session: ISession | undefined, sessionStatus = session?.status.get()): string {
	switch (candidate.state) {
		case 'starting': return localize('comparison.starting', "Starting...");
		case 'failed': return localize('comparison.failed', "Could not start");
		case 'cancelled': return localize('comparison.stopped', "Stopped");
		case 'interrupted': return localize('comparison.interrupted', "Launch interrupted");
	}
	if (!session) {
		return localize('comparison.unavailable', "Session unavailable");
	}
	switch (sessionStatus) {
		case SessionStatus.Untitled: return localize('comparison.preparing', "Preparing...");
		case SessionStatus.InProgress: return localize('comparison.working', "Working...");
		case SessionStatus.NeedsInput: return localize('comparison.input', "Needs your input");
		case SessionStatus.Error: return localize('comparison.error', "Session error");
		case SessionStatus.Completed: return localize('comparison.finished', "Finished");
		default: return localize('comparison.loading', "Loading...");
	}
}

export interface IComparisonCandidateActions {
	openSession(session: ISession): Promise<void>;
	openChanges(session: ISession): Promise<void>;
}

export class ComparisonCandidateView extends Disposable {
	readonly element = dom.$('section.comparison-candidate');
	private readonly markdown: ChatContentMarkdownRenderer;
	private readonly responseRendering = this._register(new MutableDisposable());

	constructor(
		index: number,
		candidateId: string,
		run: IObservable<IComparisonRun>,
		actions: IComparisonCandidateActions,
		@ISessionComparisonService comparisonService: ISessionComparisonService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.markdown = instantiationService.createInstance(ChatContentMarkdownRenderer);
		const candidate = derived(this, reader => run.read(reader).candidates.find(candidate => candidate.id === candidateId)!);
		const session = derived(this, reader => comparisonService.getSession(candidate.read(reader), reader));
		const label = localize('comparison.attempt', "Attempt {0}", String.fromCharCode(65 + index));
		this.element.setAttribute('aria-label', label);
		const header = dom.append(this.element, dom.$('.comparison-candidate-header'));
		dom.append(header, dom.$('span.comparison-attempt-label', undefined, label));
		const statusLabel = dom.append(header, dom.$('span.comparison-status'));
		const modelLabel = dom.append(this.element, dom.$('h3.comparison-model'));
		const providerLabel = dom.append(this.element, dom.$('div.comparison-provider'));
		const activity = dom.append(this.element, dom.$('p.comparison-activity'));
		const response = dom.append(this.element, dom.$('div.comparison-response'));
		response.tabIndex = 0;
		response.setAttribute('role', 'region');
		response.setAttribute('aria-label', localize('comparison.response', "{0} response", label));
		const files = dom.append(this.element, dom.$('div.comparison-files'));
		const stats = dom.append(files, dom.$('p.comparison-stats'));
		const fileNames = dom.append(files, dom.$('div.comparison-file-names'));
		const controls = dom.append(this.element, dom.$('.comparison-candidate-actions'));
		const open = this.button(controls, localize('comparison.openSession', "Open Session"), async () => {
			const current = session.get();
			if (current) { await actions.openSession(current); }
		});
		const changes = this.button(controls, localize('comparison.reviewChanges', "Review Changes"), async () => {
			const current = session.get();
			if (current) { await actions.openChanges(current); }
		});
		const stop = this.button(controls, localize('comparison.stop', "Stop"), () => comparisonService.stop(run.get().id, candidateId));
		const preference = this.button(this.element, localize('comparison.prefer', "Prefer This Implementation"), async () => {
			comparisonService.prefer(run.get().id, candidateId);
			status(localize('comparison.preferredAnnouncement', "{0} is your preferred implementation. Other attempts are kept.", label));
		}, false);
		preference.element.classList.add('comparison-preference');
		let lastStatus: string | undefined;
		this._register(autorun(reader => {
			const current = candidate.read(reader);
			const currentSession = session.read(reader);
			const state = currentSession?.status.read(reader);
			const preferred = run.read(reader).preferredCandidateId === candidateId;
			const statusText = getCandidateStatus(current, currentSession, state);
			statusLabel.textContent = statusText;
			modelLabel.textContent = current.target.modelLabel;
			providerLabel.textContent = current.target.providerLabel;
			activity.textContent = current.error
				?? (current.state === 'interrupted' ? localize('comparison.interruptedDetails', "The window closed during launch. Check the session before starting another attempt.")
					: currentSession?.description.read(reader)?.value ?? '');
			this.element.classList.toggle('preferred', preferred);
			this.element.classList.toggle('failed', current.state === 'failed' || state === SessionStatus.Error);
			this.element.classList.toggle('needs-input', state === SessionStatus.NeedsInput);
			preference.label = preferred ? localize('comparison.preferred', "Preferred Implementation") : localize('comparison.prefer', "Prefer This Implementation");
			preference.element.setAttribute('aria-pressed', String(preferred));
			preference.enabled = current.state === 'started' && state === SessionStatus.Completed;
			open.enabled = !!currentSession;
			changes.enabled = !!currentSession && currentSession.changes.read(reader).length > 0;
			stop.enabled = current.state === 'starting' || (current.state === 'started' && (state === SessionStatus.InProgress || state === SessionStatus.NeedsInput));
			const fileChanges = currentSession?.changes.read(reader) ?? [];
			stats.textContent = localize('comparison.stats', "{0} files changed · +{1} −{2}", fileChanges.length,
				fileChanges.reduce((sum, change) => sum + change.insertions, 0),
				fileChanges.reduce((sum, change) => sum + change.deletions, 0));
			fileNames.textContent = fileChanges.slice(0, 6).map(change => basename(isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri)).join('\n');
			if (fileChanges.length > 6) {
				fileNames.textContent += '\n' + localize('comparison.moreFiles', "and {0} more", fileChanges.length - 6);
			}
			if (lastStatus !== undefined && lastStatus !== statusText) {
				status(localize('comparison.statusAnnouncement', "{0}: {1}", label, statusText));
			}
			lastStatus = statusText;
		}));
		this._register(autorun(reader => {
			const currentSession = session.read(reader);
			const chat = currentSession?.mainChat.read(reader);
			if (currentSession && chat && currentSession.status.read(reader) !== SessionStatus.Untitled) {
				void this.loadResponse(chat.resource, response, reader.store);
			} else {
				response.textContent = localize('comparison.waitingResponse', "The response will appear here. You can open the session to follow its progress.");
			}
		}));
	}

	private button(container: HTMLElement, label: string, run: () => Promise<void>, secondary = true): Button {
		const button = this._register(new Button(container, { ...defaultButtonStyles, secondary }));
		button.label = label;
		this._register(button.onDidClick(() => { void run().catch(error => this.notificationService.error(error)); }));
		return button;
	}

	private async loadResponse(resource: URI, container: HTMLElement, store: DisposableStore): Promise<void> {
		const source = new CancellationTokenSource();
		store.add(toDisposable(() => source.dispose(true)));
		try {
			const reference = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, source.token, 'sessionComparison');
			if (store.isDisposed) {
				reference?.dispose();
				return;
			}
			if (!reference) {
				container.textContent = localize('comparison.noTranscript', "The response is unavailable. Open the session to reconnect.");
				return;
			}
			store.add(reference);
			const subscription = store.add(new MutableDisposable());
			let response: IChatResponseModel | undefined;
			let lastText: string | undefined;
			const update = () => {
				const latest = reference.object.getRequests().findLast(request => !request.isHiddenFromTranscript)?.response;
				if (latest !== response) {
					response = latest;
					subscription.value = response?.onDidChange(() => scheduler.schedule());
				}
				const text = response?.response.getFinalResponse() ?? '';
				if (text === lastText) { return; }
				lastText = text;
				this.responseRendering.clear();
				dom.clearNode(container);
				if (text) {
					const rendered = this.markdown.render(new MarkdownString(text));
					this.responseRendering.value = rendered;
					container.appendChild(rendered.element);
				} else {
					container.textContent = localize('comparison.noResponseYet', "No response yet. Open the session for tool activity and permission requests.");
				}
			};
			const scheduler = store.add(new RunOnceScheduler(update, 100));
			store.add(reference.object.onDidChange(() => scheduler.schedule()));
			update();
		} catch (error) {
			if (!store.isDisposed && !isCancellationError(error)) {
				container.textContent = localize('comparison.loadError', "Could not load response: {0}", getErrorMessage(error));
			}
		}
	}
}
