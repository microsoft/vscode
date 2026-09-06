/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The annotations channel: client-owned review comments anchored to a resource.
 *
 * Every annotations action is client-dispatchable (see `ClientAnnotationsAction`
 * in `action-origin.generated.ts`), and the same reducer runs on both sides, so
 * these scenarios exercise the synchronized-state contract end to end without
 * any model traffic: dispatch, observe the server echo, then read the channel
 * back to confirm the host applied the same reduction the client did.
 *
 * This channel was previously covered by neither the E2E suite nor the frozen
 * `../protocol/` suite.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildAnnotationsUri } from '../../../../common/annotationsUri.js';
import { buildDefaultChatUri, type AnnotationsState, type StringOrMarkdown } from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

/** The subset of `Annotation` these tests assert on. */
interface IObservedAnnotation {
	readonly id: string;
	readonly origin: {
		readonly session: string;
		readonly chat?: string;
		readonly turnId?: string;
	};
	readonly resolved: boolean;
	readonly entries: readonly { readonly id: string; readonly text: StringOrMarkdown }[];
}

export function defineAnnotationsTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	/**
	 * Client sequence numbers must strictly increase for the lifetime of a
	 * client, and the suite shares one across tests, so they cannot be
	 * hard-coded per scenario.
	 */
	let clientSeq = 3000;
	function nextClientSeq(): number {
		return clientSeq++;
	}

	async function createAnnotatedSession(prefix: string): Promise<{ sessionUri: string; annotationsUri: string; resource: string }> {
		const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
		const annotationsUri = buildAnnotationsUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: annotationsUri });
		context.client.clearReceived();
		return { sessionUri, annotationsUri, resource: URI.file(join(workspace, 'reviewed.ts')).toString() };
	}

	function dispatchAnnotationAction(channel: string, action: object): void {
		context.client.dispatch({ channel, clientSeq: nextClientSeq(), action: action as Parameters<typeof context.client.dispatch>[0]['action'] });
	}

	/**
	 * Waits for the server to echo `actionType` on the annotations channel, then
	 * reads the channel back. Reading without waiting would race the reduction
	 * and could observe the pre-dispatch state.
	 */
	async function annotationsAfter(channel: string, actionType: string): Promise<readonly IObservedAnnotation[]> {
		await context.client.waitForNotification(n =>
			isActionNotification(n, actionType) && getActionEnvelope(n).channel === channel,
			30_000,
		);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel });
		const state = subscribed.snapshot!.state;
		if (!isAnnotationsState(state)) {
			throw new Error(`Expected annotations state for ${channel}`);
		}
		return state.annotations;
	}

	conformanceTest(context, 'an annotation dispatched by a client is applied to the channel', async function () {
		const { sessionUri, annotationsUri, resource } = await createAnnotatedSession('annotations-set');
		const annotationId = generateUuid();

		dispatchAnnotationAction(annotationsUri, {
			type: ActionType.AnnotationsSet,
			annotation: {
				id: annotationId,
				origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-annotate' },
				resource,
				resolved: false,
				entries: [{ id: `${annotationId}:0`, text: 'needs a second look' }],
			},
		});

		const annotations = await annotationsAfter(annotationsUri, 'annotations/set');

		assert.deepStrictEqual(annotations.map(annotation => ({
			id: annotation.id,
			origin: annotation.origin,
			resolved: annotation.resolved,
			entries: annotation.entries.map(entry => entry.text),
		})), [{
			id: annotationId,
			origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-annotate' },
			resolved: false,
			entries: ['needs a second look'],
		}]);
	});

	conformanceTest(context, 'an annotation can be resolved without resending its entries', async function () {
		const { sessionUri, annotationsUri, resource } = await createAnnotatedSession('annotations-resolve');
		const annotationId = generateUuid();

		dispatchAnnotationAction(annotationsUri, {
			type: ActionType.AnnotationsSet,
			annotation: { id: annotationId, origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-resolve' }, resource, resolved: false, entries: [{ id: `${annotationId}:0`, text: 'why this branch?' }] },
		});
		await annotationsAfter(annotationsUri, 'annotations/set');

		// `annotations/updated` carries only the fields that change, so
		// resolving must not disturb the entries already on the annotation.
		context.client.clearReceived();
		dispatchAnnotationAction(annotationsUri, { type: ActionType.AnnotationsUpdated, annotationId, resolved: true, origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-resolve' } });

		const annotations = await annotationsAfter(annotationsUri, 'annotations/updated');

		assert.deepStrictEqual(annotations.map(annotation => ({
			resolved: annotation.resolved,
			entries: annotation.entries.map(entry => entry.text),
		})), [{
			resolved: true,
			entries: ['why this branch?'],
		}]);
	});

	conformanceTest(context, 'entries can be added to and removed from an annotation', async function () {
		const { sessionUri, annotationsUri, resource } = await createAnnotatedSession('annotations-entries');
		const annotationId = generateUuid();
		const replyId = `${annotationId}:1`;

		dispatchAnnotationAction(annotationsUri, {
			type: ActionType.AnnotationsSet,
			annotation: { id: annotationId, origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-entries' }, resource, resolved: false, entries: [{ id: `${annotationId}:0`, text: 'original' }] },
		});
		await annotationsAfter(annotationsUri, 'annotations/set');

		context.client.clearReceived();
		dispatchAnnotationAction(annotationsUri, { type: ActionType.AnnotationsEntrySet, annotationId, entry: { id: replyId, text: 'reply' } });
		const withReply = await annotationsAfter(annotationsUri, 'annotations/entrySet');

		context.client.clearReceived();
		dispatchAnnotationAction(annotationsUri, { type: ActionType.AnnotationsEntryRemoved, annotationId, entryId: replyId });
		const withoutReply = await annotationsAfter(annotationsUri, 'annotations/entryRemoved');

		assert.deepStrictEqual({
			afterEntrySet: withReply[0]?.entries.map(entry => entry.text),
			afterEntryRemoved: withoutReply[0]?.entries.map(entry => entry.text),
		}, {
			afterEntrySet: ['original', 'reply'],
			afterEntryRemoved: ['original'],
		});
	});

	conformanceTest(context, 'removing an annotation clears it from the channel', async function () {
		const { sessionUri, annotationsUri, resource } = await createAnnotatedSession('annotations-remove');
		const annotationId = generateUuid();

		dispatchAnnotationAction(annotationsUri, {
			type: ActionType.AnnotationsSet,
			annotation: { id: annotationId, origin: { session: sessionUri, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-remove' }, resource, resolved: false, entries: [{ id: `${annotationId}:0`, text: 'transient' }] },
		});
		await annotationsAfter(annotationsUri, 'annotations/set');

		context.client.clearReceived();
		dispatchAnnotationAction(annotationsUri, { type: ActionType.AnnotationsRemoved, annotationId });

		assert.deepStrictEqual(await annotationsAfter(annotationsUri, 'annotations/removed'), []);
	});
}

function isAnnotationsState(state: NonNullable<SubscribeResult['snapshot']>['state']): state is AnnotationsState {
	return 'annotations' in state;
}
