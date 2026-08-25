/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createAgentHostResourceUriMapper } from '../../../common/agentHostUri.js';
import { IAgentSubscription } from '../../../common/state/agentSubscription.js';
import { decodeAnnotationsActionEnvelope, decodeAnnotationsState, decodeClientAnnotationsAction, decodeInitializeResult, encodeAnnotationsState, encodeClientAnnotationsAction } from '../../../common/state/agentHostUriProjection.generated.js';
import { createAgentHostUriProjectionContext, projectAgentSubscriptionObject } from '../../../common/state/agentHostUriProjection.js';
import { ActionType, type ActionEnvelope } from '../../../common/state/sessionActions.js';
import { AnnotationsState, ROOT_STATE_URI } from '../../../common/state/sessionState.js';

suite('Agent Host URI projection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const resourceUris = createAgentHostResourceUriMapper('remote-test');
	const context = createAgentHostUriProjectionContext(resourceUris);
	context.registerChannel('copilot:/session-1');

	test('round-trips annotation state and actions', () => {
		const rawState: AnnotationsState = {
			annotations: [{
				id: 'annotation-1',
				origin: { session: 'copilot:/session-1', chat: 'ahp-chat://default/session-1', turnId: 'turn-1' },
				resource: 'file:///q%3A/repo/src/file.ts',
				resolved: false,
				entries: [{ id: 'entry-1', text: 'Review this.' }],
			}],
		};
		const nativeState = decodeAnnotationsState(rawState, context);
		const nativeAction = decodeClientAnnotationsAction({
			type: ActionType.AnnotationsSet,
			annotation: rawState.annotations[0],
		}, context);

		assert.deepStrictEqual({
			native: {
				session: nativeState.annotations[0].origin.session.toString(),
				chat: nativeState.annotations[0].origin.chat?.toString(),
				resource: nativeState.annotations[0].resource.toString(),
			},
			stateRoundTrip: encodeAnnotationsState(nativeState, context),
			actionRoundTrip: encodeClientAnnotationsAction(nativeAction, context),
		}, {
			native: {
				session: 'copilot:/session-1',
				chat: 'ahp-chat://default/session-1',
				resource: resourceUris.fromAgentHost(URI.parse('file:///q%3A/repo/src/file.ts')).toString(),
			},
			stateRoundTrip: rawState,
			actionRoundTrip: {
				type: ActionType.AnnotationsSet,
				annotation: rawState.annotations[0],
			},
		});
	});

	test('classifies channels, routed resources, external URIs, and host resources by shape', () => {
		const hostResource = 'file:///q%3A/repo/file.ts';
		const values = {
			root: ROOT_STATE_URI,
			dynamicSession: 'copilot:/session-1',
			chat: 'ahp-chat://default/session-1',
			annotations: 'copilot:/session-1/annotations',
			otlpTemplate: 'ahp-otlp:/logs/{level}',
			routedClient: 'vscode-agent-client://client-1/file/-/workspace/file.ts',
			routedHost: resourceUris.fromAgentHost(URI.parse(hostResource)).toString(),
			external: 'https://example.com/file.ts',
			selfContained: 'data:text/plain,example',
			resource: hostResource,
			virtualResource: 'git-blob:/repo/file.ts?ref=main',
		};

		const decoded = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, context.decodeUri(value).toString()]));
		assert.deepStrictEqual({
			decoded,
			encoded: {
				dynamicSession: context.encodeUri(URI.parse(decoded.dynamicSession)),
				routedClient: context.encodeUri(URI.parse(decoded.routedClient)),
				routedHost: context.encodeUri(URI.parse(decoded.routedHost)),
				virtualResource: context.encodeUri(URI.parse(decoded.virtualResource)),
			},
		}, {
			decoded: {
				root: URI.parse(values.root).toString(),
				dynamicSession: URI.parse(values.dynamicSession).toString(),
				chat: URI.parse(values.chat).toString(),
				annotations: URI.parse(values.annotations).toString(),
				otlpTemplate: URI.parse(values.otlpTemplate).toString(),
				routedClient: URI.parse(values.routedClient).toString(),
				routedHost: URI.parse(values.routedHost).toString(),
				external: URI.parse(values.external).toString(),
				selfContained: URI.parse(values.selfContained).toString(),
				resource: resourceUris.fromAgentHost(URI.parse(values.resource)).toString(),
				virtualResource: resourceUris.fromAgentHost(URI.parse(values.virtualResource)).toString(),
			},
			encoded: {
				dynamicSession: values.dynamicSession,
				routedClient: values.routedClient,
				routedHost: hostResource,
				virtualResource: URI.parse(values.virtualResource).toString(),
			},
		});
	});

	test('memoizes native state by immutable wire identity', () => {
		const state: AnnotationsState = { annotations: [] };
		const onDidChange = store.add(new Emitter<AnnotationsState>());
		const onWillApplyAction = store.add(new Emitter<ActionEnvelope>());
		const source: IAgentSubscription<AnnotationsState> = {
			value: state,
			verifiedValue: state,
			onDidChange: onDidChange.event,
			onWillApplyAction: onWillApplyAction.event,
			onDidApplyAction: Event.None,
		};
		let decodeCount = 0;
		const projected = projectAgentSubscriptionObject(source, value => {
			decodeCount++;
			return decodeAnnotationsState(value, context);
		}, envelope => decodeAnnotationsActionEnvelope(envelope, context));
		const projectedActions: { channel: string; resource: string }[] = [];
		store.add(projected.onWillApplyAction(envelope => {
			if (envelope.action.type === ActionType.AnnotationsSet) {
				projectedActions.push({
					channel: envelope.channel.toString(),
					resource: envelope.action.annotation.resource.toString(),
				});
			}
		}));

		assert.strictEqual(projected.value, projected.value);
		assert.strictEqual(projected.verifiedValue, projected.value);
		onWillApplyAction.fire({
			channel: 'copilot:/session-1/annotations',
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.AnnotationsSet,
				annotation: {
					id: 'annotation-1',
					origin: { session: 'copilot:/session-1' },
					resource: 'file:///q%3A/repo/file.ts',
					resolved: false,
					entries: [{ id: 'entry-1', text: 'Review this.' }],
				},
			},
		});
		assert.strictEqual(decodeCount, 1);
		assert.deepStrictEqual(projectedActions, [{
			channel: 'copilot:/session-1/annotations',
			resource: resourceUris.fromAgentHost(URI.parse('file:///q%3A/repo/file.ts')).toString(),
		}]);
	});

	test('does not cache a failed projection', () => {
		const state: AnnotationsState = { annotations: [] };
		const source: IAgentSubscription<AnnotationsState> = {
			value: state,
			verifiedValue: state,
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		let decodeCount = 0;
		const projected = projectAgentSubscriptionObject(source, () => {
			decodeCount++;
			throw new Error('decode failed');
		}, envelope => envelope);

		assert.throws(() => projected.value, /decode failed/);
		assert.throws(() => projected.value, /decode failed/);
		assert.strictEqual(decodeCount, 2);
	});

	test('projects initialize default directory without changing snapshots', () => {
		const snapshots = [{ resource: 'ahp-root://', state: { agents: [], activeSessions: 0 }, fromSeq: 0 }];
		const projected = decodeInitializeResult({
			protocolVersion: '1.0.0',
			serverSeq: 1,
			snapshots,
			defaultDirectory: 'file:///Q:/repo',
		}, context);

		assert.deepStrictEqual({
			defaultDirectory: projected.defaultDirectory?.toString(),
			snapshotsSame: projected.snapshots === snapshots,
		}, {
			defaultDirectory: resourceUris.fromAgentHost(URI.parse('file:///Q:/repo')).toString(),
			snapshotsSame: true,
		});
	});
});
