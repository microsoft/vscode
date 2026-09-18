/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel, IResponse } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IComparisonCandidate, IComparisonRun, ISessionComparisonService } from '../../common/comparison.js';

export function createComparisonTestData(states: SessionStatus[] = [SessionStatus.Completed, SessionStatus.Completed]) {
	const statuses = states.map(state => observableValue<SessionStatus>('status', state));
	const sessions = states.map((state, index) => {
		const root = URI.file(`/worktrees/attempt-${index}`);
		const resource = URI.from({ scheme: 'comparison-test', path: `/${index}` });
		return upcastPartial<ISession>({
			resource,
			status: statuses[index],
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{ root, workingDirectory: root, name: `attempt-${index}`, description: undefined }],
			})),
			description: constObservable(state === SessionStatus.NeedsInput ? new MarkdownString('Waiting for permission to run tests') : undefined),
			mainChat: constObservable(upcastPartial<IChat>({ resource })),
			changes: constObservable([
				{ uri: URI.joinPath(root, 'src/parser.ts'), modifiedUri: URI.joinPath(root, 'src/parser.ts'), insertions: 42 + index * 12, deletions: 5 },
				{ uri: URI.joinPath(root, 'test/parser.test.ts'), modifiedUri: URI.joinPath(root, 'test/parser.test.ts'), insertions: 30, deletions: 0 },
			]),
		});
	});
	const candidates: IComparisonCandidate[] = sessions.map((session, index) => ({
		id: `attempt-${index}`, state: 'started', sessionResource: session.resource,
		target: { providerId: 'fixture', sessionTypeId: 'agent', providerLabel: index % 2 ? 'Agent Beta · Local' : 'Agent Alpha · Local', modelId: `model-${index}`, modelLabel: `Model ${String.fromCharCode(65 + index)}` },
	}));
	const initial: IComparisonRun = {
		id: 'comparison-1', createdAt: 1, branch: 'main', folderUri: URI.file('/workspace/parser'),
		prompt: 'Implement a CSV parser that handles quoted fields and escaped quotes. Add tests for malformed input and preserve the existing API.',
		candidates,
	};
	const service = new class extends mock<ISessionComparisonService>() {
		override readonly runs = observableValue<readonly IComparisonRun[]>('runs', [initial]);
		override readonly activeRunId = observableValue<string | undefined>('active', initial.id);
		override getSession(candidate: IComparisonCandidate) { return sessions.find(session => session.resource.toString() === candidate.sessionResource?.toString()); }
		override selectRun(id: string | undefined) { this.activeRunId.set(id, undefined); }
		override prefer(runId: string, candidateId: string) {
			this.runs.set(this.runs.get().map(run => run.id === runId ? { ...run, preferredCandidateId: candidateId } : run), undefined);
		}
	};
	const responses = [
		'Implemented a **single-pass parser** with an explicit state machine.\n\n- Handles quoted fields, escaped quotes, and empty values.\n- Reports malformed input with a column number.\n- Added focused tests for edge cases.\n\nThe implementation keeps the existing API and avoids new dependencies.',
		'Implemented a **tokenizer-based parser** that separates scanning from validation.\n\n- Splits tokenization and field assembly into small helpers.\n- Preserves whitespace inside quoted fields.\n- Adds table-driven tests for invalid rows.\n\nThis approach is a little larger but makes the parsing steps easier to extend.',
	];
	const models = sessions.map((_session, index) => upcastPartial<IChatModel>({
		onDidChange: Event.None,
		getRequests: () => [upcastPartial<IChatRequestModel>({
			isHiddenFromTranscript: false,
			response: upcastPartial<IChatResponseModel>({
				onDidChange: Event.None,
				response: upcastPartial<IResponse>({ getFinalResponse: () => responses[index % responses.length] }),
			}),
		})],
	}));
	let disposedReferences = 0;
	const chatService = new class extends mock<IChatService>() {
		override getSession(resource: URI) {
			return models[sessions.findIndex(session => session.resource.toString() === resource.toString())];
		}
		override async acquireOrLoadSession(resource: URI) {
			const object = this.getSession(resource);
			return object ? { object, dispose: () => { disposedReferences++; } } : undefined;
		}
	};
	return { service, sessions, statuses, chatService, getDisposedReferences: () => disposedReferences };
}
