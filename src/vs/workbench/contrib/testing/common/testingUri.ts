/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export const TEST_DATA_SCHEME = 'vscode-test-data';

export const enum TestUriType {
	Message,
	ActualOutput,
	ExpectedOutput,
}

interface IGenericTestUri {
	providerId: string;
	testId: string;
}

interface ITestMessageReference extends IGenericTestUri {
	type: TestUriType.Message;
	messageIndex: number;
}

interface ITestOutputReference extends IGenericTestUri {
	type: TestUriType.ActualOutput | TestUriType.ExpectedOutput;
	messageIndex: number;
}

export type ParsedTestUri = ITestMessageReference | ITestOutputReference;

const enum TestUriParts {
	Messages = 'message',
	Text = 'text',
	ActualOutput = 'actualOutput',
	ExpectedOutput = 'expectedOutput',
}

export const parseTestUri = (uri: URI): ParsedTestUri | undefined => {
	const providerId = uri.authority;
	const [testId, ...request] = uri.path.slice(1).split('/');

	if (request[0] === TestUriParts.Messages) {
		const index = Number(request[1]);
		const part = request[2];
		switch (part) {
			case TestUriParts.Text:
				return { providerId, testId, messageIndex: index, type: TestUriType.Message };
			case TestUriParts.ActualOutput:
				return { providerId, testId, messageIndex: index, type: TestUriType.ActualOutput };
			case TestUriParts.ExpectedOutput:
				return { providerId, testId, messageIndex: index, type: TestUriType.ExpectedOutput };
			default:
				return undefined;
		}
	}

	return undefined;
};

export const buildTestUri = (parsed: ParsedTestUri): URI => {
	const uriParts = { scheme: TEST_DATA_SCHEME, authority: parsed.testId };
	const msgRef = (index: number, ...remaining: string[]) =>
		URI.from({ ...uriParts, path: ['', parsed.testId, TestUriParts.Messages, index, ...remaining].join('/') });

	switch (parsed.type) {
		case TestUriType.ActualOutput:
			return msgRef(parsed.messageIndex, TestUriParts.ActualOutput);
		case TestUriType.ExpectedOutput:
			return msgRef(parsed.messageIndex, TestUriParts.ExpectedOutput);
		case TestUriType.Message:
			return msgRef(parsed.messageIndex, TestUriParts.Text);
		default:
			throw new Error('Invalid test uri');
	}
};
