/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageBar, MessageBarBody, MessageBarTitle, Text } from '@fluentui/react-components';
import { ChevronUp20Regular } from '@fluentui/react-icons';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { getTextPart } from '../../../../src/platform/chat/common/globalStringUtils';
import { IDiagnostic, IDiagnosticComparison, IRange, ISerializedFileEdit, ISerializedNesUserEditsHistory, InterceptedRequest } from '../../shared/sharedTypes';
import { EvaluationError } from '../stores/amlResults';
import { ISimulationTest } from '../stores/simulationTestsProvider';
import { IResolvedFile, InitialWorkspaceState, InteractionWorkspaceState, WorkspaceState } from '../stores/simulationWorkspaceState';
import { TestRun } from '../stores/testRun';
import { isToolCall } from '../utils/utils';
import { DisplayOptions } from './app';
import { DiffEditor } from './diffEditor';
import { Editor } from './editor';
import { ErrorComparison } from './errorComparison';
import { OutputView } from './output';
import { RequestView } from './request';
import { TestCaseSummary } from './testCaseSummary';

type TestRunViewProps = {
	readonly test: ISimulationTest;
	readonly run: TestRun;
	readonly baseline: TestRun | undefined;
	readonly displayOptions: DisplayOptions;
	readonly closeTestRunView: () => void;
};

export const TestRunView = mobxlite.observer(
	({ test, run, baseline, displayOptions, closeTestRunView }: TestRunViewProps) => {
		return (
			<div className='testRun'>
				<div className='foldingBar' onClick={closeTestRunView}><ChevronUp20Regular /></div>
				<div className='content'>
					<TestRunVisualization test={test} run={run} baseline={baseline} displayOptions={displayOptions} />
					{run.error !== undefined && <ErrorMessageBar error={run.error} />}
				</div>
			</div>
		);
	}
);

class WorkspaceFileState {

	constructor(
		public readonly files = new Map<string, string>(),
		public readonly selections = new Map<string, IRange>(),
	) { }

	public update(state: WorkspaceState): WorkspaceFileState {
		const files = new Map<string, string>(this.files);
		const selections = new Map<string, IRange>(this.selections);

		if (state.kind === 'initial') {
			if (state.file.value) {
				files.set(state.file.value.workspacePath, state.file.value.contents);
				if (state.selection) {
					selections.set(state.file.value.workspacePath, state.selection);
				}
			}
			if (state.otherFiles.value) {
				for (const file of state.otherFiles.value) {
					files.set(file.workspacePath, file.contents);
				}
			}
		} else {
			for (const changedFile of state.changedFiles.value) {
				if (files.has(changedFile.workspacePath) && state.selection) {
					selections.set(changedFile.workspacePath, state.selection);
				}
				files.set(changedFile.workspacePath, changedFile.contents);
			}
		}
		return new WorkspaceFileState(files, selections);
	}
}

class RequestRenderData {
	constructor(
		public readonly idx: number,
		public readonly request: InterceptedRequest,
		public readonly title: string | undefined,
		public readonly baselineRequest: InterceptedRequest | undefined,
		public readonly expand: boolean
	) { }
}

class RequestRenderer {
	private _nextRequestIndex: number = 0;

	constructor(
		private readonly _expand: boolean,
		private readonly _run: TestRun,
		private readonly _baseline: TestRun | undefined
	) { }

	public take(stopIndex: number = this._run.requests.value.length): RequestRenderData[] {
		stopIndex = Math.min(stopIndex, this._run.requests.value.length);

		const result: RequestRenderData[] = [];
		while (this._nextRequestIndex < stopIndex) {
			const request = this._run.requests.value[this._nextRequestIndex];
			const baselineRequest = this._baseline?.requests.value[this._nextRequestIndex];
			const isIntentDetection = Array.isArray(request.requestMessages) && request.requestMessages.some(m => getTextPart(m.content).includes('Function Id: doc'));
			result.push(
				new RequestRenderData(
					this._nextRequestIndex,
					request,
					isIntentDetection ? 'Intent Detection' : undefined,
					baselineRequest,
					this._expand && !isIntentDetection
				)
			);
			this._nextRequestIndex++;
		}
		return result;
	}
}

class OutputRenderData {
	constructor(
		public readonly run: TestRun,
		public readonly baseline: TestRun | undefined,
		public readonly expand: boolean
	) { }
}

const TestRunVisualization = mobxlite.observer(
	({ test, run, baseline, displayOptions }: Omit<TestRunViewProps, 'closeTestRunView'>) => {
		if (!run.requests.resolved || !run.inlineChatWorkspaceStates.resolved || !run.nextEditSuggestion.resolved) {
			return <>PENDING</>;
		}

		let files = new WorkspaceFileState();
		const requestRenderer = new RequestRenderer(displayOptions.expandPrompts.value, run, baseline);

		const result: React.ReactElement[] = [];
		if (
			run.inlineChatWorkspaceStates.value.length === 2 &&
			run.inlineChatWorkspaceStates.value[0].kind === 'initial' &&
			run.inlineChatWorkspaceStates.value[1].kind === 'interaction' &&
			run.inlineChatWorkspaceStates.value[1].changedFiles.value.length === 1 &&
			run.inlineChatWorkspaceStates.value[1].changedFiles.value[0].workspacePath === run.inlineChatWorkspaceStates.value[0].file.value?.workspacePath
		) {
			// Optimize rendering for simple case
			files = files.update(run.inlineChatWorkspaceStates.value[0]);
			result.push(
				<InteractionState key={`single-state-step`} test={test} files={files} state={run.inlineChatWorkspaceStates.value[1]} requests={[]} expectedDiff={run.expectedDiff} />
			);
		} else {
			let stepNumber = 1;
			for (const state of run.inlineChatWorkspaceStates.value) {
				if (state.kind === 'initial') {
					result.push(
						<InitialState key='initial-state' state={state} />
					);
				} else {
					const requests = requestRenderer.take(state.requestCount);
					result.push(
						<InteractionState key={`state-step-${stepNumber++}`} test={test} files={files} state={state} requests={requests} expectedDiff={run.expectedDiff} />
					);
				}
				files = files.update(state);
			}
		}

		if (run.generatedTestCaseCount !== undefined && run.generatedTestCaseCount !== null) {
			result.push(
				<TestCaseSummary currentRun={run} baselineRun={baseline} />
			);
		}

		if (run.nesUserEditsHistory.value) {
			result.push(
				<NesUserEditHistory key='nes-user-edit-history' userEditsHistory={run.nesUserEditsHistory.value} />
			);
		}
		if (baseline?.nextEditSuggestion.value) {
			result.push(
				<details><summary>Next edit (reference run)</summary>
					<NextEditSuggestion key='reference-run-next-edit-suggestion'
						runKind={'reference'}
						proposedNextEdit={baseline.nextEditSuggestion.value} />
				</details>
			);
		}
		if (run.nextEditSuggestion.value) {
			result.push(
				<NextEditSuggestion key='next-edit-suggestion'
					runKind={'current'}
					proposedNextEdit={run.nextEditSuggestion.value} />
			);
		}
		if (run.nesLogContext.value) {
			result.push(<NesLogContext logContext={run.nesLogContext.value} />);
		}

		result.push(<Requests key='leftover-requests' requests={requestRenderer.take()} />);

		if (run.stdout || run.stderr || (baseline && (baseline.stdout || baseline.stderr))) {
			// We'll show the OutputView only when there is stdout OR stderr in either run or baseline.

			const outputRenderData = new OutputRenderData(run, baseline, displayOptions.expandPrompts.value);
			result.push(<OutputView
				run={outputRenderData.run}
				baseline={outputRenderData.baseline}
				expand={outputRenderData.expand}
			/>
			);
		}

		return <div>{result}</div>;
	}
);

const InteractionState = mobxlite.observer(
	({ test, files, state, requests, expectedDiff }: { test: ISimulationTest; files: WorkspaceFileState; state: InteractionWorkspaceState; requests: RequestRenderData[]; expectedDiff?: string }) => {
		return (
			<div>
				<UserQuery key={`step-query`} text={state.interaction.query} />
				{!state.interaction.query.startsWith('/') && <ChosenIntent key={`step-intent`} detectedIntent={state.interaction.detectedIntent} actualIntent={state.interaction.actualIntent} />}
				<Requests key={'step-requests'} requests={requests} />
				<ChangedFiles key={`step-changed`} files={files} state={state} test={test} />
				{expectedDiff && <ExpectedDiff expectedDiff={expectedDiff} />}
				<ErrorComparison key={`step-error-comparison`} test={test} />
			</div>
		);
	}
);

const Requests = mobxlite.observer(
	({ requests }: { requests: RequestRenderData[] }) => {
		let chatRequestIndex = 0;
		let toolCallIndex = 0;
		const requestViews = [];
		for (let i = 0; i < requests.length; i++) {
			const request = requests[i];
			let index;
			if (isToolCall(request.request)) {
				index = toolCallIndex;
				toolCallIndex += 1;
			} else {
				index = chatRequestIndex;
				chatRequestIndex += 1;
			}
			requestViews.push(
				<RequestView
					key={`request-${i}`}
					idx={index}
					request={request.request}
					title={request.title}
					baselineRequest={request.baselineRequest}
					expand={request.expand}
				/>
			);
		}
		return (<div>{requestViews}</div>);
	}
);

type ChangedFilesProps = {
	readonly files: WorkspaceFileState;
	readonly state: InteractionWorkspaceState;
	readonly test: ISimulationTest;
};

const ChangedFiles = mobxlite.observer(
	({ files, state, test }: ChangedFilesProps) => {
		const result: React.ReactElement[] = [];
		for (let changedFileIndex = 0; changedFileIndex < state.changedFiles.value.length; changedFileIndex++) {
			const changedFile = state.changedFiles.value[changedFileIndex];
			let prevFile = files.files.get(changedFile.workspacePath);
			// HACK here [mahuang]
			// simulator creates a new test file if that doesn't exist and has one line in the file. That ends up showing a diff of the modified file with this line on the UI. We would like to replace prevFile with undefined if there is only one line in the content. So that on the UI we show that the file is created. Any only do this when the intent of the state is tests.
			if (prevFile && prevFile.split('\n').length === 1 && state.interaction.detectedIntent === 'tests') {
				prevFile = undefined;
			}

			const fileDiagnostics = state.diagnostics?.[changedFile.workspacePath] ?? getDiagnosticsFromTest(test, changedFileIndex);
			result.push(
				<ChangedFile
					key={`changedFile-${changedFileIndex}`}
					changedFile={changedFile}
					prevFile={prevFile}
					fileDiagnostics={fileDiagnostics}
					languageId={changedFile.languageId ?? 'plaintext'}
					range={state.range}
					selections={{ before: files.selections.get(changedFile.workspacePath), after: state.selection }}
				/>
			);
		}
		return <div>{result}</div>;
	}
);
function getDiagnosticsFromTest(testRun: ISimulationTest, index: number): IDiagnosticComparison | undefined {
	if (index === 0 && testRun.errorsOnlyInBefore && testRun.errorsOnlyInAfter) {
		const toDiagnostics = (errors: EvaluationError[]): IDiagnostic[] => {
			return errors.map(error => {
				return {
					message: error.message,
					range: { start: { line: error.startLine, character: error.startColumn }, end: { line: error.endLine, character: error.endColumn } }
				};
			});
		};
		return { before: toDiagnostics(testRun.errorsOnlyInBefore), after: toDiagnostics(testRun.errorsOnlyInAfter) };
	}
	return undefined;
}

type ChangedFileProps = {
	readonly changedFile: IResolvedFile;
	readonly prevFile: string | undefined;
	readonly fileDiagnostics: IDiagnosticComparison | undefined;
	readonly languageId: string;
	readonly selections: {
		readonly before: IRange | undefined;
		readonly after: IRange | undefined;
	};
	readonly range: IRange | undefined;
};

const ChangedFile = mobxlite.observer(
	({ changedFile, prevFile, fileDiagnostics, languageId, selections, range }: ChangedFileProps) => {
		return (
			<div>
				{
					typeof prevFile !== 'undefined'
						? (
							<div>
								<div className='step-title'>
									Modified of Current run [{changedFile.workspacePath}]
								</div>
								<Text size={300}>Left editor - the existing code before applying the change, Right editor - the new code after applying the change</Text>
								<DiffEditor
									languageId={languageId}
									original={prevFile}
									modified={changedFile.contents}
									diagnostics={fileDiagnostics}
									selections={selections}
								/>
							</div>
						)
						: (
							<div>
								<div className='step-title'>
									Created of Current run [{changedFile.workspacePath}]
								</div>
								<Editor
									contents={changedFile.contents}
									languageId={languageId}
									range={range}
									selection={selections.after}
									diagnostics={fileDiagnostics?.after ?? []}
								/>
							</div>
						)
				}
				{fileDiagnostics &&
					<div className='diagnostics-comparison'>
						Diagnostics before: {fileDiagnostics.before.length},
						after: {fileDiagnostics.after.length}
					</div>
				}
			</div>
		);
	}
);

const InitialState = mobxlite.observer(
	({ state }: { state: InitialWorkspaceState }) => {
		if (!state.file.value) {
			return <></>;
		}

		return (
			<div>
				<div className='step-title'>
					Initial State of Current run [{state.file.value.workspacePath}]
				</div>
				<Editor
					contents={state.file.value.contents}
					languageId={state.languageId ?? 'plaintext'}
					selection={state.selection}
					diagnostics={state.diagnostics}
				/>
			</div>
		);
	}
);

const NesUserEditHistory = mobxlite.observer(
	({ userEditsHistory }: { userEditsHistory: ISerializedNesUserEditsHistory }) => {
		const { edits, currentDocumentIndex } = userEditsHistory;
		return (
			<div>
				<div>User edits</div>
				{(edits).map((edit, idx) => {
					return <div key={idx}>
						<div className='step-title'>
							{currentDocumentIndex === idx ? 'Active' : ''} File {edit.id ?? 'No file name'}
						</div>
						<DiffEditor
							languageId={edit.languageId}
							original={edit.original}
							modified={edit.modified}
						/>
					</div>;
				})}
			</div>
		);
	}
);

const NesLogContext = mobxlite.observer(
	({ logContext }: { logContext: string }) => {
		return (
			<details>
				<summary>Logs</summary>
				<Editor contents={logContext} languageId='markdown' />
			</details>
		);
	}
);

const NextEditSuggestion = mobxlite.observer(
	({ runKind, proposedNextEdit }: {
		runKind: 'current' | 'reference';
		proposedNextEdit: ISerializedFileEdit;
	}) => {
		return (
			<div>
				<div className='step-title'>
					Next Edit ({runKind === 'current' ? 'current run' : 'reference run'})
				</div>
				<DiffEditor
					languageId={proposedNextEdit.languageId}
					original={proposedNextEdit.original}
					modified={proposedNextEdit.modified}
				/>
			</div>
		);
	}
);

const UserIcon = () => {
	return (
		<svg stroke='currentColor' fill='currentColor' strokeWidth='0' viewBox='0 0 256 256' height='100%' width='100%' xmlns='http://www.w3.org/2000/svg'><path d='M224,128a95.76,95.76,0,0,1-31.8,71.37A72,72,0,0,0,128,160a40,40,0,1,0-40-40,40,40,0,0,0,40,40,72,72,0,0,0-64.2,39.37h0A96,96,0,1,1,224,128Z' opacity='0.2'></path><path d='M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z'></path></svg>
	);
};

const IntentIcon = () => {
	return (
		<svg fill='#000000' width='100%' height='100%' viewBox='0 0 32 32' id='icon' xmlns='http://www.w3.org/2000/svg'>
			<polygon points='22 4 22 6 24.586 6 19.586 11 21 12.414 26 7.414 26 10 28 10 28 4 22 4' />
			<polygon points='10 4 10 6 7.414 6 12.414 11 11 12.414 6 7.414 6 10 4 10 4 4 10 4' />
			<polygon points='20 5 16 1 12 5 13.414 6.414 15 4.829 15 11 17 11 17 4.829 18.586 6.414 20 5' />
			<polygon points='22 28 22 26 24.586 26 19.586 21 21 19.586 26 24.586 26 22 28 22 28 28 22 28' />
			<polygon points='10 28 10 26 7.414 26 12.414 21 11 19.586 6 24.586 6 22 4 22 4 28 10 28' />
			<polygon points='20 27 16 31 12 27 13.414 25.586 15 27.171 15 21 17 21 17 27.171 18.586 25.586 20 27' />
			<polygon points='5 12 1 16 5 20 6.414 18.586 4.829 17 11 17 11 15 4.829 15 6.414 13.414 5 12' />
			<polygon points='27 12 31 16 27 20 25.586 18.586 27.171 17 21 17 21 15 27.171 15 25.586 13.414 27 12' />
			<rect id='_Transparent_Rectangle_' data-name='&lt;Transparent Rectangle&gt;' style={{ fill: 'none' }} width='32' height='32' />
		</svg>
	);
};

const UserQuery = ({ text }: { text: string }) => {
	return (
		<div style={{ marginTop: '15px' }}>
			<span style={{ width: '1.75em', height: '1.75em', display: 'inline-block', float: 'left' }}>
				<UserIcon />
			</span>
			<span style={{
				lineHeight: '1.75em',
				display: 'inline-block',
				float: 'left',
				marginLeft: '5px',
				maxWidth: '1000px',
			}} className='step-query'>{text}</span>
			<div style={{ clear: 'left' }}></div>
		</div>
	);
};

const ChosenIntent = ({ detectedIntent, actualIntent }: { detectedIntent: string | undefined; actualIntent: string | undefined }) => {
	return (
		<div>
			<span style={{ width: '1.50em', height: '1.50em', paddingLeft: '0.12em', paddingRight: '0.12em', display: 'inline-block', float: 'left' }}>
				<IntentIcon />
			</span>
			<span style={{ lineHeight: '1.50em', display: 'inline-block', float: 'left', marginLeft: '5px' }} className='step-query'>/{detectedIntent} (EXPECTED: /{actualIntent})</span>
			<div style={{ clear: 'left' }}></div>
		</div>
	);
};

const ErrorMessageBar = mobxlite.observer(({ error }: { error: string }) => {

	let errorTitle: string = 'See below';
	{ // try extracting first line of error
		const firstNewlineIdx = error.indexOf('\n');
		if (firstNewlineIdx !== -1) {
			errorTitle = error.substring(0, firstNewlineIdx);
		}
	}

	return (
		<MessageBar intent='error' layout='singleline'>
			<MessageBarBody>
				<MessageBarTitle>Test failed with error: {errorTitle}</MessageBarTitle>
				<pre>{stripAnsiiColors(error)} </pre>
			</MessageBarBody>
		</MessageBar>
	);
});

function stripAnsiiColors(str: string) {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

type ExpectedDiffProps = {
	readonly expectedDiff: string;
};

const ExpectedDiff = mobxlite.observer(
	({ expectedDiff }: ExpectedDiffProps) => {
		return <div className='expected-diffs'>
			{dumbDiffParser(expectedDiff).map(details => {
				return <div className='expected-diffs'>
					<div className='step-title'>
						Expected diff [{details.path}]
					</div>
					<DiffEditor
						languageId={details.path.match(/\.\w+/)?.[0].substring(1) ?? 'plaintext'}
						modified={details.modified}
						original={details.original} />
				</div>;
			})}
		</div>;
	}
);

function dumbDiffParser(diff: string): { original: string; modified: string; path: string }[] {
	const lines = diff.split('\n');
	const result: { original: string; modified: string; path: string }[] = [];
	let current: { original: string; modified: string; path: string } | undefined;
	for (const line of lines) {
		if (line.startsWith('---')) {
			const path = line.substring(6);
			current = { original: '', modified: '', path };
			result.push(current);
		} else if (line.startsWith('+++')) {
			// ignore
		} else if (line.startsWith('-')) {
			if (current) {
				current.original += line.slice(1) + '\n';
			}
		} else if (line.startsWith('+')) {
			if (current) {
				current.modified += line.slice(1) + '\n';
			}
		} else {
			if (current) {
				current.original += line.slice(1) + '\n';
				current.modified += line.slice(1) + '\n';
			}
		}
	}
	return result;
}