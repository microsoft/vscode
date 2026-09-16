/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableFromEvent, waitForState } from '../../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildAnnotationsUri } from '../../../../../../platform/agentHost/common/annotationsUri.js';
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { Annotation, AnnotationsState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackReviewComment } from '../../../common/chatService/chatService.js';

/** Whether an annotation is review feedback that this confirmation can reveal. */
function isReviewable(annotation: Annotation): boolean {
	const meta = readFeedbackAnnotationMeta(annotation);
	return !!meta && annotation.entries.length > 0
		&& (meta.kind === 'codeReview' || meta.kind === 'prReview')
		&& ((!annotation.resolved && meta.state === 'created') || meta.pendingAgentReveal === true);
}

/**
 * Editor-window counterpart to the Agents window's feedback review commands.
 * Reads the owning host's annotations rather than depending on sessions-window
 * services. Registered only by the editor's agent-host contribution.
 */
export class AgentHostFeedbackReviewCommands extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostFeedbackReviewCommands';

	private readonly _commands = this._register(new MutableDisposable<AgentHostFeedbackReviewOperations>());

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		// Defer host startup until a feedback command is invoked.
		const commands = () => this._commands.value ??= instantiationService.createInstance(AgentHostFeedbackReviewOperations);
		this._register(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.GetComments, (_accessor, resource: UriComponents) => commands().getComments(resource)));
		this._register(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Reveal, (_accessor, resource: UriComponents, id: string) => commands().reveal(resource, id)));
		this._register(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Delete, (_accessor, resource: UriComponents, id: string) => commands().delete(resource, id)));
		this._register(CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Accept, (_accessor, resource: UriComponents, ids: readonly string[]) => commands().accept(resource, ids)));
	}
}

/** Lazily instantiated host operations, scoped to the editor contribution's lifetime. */
class AgentHostFeedbackReviewOperations extends Disposable {
	private readonly _cancellation = new CancellationTokenSource();

	constructor(
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
		this._register(toDisposable(() => this._cancellation.dispose(true)));
	}

	/** Lists review feedback without accepting or revealing it to the agent. */
	getComments(resource: UriComponents): Promise<IChatAgentFeedbackReviewComment[]> {
		return this._withAnnotations(resource, (state, connection) => state.annotations.filter(isReviewable).map(annotation => ({
			id: annotation.id,
			text: annotation.entries.map(entry => typeof entry.text === 'string' ? entry.text : entry.text.markdown).join('\n\n'),
			fileUri: connection.resourceUris.fromAgentHost(URI.parse(annotation.resource)),
			kindLabel: readFeedbackAnnotationMeta(annotation)?.kind === 'prReview'
				? localize('agentFeedbackReview.prReview', "PR Review")
				: localize('agentFeedbackReview.agentReview', "Agent Review"),
		})));
	}

	/** Opens the selected comment's file on its owning host, at the recorded range. */
	reveal(resource: UriComponents, id: string): Promise<void> {
		return this._withAnnotations(resource, async (state, connection) => {
			const annotation = state.annotations.find(item => item.id === id && isReviewable(item));
			if (!annotation) {
				throw new Error('Review comment is no longer available');
			}
			const range = annotation.range;
			await this._editorService.openEditor({
				resource: connection.resourceUris.fromAgentHost(URI.parse(annotation.resource)),
				options: {
					selection: range ? {
						startLineNumber: range.start.line + 1,
						startColumn: range.start.character + 1,
						endLineNumber: range.end.line + 1,
						endColumn: range.end.character + 1,
					} : undefined,
				},
			});
		});
	}

	/** Deletes only review feedback, leaving unrelated annotations untouched. */
	delete(resource: UriComponents, id: string): Promise<void> {
		return this._withAnnotations(resource, (state, connection, channel) => {
			if (state.annotations.some(item => item.id === id && isReviewable(item))) {
				connection.dispatch(channel, { type: ActionType.AnnotationsRemoved, annotationId: id });
			}
		});
	}

	/** Records an explicit selection before the UI sends approval on the same connection. */
	accept(resource: UriComponents, ids: readonly string[]): Promise<void> {
		return this._withAnnotations(resource, (state, connection, channel) => {
			// An empty/stale selection must not trigger the server's reveal-everything fallback.
			const selected = new Set(ids);
			const reviewable = state.annotations.filter(isReviewable);
			if (!selected.size || [...selected].some(id => !reviewable.some(item => item.id === id))) {
				throw new Error('Selected review comments are no longer available');
			}
			for (const annotation of reviewable) {
				const meta = readFeedbackAnnotationMeta(annotation)!;
				const reveal = selected.has(annotation.id);
				if (!reveal && !meta.pendingAgentReveal) {
					continue;
				}
				// Clear unchecked pending selections left by an interrupted reveal.
				connection.dispatch(channel, {
					type: ActionType.AnnotationsSet,
					annotation: {
						...annotation,
						_meta: {
							...annotation._meta,
							[FEEDBACK_ANNOTATION_META_KEY]: { ...meta, state: reveal ? 'accepted' : meta.state, pendingAgentReveal: reveal },
						},
					},
				});
			}
		});
	}

	/**
	 * Waits for authoritative annotations before reading or mutating them.
	 * Errors remain errors; an unhydrated subscription is never an empty list.
	 * The reference is held through the operation and released even on failure.
	 */
	private async _withAnnotations<T>(resource: UriComponents, run: (state: AnnotationsState, connection: IAgentConnection, channel: string) => T | Promise<T>): Promise<T> {
		const resolved = this._connections.resolveSessionResource(URI.revive(resource));
		if (!resolved) {
			throw new Error('The review comment host is not connected');
		}
		// Peer-chat fragments resolve to the owning session's shared annotations.
		const channel = buildAnnotationsUri(resolved.backendSession.toString());
		const ref = resolved.connection.getSubscription(StateComponents.Annotations, URI.parse(channel), AgentHostFeedbackReviewCommands.ID);
		const cancellation = new CancellationTokenSource(this._cancellation.token);
		try {
			const subscription = ref.object;
			const value = observableFromEvent(this, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None), () => subscription.value);
			const state = await waitForState(value, (state): state is AnnotationsState => !!state && !(state instanceof Error), state => state instanceof Error ? state : undefined, cancellation.token);
			return await run(state, resolved.connection, channel);
		} finally {
			cancellation.dispose(true);
			ref.dispose();
		}
	}
}
