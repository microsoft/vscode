/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as csvParse from 'csv-parse/sync';
import type * as vscode from 'vscode';
import { OutputAnnotation } from '../../shared/sharedTypes';
import { AMLRunKind } from './amlSimulations';

/** Copied from src/base/conversation/context/resolvers/gitRepository.ts */
interface RepoContext {
	readonly name: string;
	readonly headBranchName: string | undefined;
	readonly upstreamBranchName: string | undefined;
	readonly isRebasing: boolean;
	readonly remotes: string[];
}

/*
 * Copied from src/base/conversation/context/promptContextModel.ts
 * because workbench tsconfig restricts importing from `promptContextModel` for some reason.
 */
interface ISerializedWorkspaceState {
	readonly workspaceFoldersFilePaths: string[] | undefined;
	readonly activeTextEditor: {
		selections: { anchor: vscode.Position; active: vscode.Position; isReversed: boolean }[];
		documentFilePath: string;
		visibleRanges: { start: vscode.Position; end: vscode.Position }[];
		languageId: string;
	} | undefined;
	readonly symbols: {
		name: string;
		kind: vscode.SymbolKind;
		containerName: string;
		filePath: string;
		start: vscode.Position;
		end: vscode.Position;
	}[] | undefined;
	readonly notebookDocumentFilePaths: string[] | undefined;
	readonly activeFileDiagnostics: { start: vscode.Position; end: vscode.Position; message: string; severity?: vscode.DiagnosticSeverity }[];
	readonly debugConsoleOutput: string;
	readonly repoContext: RepoContext | undefined;
	readonly terminalBuffer: string;
	readonly terminalSelection: string;
}

/** Type for `response` field of `<experiment>_scored_predictions.csv` */
export type Response = {
	originalFilePath: string;
	fileBefore: string;
	fileAfter: string;
	logFileContents: string;
	conversationFileContents: string;

	/**
	 * This needs to be of type `promptContextModel.ISerializedWorkspaceState`,
	 * but workbench tsconfig restricts importing from `promptContextModel` for some reason.
	 * We don't need this property for now, so we can leave it as an `object` for now. */
	workspaceStateFileContents: ISerializedWorkspaceState;
};

export type EvaluationError = {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	message: string;
	rule: string;
	tool: string;
};

export type TestRunEvaluation = {
	caseName: string;
	/** the n-th run for this case? 0-based */
	nId: number;
	languageId: string;
	isSuccess: boolean;
	errorsOnlyInBefore?: EvaluationError[];
	errorsOnlyInAfter?: EvaluationError[];
	annotations?: OutputAnnotation[];
	stdout?: string;
	stderr?: string;
	evaluatorError?: string;
	generatedTestCaseCount?: number;
	generatedAssertCount?: number;
	expectedDiff?: string;
};

// parses each line in `<component>_scored_predictions.csv` into a TestRunEvaluation
function _parseScoredPredictionsCsv(kind: AMLRunKind, fileContents: string[]): TestRunEvaluation[] {
	return fileContents.map((line, i) => {

		const json: any = JSON.parse(line); // may throw but not sure if we should have a way to recover

		let stdout: string | undefined;
		let stderr: string | undefined;
		let errorsOnlyInBefore: EvaluationError[] | undefined;
		let errorsOnlyInAfter: EvaluationError[] | undefined;
		const annotations: OutputAnnotation[] = [];
		let evaluatorError: string | undefined;
		let generatedTestCaseCount: number | undefined;
		let generatedAssertCount: number | undefined;

		const extraDataJson = json.extra_data_json;

		if (extraDataJson) {
			({ errorsOnlyInBefore, errorsOnlyInAfter } = _parseFixEvaluationData(kind, extraDataJson));

			[generatedTestCaseCount, generatedAssertCount] = _parseTestEvaluationData(kind, extraDataJson);

			stdout = extraDataJson.stdout && typeof extraDataJson.stdout === 'string' ? extraDataJson.stdout : undefined;
			stderr = extraDataJson.stderr && typeof extraDataJson.stderr === 'string' ? extraDataJson.stderr : undefined;
		}

		if (json.score !== 1) {
			const statusCodes: string[] = json.status_codes;

			if (statusCodes) {
				for (const statusCode of statusCodes) {
					if (statusCode !== 'SUCCESS') {
						annotations.push({ message: `AML eval error: ${statusCode}`, label: statusCode, severity: 'error' } satisfies OutputAnnotation);
					}
				}

				if (json.status_message) {
					evaluatorError = evaluatorError ? `${evaluatorError}\n${json.status_message}` : json.status_message;
				}
			}
		}

		return {
			caseName: json.test_case_id,
			nId: parseInt(json.n_id),
			languageId: json.language,
			isSuccess: typeof json.score === 'number' ? json.score === 1 : json.score,
			errorsOnlyInBefore,
			errorsOnlyInAfter,
			annotations,
			stdout,
			stderr,
			evaluatorError,
			generatedTestCaseCount: generatedTestCaseCount,
			generatedAssertCount: generatedAssertCount,
			expectedDiff: extraDataJson?.diff,
		};
	});
}

function _parseFixEvaluationData(kind: AMLRunKind, json: unknown) {
	let errorsOnlyInBefore: EvaluationError[] | undefined;
	let errorsOnlyInAfter: EvaluationError[] | undefined;

	if (kind === AMLRunKind.Fix && typeof json === 'object' && json) {
		errorsOnlyInAfter = (json as any).errors_only_in_after?.map(_toEvaluationError).sort(_evaluationErrorComparator);
		errorsOnlyInBefore = (json as any).errors_only_in_before?.map(_toEvaluationError).sort(_evaluationErrorComparator);
	}

	return { errorsOnlyInBefore, errorsOnlyInAfter };
}

function _parseTestEvaluationData(kind: AMLRunKind, json: unknown): [number | undefined, number | undefined] {
	let generatedTestCaseCount: number | undefined = undefined;
	let generatedAssertCount: number | undefined = undefined;

	if (kind === AMLRunKind.TestGen && typeof json === 'object' && json) {
		if ('generated_test_case_count' in json) {
			generatedTestCaseCount = json.generated_test_case_count as number;
		}
		if ('generated_assert_count' in json) {
			generatedAssertCount = json.generated_assert_count as number;
		}
	}

	return [generatedTestCaseCount, generatedAssertCount];
}

function _toEvaluationError(error: any): EvaluationError {

	return {
		message: error.message,
		rule: error.rule,
		tool: error.tool,
		startLine: error.start_line_index,
		startColumn: error.start_col_index,
		endLine: error.end_line_index,
		endColumn: error.end_col_index
	};
}

function _evaluationErrorComparator(error1: EvaluationError, error2: EvaluationError) {
	if (error1.startLine !== error2.startLine) {
		return error1.startLine - error2.startLine;
	}
	if (error1.startColumn !== error2.startColumn) {
		return error1.startColumn - error2.startColumn;
	}
	if (error1.endLine !== error2.endLine) {
		return error1.endLine - error2.endLine;
	}
	if (error1.endColumn !== error2.endColumn) {
		return error1.endColumn - error2.endColumn;
	}
	return 0;
}

export type TestRunsEvaluation = {
	caseName: string;
	activeEditorLanguageId?: string;
	isEachTestRunSuccess: boolean[];
	errorsOnlyInBefore?: EvaluationError[];
	errorsOnlyInAfter?: EvaluationError[];
	annotations?: OutputAnnotation[];
	stdout?: string;
	stderr?: string;
	evaluatorError?: string;
	generatedTestCaseCount?: number;
	generatedAssertCount?: number;
	expectedDiff?: string;
};

// parses lines in `<component>_scored_predictions.csv` and aggregates them into
// a format that is easier to use for our purposes
export function parseScoredPredictionsCsv(kind: AMLRunKind, fileContents: string[]): TestRunsEvaluation[] {

	const testRunEvals = _parseScoredPredictionsCsv(kind, fileContents);

	const testRunsEvaluation: TestRunsEvaluation[] = [];

	let ix = 0;
	while (ix < testRunEvals.length) {
		const { caseName, languageId, errorsOnlyInBefore, errorsOnlyInAfter, annotations, stdout, stderr, evaluatorError, generatedTestCaseCount, generatedAssertCount, expectedDiff } = testRunEvals[ix];
		const isEachTestRunSuccess: boolean[] = [];
		while (ix < testRunEvals.length && testRunEvals[ix].caseName === caseName) {
			isEachTestRunSuccess.push(testRunEvals[ix].isSuccess);
			ix++;
		}
		testRunsEvaluation.push({
			caseName,
			activeEditorLanguageId: languageId,
			isEachTestRunSuccess,
			errorsOnlyInBefore,
			errorsOnlyInAfter,
			annotations,
			stdout,
			stderr,
			evaluatorError,
			generatedTestCaseCount: generatedTestCaseCount,
			generatedAssertCount: generatedAssertCount,
			expectedDiff,
		});
	}
	return testRunsEvaluation;
}

export type ScoreCard = {
	metric: string;
	mean: number;
	median: number;
	stdErr: number;
	confidenceInterval: [number, number];
	count: number;
};

export function parseScoreCard(fileContents: string): ScoreCard {
	const scoreCardRows: ScoreCard[] = csvParse.parse(
		fileContents,
		{
			delimiter: ',',
			columns: ['metric', 'mean', 'median', 'stdErr', 'confidenceInterval', 'count'],
			cast: (value: string, context: csvParse.CastingContext) => {
				switch (context.column) {
					case 'metric':
						return value;
					case 'mean':
						return `${(parseFloat(value) * 100).toFixed(2)}%`;
					case 'confidenceInterval': {
						const unparenthesized = value.substring(1, value.length - 1);
						const [lower, upper] = unparenthesized.split(', ').map(parseFloat);
						return [lower, upper];
					}
					case 'count':
						return parseInt(value);
					default:
						return parseFloat(value).toFixed(2);
				}
			},
			fromLine: 2,
		}
	);
	return scoreCardRows[0];
}

export type ScoreCardByLanguage = {
	language: string;
	testCasesCount: number;
	scoredCount: number;
	unscoredCount: number;
	meanScore: number;
};

export function parseScoreCardByLanguage(fileContents: string): ScoreCardByLanguage[] {
	return JSON.parse(fileContents).map((entry: any) => ({
		language: entry.Language,
		testCasesCount: entry.nTestCases,
		scoredCount: entry.nScored,
		unscoredCount: entry.nUnscored,
		meanScore: entry.MeanScore
	}));
}
