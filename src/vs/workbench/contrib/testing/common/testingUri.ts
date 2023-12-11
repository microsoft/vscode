/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from 'vs/base/common/assert';
import { URI } from 'vs/base/common/uri';

export const TEST_DATA_SCHEME = 'vscode-test-data';

export const enum TestUriType {
	/** All console output for a task */
	TaskOutput,
	/** All console output for a test in a task */
	TestOutput,
	/** Specific message in a test */
	ResultMessage,
	/** Specific actual output message in a test */
	ResultActualOutput,
	/** Specific expected output message in a test */
	ResultExpectedOutput,
}

interface IAllOutputReference {
	type: TestUriType.TaskOutput;
	resultId: string;
	taskIndex: number;
}

interface IResultTestUri {
	resultId: string;
	taskIndex: number;
	testExtId: string;
}

interface ITestOutputReference extends IResultTestUri {
	type: TestUriType.TestOutput;
}

interface IResultTestMessageReference extends IResultTestUri {
	type: TestUriType.ResultMessage;
	messageIndex: number;
}

interface ITestDiffOutputReference extends IResultTestUri {
	type: TestUriType.ResultActualOutput | TestUriType.ResultExpectedOutput;
	messageIndex: number;
}

export type ParsedTestUri =
	| IAllOutputReference
	| IResultTestMessageReference
	| ITestDiffOutputReference
	| ITestOutputReference;

const enum TestUriParts {
	Results = 'results',

	AllOutput = 'output',
	Messages = 'message',
	Text = 'TestFailureMessage',
	ActualOutput = 'ActualOutput',
	ExpectedOutput = 'ExpectedOutput',
}

export const parseTestUri = (uri: URI): ParsedTestUri | undefined => {
	const type = uri.authority;
	const [resultId, ...request] = uri.path.slice(1).split('/');

	if (request[0] === TestUriParts.Messages) {
		const taskIndex = Number(request[1]);
		const testExtId = uri.query;
		const index = Number(request[2]);
		const part = request[3];
		if (type === TestUriParts.Results) {
			switch (part) {
				case TestUriParts.Text:
					return { resultId, taskIndex, testExtId, messageIndex: index, type: TestUriType.ResultMessage };
				case TestUriParts.ActualOutput:
					return { resultId, taskIndex, testExtId, messageIndex: index, type: TestUriType.ResultActualOutput };
				case TestUriParts.ExpectedOutput:
					return { resultId, taskIndex, testExtId, messageIndex: index, type: TestUriType.ResultExpectedOutput };
				case TestUriParts.Messages:
			}
		}
	}

	if (request[0] === TestUriParts.AllOutput) {
		const testExtId = uri.query;
		const taskIndex = Number(request[1]);
		return testExtId
			? { resultId, taskIndex, testExtId, type: TestUriType.TestOutput }
			: { resultId, taskIndex, type: TestUriType.TaskOutput };
	}

	return undefined;
};

export const buildTestUri = (parsed: ParsedTestUri): URI => {
	const uriParts = {
		scheme: TEST_DATA_SCHEME,
		authority: TestUriParts.Results
	};

	if (parsed.type === TestUriType.TaskOutput) {
		return URI.from({
			...uriParts,
			path: ['', parsed.resultId, TestUriParts.AllOutput, parsed.taskIndex].join('/'),
		});
	}

	const msgRef = (resultId: string, ...remaining: (string | number)[]) =>
		URI.from({
			...uriParts,
			query: parsed.testExtId,
			path: ['', resultId, TestUriParts.Messages, ...remaining].join('/'),
		});

	switch (parsed.type) {
		case TestUriType.ResultActualOutput:
			return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, TestUriParts.ActualOutput);
		case TestUriType.ResultExpectedOutput:
			return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, TestUriParts.ExpectedOutput);
		case TestUriType.ResultMessage:
			return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, TestUriParts.Text);
		case TestUriType.TestOutput:
			return URI.from({
				...uriParts,
				query: parsed.testExtId,
				path: ['', parsed.resultId, TestUriParts.AllOutput, parsed.taskIndex].join('/'),
			});
		default:
			assertNever(parsed, 'Invalid test uri');
	}
};
