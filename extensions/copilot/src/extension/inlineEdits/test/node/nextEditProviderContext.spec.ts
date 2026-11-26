/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { NullGitExtensionService } from '../../../../platform/git/common/nullGitExtensionService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { NullInlineEditsModelService } from '../../../../platform/inlineEdits/common/inlineEditsModelService';
import { ObservableGit } from '../../../../platform/inlineEdits/common/observableGit';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { EditStreamingWithTelemetry, IStatelessNextEditProvider, NoNextEditReason, StatelessNextEditRequest, StatelessNextEditTelemetryBuilder, WithStatelessProviderTelemetry } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { NesHistoryContextProvider } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { LogServiceImpl } from '../../../../platform/log/common/logService';
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { NullSnippyService } from '../../../../platform/snippy/common/snippyService';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { mockNotebookService } from '../../../../platform/test/common/testNotebookService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { Result } from '../../../../util/common/result';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { posix } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { NextEditProvider } from '../../node/nextEditProvider';
import { NextEditProviderTelemetryBuilder } from '../../node/nextEditProviderTelemetry';

/** Records every request and never suggests anything. */
class RequestCapturingProvider implements IStatelessNextEditProvider {
	public readonly ID = 'RequestCapturingProvider';
	public readonly requests: StatelessNextEditRequest[] = [];

	public async *provideNextEdit(request: StatelessNextEditRequest): EditStreamingWithTelemetry {
		this.requests.push(request);
		const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, undefined);
		return new WithStatelessProviderTelemetry(noSuggestions, new StatelessNextEditTelemetryBuilder(request.headerRequestId).build(Result.error(noSuggestions)));
	}
}

describe('NextEditProvider context', () => {

	let disposables: DisposableStore;
	let configService: IConfigurationService;

	beforeEach(async () => {
		disposables = new DisposableStore();
		configService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, 0);
	});

	afterEach(() => {
		disposables.dispose();
	});

	it('sends files that commonly hold secrets only in requests for themselves', async () => {
		const gitExtensionService = new NullGitExtensionService();
		const expService = new NullExperimentationService();
		const workspace = new MutableObservableWorkspace();
		const provider = new RequestCapturingProvider();
		const nextEditProvider = disposables.add(new NextEditProvider(
			workspace,
			provider,
			new NesHistoryContextProvider(workspace, disposables.add(new ObservableGit(gitExtensionService))),
			new NesXtabHistoryTracker(workspace, undefined, configService, expService),
			undefined,
			new NullInlineEditsModelService(),
			configService,
			new NullSnippyService(),
			new LogServiceImpl([]),
			expService,
			new NullRequestLogger(),
		));

		const editDocument = (uri: string) => {
			const doc = workspace.addDocument({ id: DocumentId.create(uri), initialValue: 'a\nb\n' });
			doc.setSelection([new OffsetRange(1, 1)], undefined);
			doc.applyEdit(StringEdit.insert(1, 'x'));
			return doc.id;
		};
		const envId = editDocument(URI.file('/w/.env').toString());
		editDocument('vscode-userdata:/User/settings.json');
		const tsId = editDocument(URI.file('/w/a.ts').toString());

		const requestContext = async (docId: DocumentId) => {
			const context = { triggerKind: 1, selectedCompletionInfo: undefined, requestUuid: generateUuid(), requestIssuedDateTime: Date.now(), earliestShownDateTime: Date.now() };
			const telemetryBuilder = new NextEditProviderTelemetryBuilder(gitExtensionService, mockNotebookService, disposables.add(new TestWorkspaceService()), nextEditProvider.ID, undefined);
			try {
				await nextEditProvider.getNextEdit(docId, context, new InlineEditRequestLogContext(docId.toString(), 1, context), CancellationToken.None, telemetryBuilder.nesBuilder);
			} finally {
				telemetryBuilder.dispose();
			}
			const request = provider.requests.at(-1)!;
			const names = (ids: readonly DocumentId[]) => ids.map(id => posix.basename(id.path));
			return {
				documents: names(request.documents.map(d => d.id)),
				editHistory: names(request.xtabEditHistory.map(e => e.docId)),
			};
		};

		expect({
			'a.ts': await requestContext(tsId),
			'.env': await requestContext(envId),
		}).toEqual({
			'a.ts': {
				documents: ['settings.json', 'a.ts'],
				editHistory: ['settings.json', 'a.ts'],
			},
			'.env': {
				documents: ['.env', 'settings.json', 'a.ts'],
				editHistory: ['.env', 'settings.json', 'a.ts'],
			},
		});
	});
});
