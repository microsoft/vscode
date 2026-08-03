/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AttributedToolResultFileEditContent, createFileEditContentDigest, EditAttributionFlushOutcome, FILE_EDIT_ATTRIBUTION_PROPERTY, IFileEditAttributionMarker, parseEditAttributionResource } from '../../../../../platform/agentHost/common/fileEditAttribution.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/protocol/common/actions.js';
import { ContentEncoding } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ActionEnvelope } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ToolResultContentType } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { AgentHostEditAttributionDeferredError, AgentHostEditMarkerService } from '../../browser/telemetry/agentHostEditMarkerService.js';

suite('Agent Host Edit Marker Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('suppresses marker-first and reload-first observations', () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);

		context.fireMarker(marker(1, 'a', 'ab'));
		const markerFirst = correlation.register('a', 'ab');
		const reloadFirst = correlation.register('ab', 'abc');
		context.fireMarker(marker(2, 'ab', 'abc'));

		assert.deepStrictEqual({
			markerFirst: correlation.isSuppressed(markerFirst),
			reloadFirst: correlation.isSuppressed(reloadFirst),
			suppressedIds: context.suppressedIds,
		}, {
			markerFirst: true,
			reloadFirst: true,
			suppressedIds: [markerFirst, reloadFirst],
		});
	});

	test('records oversized Agent edits as coverage gaps without suppressing reloads', () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker({
			version: 1,
			editId: 'edit-skipped',
			sequence: 1,
			status: 'skipped',
			reason: 'fileTooLarge',
			insertedCount: 42,
		});

		const observation = correlation.register('a', 'ab');

		assert.deepStrictEqual({
			suppressed: correlation.isSuppressed(observation),
			coverageGap: context.service.takeCoverageGap(context.resource),
		}, {
			suppressed: false,
			coverageGap: {
				editCount: 1,
				insertedCount: 42,
			},
		});
	});

	test('does not report expired coverage gaps', () => runWithFakedTimers({}, async () => {
		const context = createContext();
		context.fireMarker({
			version: 1,
			editId: 'edit-skipped',
			sequence: 1,
			status: 'skipped',
			reason: 'fileTooLarge',
			insertedCount: 42,
		});
		await timeout(10 * 60 * 60 * 1000 + 1);

		assert.strictEqual(context.service.takeCoverageGap(context.resource), undefined);
	}));

	test('matches a connected Agent marker chain to one reload', () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker(marker(1, 'a', 'ab'));
		context.fireMarker(marker(2, 'ab', 'abc'));

		const observation = correlation.register('a', 'abc');

		assert.deepStrictEqual({
			suppressed: correlation.isSuppressed(observation),
			suppressedIds: context.suppressedIds,
		}, {
			suppressed: true,
			suppressedIds: [observation],
		});
	});

	test('does not reuse a completed Agent content cycle', () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker(marker(1, 'a', 'ab'));
		context.fireMarker(marker(2, 'ab', 'a'));

		const unrelatedObservation = correlation.register('a', 'ab');

		assert.deepStrictEqual({
			suppressed: correlation.isSuppressed(unrelatedObservation),
			suppressedIds: context.suppressedIds,
		}, {
			suppressed: false,
			suppressedIds: [],
		});
	});

	test('invalidates old suppressions when the Agent Host sequence restarts', () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker(marker(5, 'a', 'ab'));
		const oldObservation = correlation.register('a', 'ab');

		context.fireMarker(marker(1, 'ab', 'abc'));
		const newObservation = correlation.register('ab', 'abc');

		assert.deepStrictEqual({
			oldSuppressed: correlation.isSuppressed(oldObservation),
			newSuppressed: correlation.isSuppressed(newObservation),
			invalidatedIds: context.invalidatedIds,
		}, {
			oldSuppressed: false,
			newSuppressed: true,
			invalidatedIds: [oldObservation],
		});
	});

	test('does not suppress with an expired marker', () => runWithFakedTimers({}, async () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker(marker(1, 'a', 'ab'));
		await timeout(5 * 60 * 1000 + 1);

		const observation = correlation.register('a', 'ab');

		assert.strictEqual(correlation.isSuppressed(observation), false);
	}));

	test('does not coordinate with an expired route', () => runWithFakedTimers({}, async () => {
		const context = createContext();
		const correlation = context.service.createCorrelation(context.resource);
		context.fireMarker(marker(1, 'a', 'ab'));
		const observation = correlation.register('a', 'ab');
		await timeout(10 * 60 * 60 * 1000 + 1);

		const prepared = await context.service.prepareFlush(context.resource, 'hashChange', 'stats-1', false);

		assert.deepStrictEqual({
			prepared,
			suppressed: correlation.isSuppressed(observation),
			invalidatedIds: context.invalidatedIds,
			resourceReads: context.resourceReads,
		}, {
			prepared: undefined,
			suppressed: false,
			invalidatedIds: [observation],
			resourceReads: [],
		});
	}));

	test('matches ambient remote model URIs to Agent Host file markers', () => {
		const context = createContext();
		const remoteResource = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: 'ssh-remote+example',
			path: context.resource.path,
		});
		const correlation = context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const observation = correlation.register('a', 'ab');

		assert.strictEqual(correlation.isSuppressed(observation), true);
	});

	test('coordinates flushes through a non-ambient remote connection', async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one' });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);
		await prepared?.commit(5);

		assert.deepStrictEqual({
			prepared: prepared && {
				flushTokenLength: prepared.flushToken.length,
				agentModifiedCount: prepared.agentModifiedCount,
			},
			resourceReads: context.resourceReads,
		}, {
			prepared: {
				flushTokenLength: 36,
				agentModifiedCount: 2,
			},
			resourceReads: ['/prepare', '/commit'],
		});
	});

	test('waits for the prepared Agent marker before coordinating', async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one', prepareSequence: 2 });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const prepare = context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);
		await timeout(0);
		context.fireMarker(marker(2, 'ab', 'abc'));
		const prepared = await prepare;

		assert.deepStrictEqual({
			agentModifiedCount: prepared?.agentModifiedCount,
			resourceReads: context.resourceReads,
		}, {
			agentModifiedCount: 2,
			resourceReads: ['/prepare'],
		});
	});

	test('cancels a prepared flush when the commit transport fails', async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one', failCommit: true });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);
		await assert.rejects(() => prepared!.commit(5), error => error instanceof AgentHostEditAttributionDeferredError);

		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/commit', '/cancel']);
	});

	test('times out a stalled prepare request', () => runWithFakedTimers({}, async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one', stalledResources: ['/prepare'] });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const result = context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);
		await timeout(15_001);

		await assert.rejects(result, error => error instanceof AgentHostEditAttributionDeferredError);
		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/cancel']);
	}));

	test('uses a committed cancellation result after prepare fails', async () => {
		const context = createContext({
			isAmbient: false,
			authority: 'remote-one',
			failPrepare: true,
			cancelOutcome: 'committed',
		});
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);
		await prepared!.commit(5);

		assert.deepStrictEqual({
			agentModifiedCount: prepared?.agentModifiedCount,
			resourceReads: context.resourceReads,
		}, {
			agentModifiedCount: 2,
			resourceReads: ['/prepare', '/cancel'],
		});
	});

	test('cancels a malformed prepared response', async () => {
		const context = createContext({
			isAmbient: false,
			authority: 'remote-one',
			prepareResponse: '{',
		});
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const result = context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);

		await assert.rejects(result, error => error instanceof AgentHostEditAttributionDeferredError);
		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/cancel']);
	});

	test('cancels a prepared response with an unexpected token', async () => {
		const context = createContext({
			isAmbient: false,
			authority: 'remote-one',
			prepareResponse: JSON.stringify({ flushToken: 'unexpected', agentModifiedCount: 2 }),
		});
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));

		const result = context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);

		await assert.rejects(result, error => error instanceof AgentHostEditAttributionDeferredError);
		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/cancel']);
	});

	test('times out a stalled commit request and cancels the flush', () => runWithFakedTimers({}, async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one', stalledResources: ['/commit'] });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));
		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);

		const result = prepared!.commit(5);
		await timeout(15_001);

		await assert.rejects(result, error => error instanceof AgentHostEditAttributionDeferredError);
		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/commit', '/cancel']);
	}));

	test('accepts a commit that completed before cancellation', async () => {
		const context = createContext({ isAmbient: false, authority: 'remote-one', failCommit: true, cancelOutcome: 'committed' });
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));
		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);

		await prepared!.commit(5);

		assert.deepStrictEqual(context.resourceReads, ['/prepare', '/commit', '/cancel']);
	});

	test('does not fall back when commit and cancellation outcomes are unknown', () => runWithFakedTimers({}, async () => {
		const context = createContext({
			isAmbient: false,
			authority: 'remote-one',
			stalledResources: ['/commit', '/cancel'],
		});
		const remoteResource = toAgentHostUri(context.resource, 'remote-one');
		context.service.createCorrelation(remoteResource);
		context.fireMarker(marker(1, 'a', 'ab'));
		const prepared = await context.service.prepareFlush(remoteResource, 'hashChange', 'stats-1', false);

		const result = prepared!.commit(5);
		await timeout(15_001);
		await timeout(15_001);

		await assert.rejects(result, /outcome is unknown/);
	}));

	function createContext(options: {
		readonly isAmbient?: boolean;
		readonly authority?: string;
		readonly failPrepare?: boolean;
		readonly failCommit?: boolean;
		readonly stalledResources?: readonly string[];
		readonly cancelOutcome?: EditAttributionFlushOutcome;
		readonly prepareResponse?: string;
		readonly prepareSequence?: number;
	} = {}) {
		const {
			isAmbient = true,
			authority = 'local',
			failPrepare = false,
			failCommit = false,
			stalledResources = [],
			cancelOutcome = 'cancelled',
			prepareResponse,
			prepareSequence,
		} = options;
		const actionEmitter = disposables.add(new Emitter<ActionEnvelope>());
		const resourceReads: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		const connection = instantiationService.stub(IAgentHostService, {
			onDidAction: actionEmitter.event,
			async resourceRead(resource: URI) {
				resourceReads.push(resource.path);
				if (stalledResources.includes(resource.path)) {
					return new Promise<never>(() => { });
				}
				if (failPrepare && resource.path === '/prepare') {
					throw new Error('Prepare failed');
				}
				if (failCommit && resource.path === '/commit') {
					throw new Error('Commit failed');
				}
				const request = parseEditAttributionResource(resource);
				return {
					data: resource.path === '/prepare'
						? prepareResponse ?? JSON.stringify({
							flushToken: request?.kind === 'prepare' ? request.params.flushToken : '',
							agentModifiedCount: 2,
							lastSequence: prepareSequence,
						})
						: JSON.stringify({
							outcome: resource.path === '/commit' ? 'committed' : cancelOutcome,
							agentModifiedCount: resource.path === '/commit' || cancelOutcome === 'committed' ? 2 : 0,
						}),
					encoding: ContentEncoding.Utf8,
				};
			},
		});
		instantiationService.stub(IAgentHostConnectionsService, {
			onDidChangeConnections: Event.None,
			connections: [{
				authority,
				address: isAmbient ? undefined : 'remote',
				name: isAmbient ? 'Local' : 'Remote',
				isAmbient,
				connection,
			}],
		});
		instantiationService.stub(IUriIdentityService, { extUri, asCanonicalUri: resource => resource });
		const service = disposables.add(instantiationService.createInstance(AgentHostEditMarkerService));
		const resource = URI.file('C:\\repo\\file.ts');
		const suppressedIds: string[] = [];
		const invalidatedIds: string[] = [];
		const correlation = service.createCorrelation(resource);
		disposables.add(correlation.onDidSuppress(id => suppressedIds.push(id)));
		disposables.add(correlation.onDidInvalidate(id => invalidatedIds.push(id)));
		return {
			resource,
			service,
			suppressedIds,
			invalidatedIds,
			resourceReads,
			fireMarker(attribution: IFileEditAttributionMarker) {
				const content: AttributedToolResultFileEditContent = {
					type: ToolResultContentType.FileEdit,
					before: {
						uri: resource.toString(),
						content: { uri: 'session-db:/before' },
					},
					after: {
						uri: resource.toString(),
						content: { uri: 'session-db:/after' },
					},
					[FILE_EDIT_ATTRIBUTION_PROPERTY]: attribution,
				};
				actionEmitter.fire({
					channel: 'ahp-chat:copilot%3A%2Fsession',
					serverSeq: attribution.sequence,
					origin: undefined,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: 'turn-1',
						toolCallId: `tool-${attribution.sequence}`,
						result: {
							success: true,
							pastTenseMessage: '',
							content: [content],
						},
					},
				});
			},
		};
	}
});

function marker(sequence: number, before: string, after: string): IFileEditAttributionMarker {
	return {
		version: 1,
		editId: `edit-${sequence}`,
		sequence,
		beforeDigest: createFileEditContentDigest(before),
		afterDigest: createFileEditContentDigest(after),
	};
}
