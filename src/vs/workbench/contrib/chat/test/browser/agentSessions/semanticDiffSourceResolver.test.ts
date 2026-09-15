/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { buildSemanticDiffReport, ISemanticDiffReport } from '../../../../../../platform/agentHost/common/semanticDiff.js';
import { parseSemanticDiffSourceRequest, SemanticDiffSourceRequest } from '../../../../../../platform/agentHost/common/semanticDiffSource.js';
import { ContentEncoding, ResourceReadResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { AgentHostSemanticDiffSourceResolver } from '../../../browser/agentSessions/agentHost/semanticDiffSourceResolver.js';
import { ISemanticDiffEditorRequest } from '../../../common/semanticDiffEditor.js';

suite('AgentHostSemanticDiffSourceResolver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function report(): ISemanticDiffReport {
		const result = buildSemanticDiffReport({
			schemaVersion: 1,
			analysis: {
				source: { repositoryLabel: 'Not a path', comparison: 'commitRange', baseRevision: 'a'.repeat(40), targetRevision: 'b'.repeat(40), diffFingerprint: null, capturedAt: '2026-09-14T00:00:00Z', inventoryComplete: true },
				groups: [{ id: 'g', title: 'Change behavior', description: 'Replace the old behavior with the new behavior.' }],
				files: [{ id: 'f', path: 'a.ts', oldPath: null, status: 'modified', contentKind: 'text' }],
				hunks: [{
					id: 'h', fileId: 'f', oldRange: { start: 1, count: 1 }, newRange: { start: 1, count: 1 }, additions: 1, deletions: 1,
					classification: { groupId: 'g', changeType: 'logic', secondaryChangeTypes: [], summary: 'Change behavior.', groupReason: 'The change implements the behavior.', typeReason: 'The returned behavior changes.', groupConfidence: 'high', typeConfidence: 'high', uncertainty: null },
				}],
				limitations: [],
			},
		});
		assert.ok(result.ok);
		return result.report;
	}

	function harness() {
		const source = { kind: 'file', original: 'old\n', modified: 'new\n', patch: 'diff --git a/a.ts b/a.ts\nindex 1111111..2222222 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n' };
		const connection = new class extends mock<IAgentConnection>() {
			readonly requests: SemanticDiffSourceRequest[] = [];
			repositories = ['file:///repo'];
			fileSource: unknown = source;
			pendingFile: DeferredPromise<ResourceReadResult> | undefined;
			onFileRead: (() => void) | undefined;
			override async resourceRead(uri: URI): Promise<ResourceReadResult> {
				const request = parseSemanticDiffSourceRequest(uri);
				this.requests.push(request);
				if (request.kind === 'file') {
					this.onFileRead?.();
					if (this.pendingFile) {
						return this.pendingFile.p;
					}
				}
				return {
					data: JSON.stringify(request.kind === 'repositories' ? { kind: 'repositories', repositories: this.repositories } : this.fileSource),
					encoding: ContentEncoding.Utf8,
					contentType: 'application/json',
				};
			}
		}();
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			available = true;
			override resolveSessionResource() {
				return this.available ? { connection, connectionAuthority: 'local', backendSession: URI.parse('copilot:/session') } : undefined;
			}
		}();
		const picker = new class extends mock<IQuickInputService>() {
			calls = 0;
			override async pick() { this.calls++; return undefined; }
		}();
		const request: ISemanticDiffEditorRequest = { sessionResource: URI.parse('agent-host-copilot:/session'), responseId: 'response', toolCallId: 'tool', groupId: 'g', report: report() };
		return { connection, connections, picker, request, source, resolver: new AgentHostSemanticDiffSourceResolver(connections, picker, new NullLogService()) };
	}

	test('uses the owning connection and host repository, not the display repository label', async () => {
		const h = harness();
		const result = await h.resolver.resolve(h.request, CancellationToken.None);
		assert.deepStrictEqual({
			repository: result.repository.toString(),
			files: result.files.length,
			requests: h.connection.requests.map(request => ({ kind: request.kind, session: request.sessionUri, repository: request.kind === 'file' ? request.repositoryUri : undefined })),
			picks: h.picker.calls,
		}, {
			repository: 'file:///repo', files: 1,
			requests: [{ kind: 'repositories', session: 'copilot:/session', repository: undefined }, { kind: 'file', session: 'copilot:/session', repository: 'file:///repo' }],
			picks: 0,
		});
	});

	test('requires explicit selection for multiple roots and honors cancellation', async () => {
		const h = harness();
		h.connection.repositories.push('file:///other');
		await assert.rejects(h.resolver.resolve(h.request, CancellationToken.None), isCancellationError);
		assert.deepStrictEqual({ picks: h.picker.calls, requests: h.connection.requests.map(request => request.kind) }, { picks: 1, requests: ['repositories'] });
	});

	test('reuses a bound repository but rejects one no longer owned by the session', async () => {
		const h = harness();
		h.connection.repositories.push('file:///other');
		const result = await h.resolver.resolve({ ...h.request, repositoryUri: 'file:///other' }, CancellationToken.None);
		assert.strictEqual(result.repository.toString(), 'file:///other');
		await assert.rejects(h.resolver.resolve({ ...h.request, repositoryUri: 'file:///outside' }, CancellationToken.None), /no longer available/);
		assert.strictEqual(h.picker.calls, 0);
	});

	test('rejects mutable comparisons before reading any source', async () => {
		const h = harness();
		h.request.report.analysis.source.comparison = 'workingTree';
		h.request.report.analysis.source.targetRevision = null;
		await assert.rejects(h.resolver.resolve(h.request, CancellationToken.None), /snapshot support/);
		assert.deepStrictEqual(h.connection.requests, []);
	});

	test('rejects unavailable hosts instead of reading the local workspace', async () => {
		const h = harness();
		h.connections.available = false;
		await assert.rejects(h.resolver.resolve(h.request, CancellationToken.None), /agent host.*unavailable/);
		assert.deepStrictEqual(h.connection.requests, []);
	});

	test('does not read source declared excluded by the report', async () => {
		const h = harness();
		h.request.report.analysis.limitations.push({ code: 'excludedContent', message: 'Content excluded.', fileId: 'f', hunkId: null });
		h.request.report.status = 'partial';
		await assert.rejects(h.resolver.resolve(h.request, CancellationToken.None), /excluded/);
		assert.deepStrictEqual(h.connection.requests, []);
	});

	test('rejects source that does not match the classified Git hunk', async () => {
		const h = harness();
		h.connection.fileSource = { ...h.source, original: 'different\n' };
		await assert.rejects(h.resolver.resolve(h.request, CancellationToken.None));
	});

	test('cancellation prevents late source completion from resolving the editor', async () => {
		const h = harness();
		const cts = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		h.connection.pendingFile = new DeferredPromise<ResourceReadResult>();
		h.connection.onFileRead = () => { void started.complete(); };
		const resolving = h.resolver.resolve(h.request, cts.token);
		await started.p;
		cts.cancel();
		await assert.rejects(resolving, isCancellationError);
		await h.connection.pendingFile.complete({ data: JSON.stringify(h.source), encoding: ContentEncoding.Utf8, contentType: 'application/json' });
	});
});
