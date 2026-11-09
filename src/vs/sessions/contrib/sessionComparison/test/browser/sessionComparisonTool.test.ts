/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILanguageModelToolsService, IToolData, IToolResult, ToolProgress, ToolSet } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { COMPARE_AGENTS_ENABLED_SETTING, ISessionComparison, ISessionComparisonService, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationSource, SessionComparisonValidationState } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { hashSessionIdForTelemetry } from '../../../../../workbench/contrib/sessions/common/sessionsTelemetry.js';
import { CompleteSessionComparisonTool, ReadSessionComparisonTool, SessionComparisonToolContribution } from '../../browser/sessionComparisonTool.js';

const progress: ToolProgress = { report: () => { } };
const attemptResource = URI.parse('test:/attempt');
const thirdAttemptResource = URI.parse('test:/attempt-three');
const attemptChatResource = URI.parse('test-chat:/attempt');
const judgeResource = URI.parse('test:/judge');
const synthesisResource = URI.parse('test:/synthesis');

function stubComparisonService(overrides: Partial<ISessionComparisonService>): ISessionComparisonService {
	return upcastPartial<ISessionComparisonService>({
		getParticipantForChat: (id, resource) => overrides.getComparison?.(id)?.participants.find(participant =>
			(participant.chatResource ?? participant.sessionResource)?.toString() === resource.toString()),
		...overrides,
	});
}

suite('SessionComparisonTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes comparison tools only while setup is enabled or comparisons remain', async () => {
		const registeredTools = new Set<string>();
		const toolsService = new class extends mock<ILanguageModelToolsService>() {
			override createToolSet() {
				return upcastPartial<ToolSet & IDisposable>({
					addTool: () => toDisposable(() => { }),
					dispose: () => { },
				});
			}
			override registerTool(toolData: IToolData) {
				registeredTools.add(toolData.id);
				return toDisposable(() => registeredTools.delete(toolData.id));
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', []);
		const comparisonService = stubComparisonService({ comparisons });
		const configurationService = new TestConfigurationService({ [COMPARE_AGENTS_ENABLED_SETTING]: false });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(ISessionComparisonService, comparisonService);
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		store.add(new SessionComparisonToolContribution(toolsService, instantiationService, comparisonService, configurationService));
		const disabledIds = [...registeredTools];
		await configurationService.setUserConfiguration(COMPARE_AGENTS_ENABLED_SETTING, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === COMPARE_AGENTS_ENABLED_SETTING,
		}));
		const enabledIds = [...registeredTools];
		await configurationService.setUserConfiguration(COMPARE_AGENTS_ENABLED_SETTING, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === COMPARE_AGENTS_ENABLED_SETTING,
		}));
		comparisons.set([stubComparison()], undefined);
		const restoredIds = [...registeredTools];
		comparisons.set([{ ...stubComparison(), archivedAt: 1 }], undefined);
		const removedIds = [...registeredTools];

		assert.deepStrictEqual({
			disabledIds,
			enabledIds,
			restoredIds,
			removedIds,
		}, {
			disabledIds: [],
			enabledIds: ['vscode_readAttemptComparison', 'vscode_completeAttemptComparison'],
			restoredIds: ['vscode_readAttemptComparison', 'vscode_completeAttemptComparison'],
			removedIds: [],
		});
	});

	test('describes the manifest-first evidence flow', () => {
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({}),
			upcastPartial<ISessionsManagementService>({}),
		);

		assert.deepStrictEqual({
			referenceName: tool.getToolData().toolReferenceName,
			manifestFirst: tool.getToolData().modelDescription.includes('before inspecting individual transcripts'),
			folderlessResponses: tool.getToolData().modelDescription.includes('read and compare responses using get_session_context with the exact manifest targets'),
			worktreeEvidence: tool.getToolData().modelDescription.includes('Read implementation code only from the listed worktrees'),
			validationReuse: tool.getToolData().modelDescription.includes('never rerun a validation category with a clear reported result'),
		}, {
			referenceName: 'readAttemptComparison',
			manifestFirst: true,
			folderlessResponses: true,
			worktreeEvidence: true,
			validationReuse: true,
		});
	});

	test('folderless manifests direct response review through exact transcript targets', () => {
		const attempt = stubAttemptSession();
		const session = { ...attempt, workspace: constObservable(undefined) };
		const tool = new ReadSessionComparisonTool(stubComparisonService({}), upcastPartial<ISessionsManagementService>({
			getSession: resource => resource.toString() === attemptResource.toString() ? session : undefined,
			getSessionContextReference: () => 'agent-host-session://copilot/attempt',
		}));
		const manifest = tool.getManifest({ ...stubComparison(), workspace: undefined, branch: undefined }, session);
		assert.deepStrictEqual({
			target: manifest.attempts[0].sessionContextTarget,
			worktree: manifest.attempts[0].worktree,
			readsResponses: manifest.next?.includes('Read every completed attempt response using get_session_context'),
			noDiffRequired: manifest.next?.includes('No worktree or Git diff is required'),
			noFabricatedResponse: manifest.next?.includes('without guessing its content'),
			pagesCompleteResponse: manifest.next?.includes('follow nextResponseOffset until truncated is false'),
			noPartialReview: manifest.next?.includes('Do not treat an excerpt as a fully reviewed answer'),
			inapplicableValidation: manifest.next?.includes('notApplicable for both state and source'),
		}, {
			target: 'agent-host-session://copilot/attempt', worktree: undefined, readsResponses: true,
			noDiffRequired: true, noFabricatedResponse: true, pagesCompleteResponse: true, noPartialReview: true, inapplicableValidation: true,
		});
	});

	test('requires concise rationale without custom synthesis decisions', () => {
		const tool = new CompleteSessionComparisonTool(stubComparisonService({}));
		const data = tool.getToolData();
		const schema = JSON.stringify(data.inputSchema);

		assert.deepStrictEqual({
			description: data.modelDescription.includes('semantic decision sections'),
			categorizedRationale: data.modelDescription.includes('exactly one concise rationale point'),
			required: data.inputSchema?.required?.includes('decisionSections'),
			rationaleRequired: data.inputSchema?.required?.includes('rationale'),
			rationaleCategories: schema.includes('"required":["comparison","validation","codeQuality","solution"]'),
			rationaleLength: schema.includes(`"maxLength":180`),
			assessmentRequired: schema.includes('"required":["attemptNumber","approach","assessment"]'),
			assessmentValues: schema.includes('"enum":["better","neutral","worse"]'),
		}, {
			description: false,
			categorizedRationale: true,
			required: false,
			rationaleRequired: true,
			rationaleCategories: true,
			rationaleLength: true,
			assessmentRequired: false,
			assessmentValues: false,
		});
	});

	test('returns bounded evidence and exact session context targets to the Judge', async () => {
		const base = stubComparison();
		const comparison: ISessionComparison = {
			...base,
			participants: base.participants.map(participant => participant.role === SessionComparisonParticipantRole.Attempt ? {
				...participant,
				harness: { ...participant.harness, modelConfiguration: { thinkingLevel: 'high' }, permissionId: 'bypassPermissions', permissionLabel: 'Bypass Permissions' },
			} : participant),
		};
		const session = stubAttemptSession();
		const workingDirectory = URI.file('/workspace').fsPath;
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({
				getComparison: id => id === comparison.id ? comparison : undefined,
			}),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === attemptResource.toString()
					? session
					: resource.toString() === judgeResource.toString()
						? upcastPartial<ISession>({ providerId: 'provider' })
						: undefined,
				getSessionContextReference: resource => resource.toString() === attemptChatResource.toString()
					? 'agent-host-session://copilot/attempt'
					: undefined,
			}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, judgeResource);

		assert.deepStrictEqual(JSON.parse(getText(result)), {
			comparisonId: 'comparison',
			originalTask: 'Implement the feature',
			baseBranch: 'main',
			attempts: [{
				attemptNumber: 1,
				label: 'Attempt 1 (Copilot · Claude · High)',
				harness: { agent: 'Copilot', model: 'Claude', reasoningEffort: 'high', permissions: { id: 'bypassPermissions', label: 'Bypass Permissions' } },
				status: 'completed',
				sessionContextTarget: 'agent-host-session://copilot/attempt',
				worktree: {
					workingDirectory,
					folders: [workingDirectory],
				},
				changesSummary: { files: 1, additions: 3, deletions: 1 },
				changedFiles: [{
					resource: 'file:///workspace/src/example.ts',
					insertions: 3,
					deletions: 1,
				}],
				changedFilesStatus: 'available',
				changedFilesTruncated: false,
			}],
			next: 'Review every completed attempt diff in its authoritative worktree and treat error as failed and inProgress or needsInput as unfinished. Terminal commands start in this Judge or synthesis worktree, not an attempt worktree: explicitly cd to the exact attempt worktree.workingDirectory in every command that inspects or validates it. When changedFilesStatus is unavailable, read the Git diff from that worktree instead. Use get_session_context with an exact attempt sessionContextTarget to identify validation the attempt already completed and for rationale or other non-code evidence; never recover implementation code or paths from a transcript. Do not rerun a validation category with a clear reported result. Run only missing targeted validation when needed. If required dependencies or build artifacts are unavailable, record validation as unavailable without installing or building dependencies or substituting another validation category. Record each validation category as a consistent state and source pair. Submit verdict references using the manifest attemptNumber values; do not copy participant or session UUIDs. During synthesis, resolve every reported conflict and treat synthesisPlan instructions as explicit user requirements. Resolve dependencies coherently rather than copying hunks mechanically. Do not modify any attempt, inspect another checkout, discover sessions, guess references, or create sessions.',
		});
	});

	test('accepts hashed comparison identifiers in Judge reads', async () => {
		const comparison = stubComparison();
		const hashedId = hashSessionIdForTelemetry(comparison.id);
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({
				getComparison: id => id === comparison.id ? comparison : undefined,
				comparisons: constObservable([comparison]),
			}),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === attemptResource.toString()
					? stubAttemptSession()
					: resource.toString() === judgeResource.toString()
						? upcastPartial<ISession>({ providerId: 'provider' })
						: undefined,
				getSessionContextReference: () => undefined,
			}),
		);

		const result = JSON.parse(getText(await invoke(tool, { comparisonId: hashedId }, judgeResource)));

		assert.deepStrictEqual({
			comparisonId: result.comparisonId,
			attemptCount: result.attempts.length,
		}, {
			comparisonId: comparison.id,
			attemptCount: 1,
		});
	});

	test('nested participants authorize the exact Judge chat and read each attempt workspace and status', async () => {
		const base = stubComparison();
		const parentResource = URI.parse('test:/parent');
		const judgeChat = parentResource.with({ fragment: 'judge' });
		const attempt = stubAttemptSession();
		const chat = {
			...attempt.mainChat.get(),
			workspace: attempt.workspace,
			changesSummary: attempt.changesSummary,
			modelId: constObservable('nested-model'),
		};
		const comparison: ISessionComparison = {
			...base, sessionResource: parentResource,
			participants: base.participants.map(participant => ({
				...participant, sessionResource: parentResource,
				chatResource: participant.role === SessionComparisonParticipantRole.Judge ? judgeChat : chat.resource,
			})),
		};
		const parent = upcastPartial<ISession>({
			resource: parentResource, providerId: 'provider', chats: constObservable([chat]),
			status: constObservable(SessionStatus.InProgress), workspace: constObservable(undefined),
		});
		const service = stubComparisonService({ getComparison: () => comparison });
		const tool = new ReadSessionComparisonTool(service, upcastPartial<ISessionsManagementService>({
			getSession: () => parent, getSessionContextReference: resource => resource.toString(),
		}));
		const denied = await invoke(tool, { comparisonId: comparison.id }, chat.resource);
		const manifest = JSON.parse(getText(await invoke(tool, { comparisonId: comparison.id }, judgeChat)));
		assert.deepStrictEqual({
			denied: getText(denied),
			attempts: manifest.attempts.map((entry: { status: string; sessionContextTarget: string; worktree: { workingDirectory: string }; harness: { currentModelId: string } }) => ({
				status: entry.status, target: entry.sessionContextTarget, folder: entry.worktree.workingDirectory, model: entry.harness.currentModelId,
			})),
		}, {
			denied: 'Only the Judge or synthesis session for this comparison can read its manifest.',
			attempts: [{ status: 'completed', target: chat.resource.toString(), folder: URI.file('/workspace').fsPath, model: 'nested-model' }],
		});
	});

	test('omits cumulative default-chat summaries but retains peer-chat summaries', async () => {
		const base = stubComparison();
		const attempt = stubAttemptSession();
		const main = { ...attempt.mainChat.get(), workspace: attempt.workspace, changes: constObservable([]), changesSummary: constObservable({ files: 9, additions: 100, deletions: 20 }) };
		const peer = { ...main, resource: main.resource.with({ fragment: 'peer' }), changesSummary: constObservable({ files: 0, additions: 0, deletions: 0 }) };
		const parent = { ...attempt, mainChat: constObservable(main), chats: constObservable([main, peer]) };
		const participant = base.participants.find(participant => participant.role === SessionComparisonParticipantRole.Attempt)!;
		const judge = base.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge)!;
		const comparison = {
			...base,
			participants: [...[main, peer].map((chat, index) => ({
				...participant, id: `attempt-${index}`, sessionResource: parent.resource, chatResource: chat.resource,
			})), judge],
		};
		const tool = new ReadSessionComparisonTool(stubComparisonService({ getComparison: () => comparison }), upcastPartial<ISessionsManagementService>({
			getSession: () => parent, getSessionContextReference: resource => resource.toString(),
		}));
		const manifest = JSON.parse(getText(await invoke(tool, { comparisonId: comparison.id }, judge.sessionResource!)));
		assert.deepStrictEqual(manifest.attempts.map((entry: { changesSummary?: object; changedFilesStatus: string }) => ({
			summary: entry.changesSummary, files: entry.changedFilesStatus,
		})), [{ summary: undefined, files: 'unavailable' }, { summary: { files: 0, additions: 0, deletions: 0 }, files: 'noChanges' }]);
	});

	test('uses the exact live participant binding for moved evaluator manifest and verdict calls', async () => {
		const comparison = stubComparison();
		const originalJudge = URI.parse('test:/original-judge');
		const originalAttempt = URI.parse('test:/original-attempt');
		let submitted: ISessionComparisonVerdict | undefined;
		const service = stubComparisonService({
			getComparison: () => comparison,
			getParticipantForChat: (_id, resource) => comparison.participants.find(participant =>
				participant.role === (resource.toString() === originalJudge.toString() ? SessionComparisonParticipantRole.Judge : SessionComparisonParticipantRole.Attempt)),
			submitVerdict: (_id, verdict) => submitted = verdict,
		});
		const readTool = new ReadSessionComparisonTool(service, upcastPartial<ISessionsManagementService>({ getSession: () => undefined }));
		const completeTool = new CompleteSessionComparisonTool(service);
		const manifest = JSON.parse(getText(await invoke(readTool, { comparisonId: comparison.id }, originalJudge)));
		const input = {
			comparisonId: comparison.id, recommendedAttemptNumber: 1, explanation: 'The attempt is correct.',
			rationale: rationaleInput(), conflicts: [],
			attempts: [{
				attemptNumber: 1, summary: 'Complete.',
				validation: { tests: passedEvidence(), build: passedEvidence(), lint: passedEvidence(), diagnostics: passedEvidence() },
				unresolvedIssues: [], notableDifferences: [],
			}],
		};
		const accepted = JSON.parse(getText(await invoke(completeTool, input, originalJudge)));
		const denied = await invoke(completeTool, input, originalAttempt);
		assert.deepStrictEqual({
			manifest: manifest.comparisonId,
			accepted,
			denied: getText(denied),
			recommended: submitted?.recommendedParticipantId,
		}, {
			manifest: comparison.id,
			accepted: { status: 'submitted', comparisonId: comparison.id },
			denied: 'Only the judge session for this comparison can submit its verdict.',
			recommended: 'attempt',
		});
	});

	for (const scenario of [
		{ name: 'changed model', initialModelId: 'original', currentModelId: 'replacement', sessionAvailable: true, differs: true },
		{ name: 'unchanged model', initialModelId: 'original', currentModelId: 'original', sessionAvailable: true, differs: false },
		{ name: 'unavailable current model', initialModelId: 'original', currentModelId: undefined, sessionAvailable: true, differs: undefined },
		{ name: 'unavailable initial model', initialModelId: undefined, currentModelId: 'replacement', sessionAvailable: true, differs: undefined },
		{ name: 'unavailable session', initialModelId: 'original', currentModelId: undefined, sessionAvailable: false, differs: undefined },
	]) {
		test(`reports the current attempt model without changing its launch configuration: ${scenario.name}`, async () => {
			const base = stubComparison();
			const comparison: ISessionComparison = {
				...base,
				participants: base.participants.map(participant => participant.role === SessionComparisonParticipantRole.Attempt ? {
					...participant,
					harness: { ...participant.harness, modelId: scenario.initialModelId, modelConfiguration: { thinkingLevel: 'high' } },
				} : participant),
			};
			const session = stubAttemptSession();
			const currentModelId = observableValue<string | undefined>('currentModelId', scenario.initialModelId);
			const attemptSession: ISession = {
				...session,
				modelId: constObservable('another-chat-model'),
				mainChat: constObservable({ ...session.mainChat.get(), modelId: currentModelId }),
			};
			const tool = new ReadSessionComparisonTool(
				stubComparisonService({ getComparison: () => comparison }),
				upcastPartial<ISessionsManagementService>({
					getSession: resource => resource.toString() === attemptResource.toString() && scenario.sessionAvailable ? attemptSession : undefined,
					getSessionContextReference: () => undefined,
				}),
			);
			currentModelId.set(scenario.currentModelId, undefined);

			const result = JSON.parse(getText(await invoke(tool, { comparisonId: comparison.id }, judgeResource)));
			const harness = result.attempts[0].harness;
			assert.deepStrictEqual({
				model: harness.model,
				modelId: harness.modelId,
				currentModelId: harness.currentModelId,
				reasoningEffort: harness.reasoningEffort,
				modelSelectionDiffers: harness.modelSelectionDiffers,
				warnsAboutAttribution: harness.modelSelectionWarning?.includes('avoid attributing the entire attempt to one model'),
				distinguishesSelectionFromUsage: harness.modelSelectionWarning?.includes('not a history of models actually used'),
				launchModelId: comparison.participants[0].harness.modelId,
			}, {
				model: 'Claude',
				modelId: scenario.initialModelId,
				currentModelId: scenario.currentModelId,
				reasoningEffort: 'high',
				modelSelectionDiffers: scenario.differs,
				warnsAboutAttribution: scenario.differs ? true : undefined,
				distinguishesSelectionFromUsage: scenario.differs ? true : undefined,
				launchModelId: scenario.initialModelId,
			});
		});
	}

	test('returns the user synthesis plan to the synthesis participant', async () => {
		const base = stubComparison();
		const comparison = {
			...base,
			verdict: {
				recommendedParticipantId: 'attempt',
				explanation: 'Use the attempt.',
				conflicts: [],
				attempts: [],
			},
			synthesisPlan: {
				instructions: 'Preserve the public API and add focused tests.',
			},
			participants: [...base.participants, {
				id: 'synthesis',
				role: SessionComparisonParticipantRole.Synthesis,
				harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
				sessionResource: synthesisResource,
			}],
		} satisfies ISessionComparison;
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === attemptResource.toString()
					? stubAttemptSession()
					: resource.toString() === synthesisResource.toString()
						? upcastPartial<ISession>({ providerId: 'provider' })
						: undefined,
				getSessionContextReference: () => undefined,
			}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, synthesisResource);

		assert.deepStrictEqual(JSON.parse(getText(result)).synthesisPlan, {
			instructions: 'Preserve the public API and add focused tests.',
		});
	});

	test('returns a bounded verdict with configured attempt numbers to synthesis', async () => {
		const base = stubComparison();
		const firstAttempt = base.participants[0];
		const thirdAttempt = {
			...firstAttempt,
			id: 'attempt-three',
			sessionResource: thirdAttemptResource,
		};
		const comparison: ISessionComparison = {
			...base,
			participants: [
				firstAttempt,
				{
					...firstAttempt,
					id: 'attempt-two',
					sessionResource: undefined,
					launchError: 'provider unavailable',
				},
				thirdAttempt,
				{
					id: 'synthesis',
					role: SessionComparisonParticipantRole.Synthesis,
					harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
					sessionResource: synthesisResource,
				},
			],
			verdict: {
				recommendedParticipantId: thirdAttempt.id,
				explanation: 'Attempt three is strongest.',
				rationale: rationaleInput(),
				conflicts: ['x'.repeat(1001)],
				attempts: [firstAttempt, thirdAttempt].map(participant => ({
					participantId: participant.id,
					summary: `${participant.id} summary`,
					validation: {
						tests: passedEvidence(),
						build: passedEvidence(),
						lint: passedEvidence(),
						diagnostics: passedEvidence(),
					},
					unresolvedIssues: [`${participant.id} issue`],
					notableDifferences: [`${participant.id} difference`],
				})),
			},
		};
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({
				getSession: resource => resource.toString() === synthesisResource.toString()
					? upcastPartial<ISession>({ providerId: 'provider' })
					: stubAttemptSession(),
				getSessionContextReference: () => undefined,
			}),
		);

		const result = JSON.parse(getText(await invoke(tool, { comparisonId: comparison.id }, synthesisResource)));

		assert.deepStrictEqual({
			attemptNumbers: result.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber),
			recommendedAttemptNumber: result.verdict.recommendedAttemptNumber,
			conflictLength: result.verdict.conflicts[0].length,
			verdictAttemptNumbers: result.verdict.attempts.map((attempt: { attemptNumber: number }) => attempt.attemptNumber),
		}, {
			attemptNumbers: [1, 3],
			recommendedAttemptNumber: 3,
			conflictLength: 1000,
			verdictAttemptNumbers: [1, 3],
		});
	});

	test('accepts validation categories that do not apply', async () => {
		const comparison = stubComparison();
		let submitted: ISessionComparisonVerdict | undefined;
		const tool = new CompleteSessionComparisonTool(stubComparisonService({
			getComparison: () => comparison,
			submitVerdict: (_comparisonId, verdict) => submitted = verdict,
		}));

		const input = {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'No implementation changes were needed.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Completed the requested inspection without changing code.',
				validation: {
					tests: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
		};
		const obsolete = await invoke(tool, { ...input, decisionSections: [] }, judgeResource);
		assert.match(getText(obsolete), /invalid/);
		const result = await invoke(tool, input, judgeResource);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			recommendedParticipantId: submitted?.recommendedParticipantId,
			attemptParticipantId: submitted?.attempts[0].participantId,
			validation: submitted?.attempts[0].validation,
		}, {
			result: { status: 'submitted', comparisonId: 'comparison' },
			recommendedParticipantId: 'attempt',
			attemptParticipantId: 'attempt',
			validation: {
				tests: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
			},
		});
	});

	test('accepts hashed comparison identifiers in Judge verdict submissions', async () => {
		const comparison = stubComparison();
		const hashedId = hashSessionIdForTelemetry(comparison.id);
		let submitted: ISessionComparisonVerdict | undefined;
		let submittedComparisonId: string | undefined;
		const tool = new CompleteSessionComparisonTool(stubComparisonService({
			getComparison: id => id === comparison.id ? comparison : undefined,
			comparisons: constObservable([comparison]),
			submitVerdict: (_comparisonId, verdict) => {
				submittedComparisonId = _comparisonId;
				submitted = verdict;
			},
		}));

		const result = await invoke(tool, {
			comparisonId: hashedId,
			recommendedAttemptNumber: 1,
			explanation: 'No implementation changes were needed.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Completed the requested inspection without changing code.',
				validation: {
					tests: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
		}, judgeResource);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			submitted: !!submitted,
			submittedComparisonId,
		}, {
			result: { status: 'submitted', comparisonId: comparison.id },
			submitted: true,
			submittedComparisonId: comparison.id,
		});
	});

	test('rejects inconsistent validation evidence', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(stubComparisonService({
			getComparison: () => comparison,
		}));

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'No implementation changes were needed.',
			rationale: rationaleInput(),
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Completed the requested inspection without changing code.',
				validation: {
					tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.Unavailable),
					build: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					lint: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
					diagnostics: evidence(SessionComparisonValidationState.NotApplicable, SessionComparisonValidationSource.NotApplicable),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
		}, judgeResource);

		assert.strictEqual(getText(result), 'The comparison verdict input is invalid. Keep explanation to one sentence, provide concise comparison, validation, codeQuality, and solution rationale points, and use a consistent state and source pair for every validation category.');
	});

	test('records automatic review evidence provenance in the verdict', async () => {
		const comparison = stubComparison();
		let submitted: ISessionComparisonVerdict | undefined;
		const tool = new CompleteSessionComparisonTool(stubComparisonService({
			getComparison: () => comparison,
			submitVerdict: (_comparisonId, verdict) => submitted = verdict,
		}));
		const result = await tool.invoke({
			callId: 'call',
			toolId: 'tool',
			parameters: {
				comparisonId: comparison.id,
				recommendedAttemptNumber: 1,
				explanation: 'The implementation is correct and focused.',
				rationale: rationaleInput(),
				conflicts: [],
				attempts: [{
					attemptNumber: 1,
					summary: 'Focused implementation with passing tests.',
					validation: {
						tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
						build: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.AttemptReport),
						lint: evidence(SessionComparisonValidationState.Unknown, SessionComparisonValidationSource.Unavailable),
						diagnostics: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
					},
					unresolvedIssues: [],
					notableDifferences: ['Smallest diff'],
				}],
			},
			context: { sessionResource: judgeResource },
		}, async () => 0, progress, CancellationToken.None);

		assert.deepStrictEqual({
			result: JSON.parse(getText(result)),
			rationale: submitted?.rationale,
			validation: submitted?.attempts[0].validation,
		}, {
			result: { status: 'submitted', comparisonId: 'comparison' },
			rationale: rationaleInput(),
			validation: {
				tests: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
				build: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.AttemptReport),
				lint: evidence(SessionComparisonValidationState.Unknown, SessionComparisonValidationSource.Unavailable),
				diagnostics: evidence(SessionComparisonValidationState.Passed, SessionComparisonValidationSource.JudgeRun),
			},
		});
	});

	test('rejects unrelated sessions', async () => {
		const comparison = stubComparison();
		const tool = new ReadSessionComparisonTool(
			stubComparisonService({ getComparison: () => comparison }),
			upcastPartial<ISessionsManagementService>({}),
		);

		const result = await invoke(tool, { comparisonId: comparison.id }, URI.parse('test:/unrelated'));

		assert.strictEqual(getText(result), 'Only the Judge or synthesis session for this comparison can read its manifest.');
	});

	test('rejects verbose categorized rationale', async () => {
		const comparison = stubComparison();
		const tool = new CompleteSessionComparisonTool(stubComparisonService({
			getComparison: () => comparison,
		}));

		const result = await invoke(tool, {
			comparisonId: comparison.id,
			recommendedAttemptNumber: 1,
			explanation: 'Attempt is strongest.',
			rationale: {
				...rationaleInput(),
				solution: 'x'.repeat(181),
			},
			conflicts: [],
			attempts: [{
				attemptNumber: 1,
				summary: 'Focused implementation.',
				validation: {
					tests: passedEvidence(),
					build: passedEvidence(),
					lint: passedEvidence(),
					diagnostics: passedEvidence(),
				},
				unresolvedIssues: [],
				notableDifferences: [],
			}],
		}, judgeResource);

		assert.strictEqual(getText(result), 'The comparison verdict input is invalid. Keep explanation to one sentence, provide concise comparison, validation, codeQuality, and solution rationale points, and use a consistent state and source pair for every validation category.');
	});
});

function passedEvidence() {
	return {
		state: SessionComparisonValidationState.Passed,
		source: SessionComparisonValidationSource.JudgeRun,
	} as const;
}

function evidence(state: SessionComparisonValidationState, source: SessionComparisonValidationSource) {
	return { state, source };
}

function rationaleInput() {
	return {
		comparison: 'The other attempts were incomplete or left the reported failure unresolved.',
		validation: 'Focused tests and diagnostics pass in the attempt worktree.',
		codeQuality: 'Matches the surrounding types and existing implementation pattern.',
		solution: 'Implements the requested behavior with the smallest correct change.',
	};
}

function stubComparison(): ISessionComparison {
	return {
		id: 'comparison',
		groupId: 'group',
		title: 'Comparison',
		createdAt: 1,
		workspace: URI.file('/workspace'),
		prompt: 'Implement the feature',
		branch: 'main',
		judgeHarness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
		participants: [{
			id: 'attempt',
			role: SessionComparisonParticipantRole.Attempt,
			harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot', modelLabel: 'Claude' },
			sessionResource: attemptResource,
		}, {
			id: 'judge',
			role: SessionComparisonParticipantRole.Judge,
			harness: { providerId: 'provider', sessionTypeId: 'copilot', label: 'Copilot' },
			sessionResource: judgeResource,
		}],
	};
}

function stubAttemptSession(): ISession {
	const chat = upcastPartial<IChat>({
		resource: attemptChatResource,
		status: constObservable(SessionStatus.Completed),
		modelId: constObservable(undefined),
		changes: constObservable([{
			uri: URI.file('/workspace/src/example.ts'),
			insertions: 3,
			deletions: 1,
		}]),
	});
	return upcastPartial<ISession>({
		resource: attemptResource,
		providerId: 'provider',
		status: constObservable(SessionStatus.Completed),
		mainChat: constObservable(chat),
		workspace: constObservable(upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/source-workspace'),
				workingDirectory: URI.file('/workspace'),
				name: 'workspace',
				description: undefined,
			}],
		})),
		changesSummary: constObservable({ files: 1, additions: 3, deletions: 1 }),
	});
}

async function invoke(tool: ReadSessionComparisonTool | CompleteSessionComparisonTool, parameters: Record<string, unknown>, sessionResource: URI): Promise<IToolResult> {
	return tool.invoke({
		callId: 'call',
		toolId: 'tool',
		parameters,
		context: { sessionResource },
	}, async () => 0, progress, CancellationToken.None);
}

function getText(result: IToolResult): string {
	const part = result.content[0];
	if (!part || part.kind !== 'text') {
		assert.fail('Expected a text tool result.');
	}
	return part.value;
}
