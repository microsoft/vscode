/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../base/common/assert.js';
import { URI } from '../../../../base/common/uri.js';
export const TEST_DATA_SCHEME = 'vscode-test-data';
export var TestUriType;
(function (TestUriType) {
    /** All console output for a task */
    TestUriType[TestUriType["TaskOutput"] = 0] = "TaskOutput";
    /** All console output for a test in a task */
    TestUriType[TestUriType["TestOutput"] = 1] = "TestOutput";
    /** Specific message in a test */
    TestUriType[TestUriType["ResultMessage"] = 2] = "ResultMessage";
    /** Specific actual output message in a test */
    TestUriType[TestUriType["ResultActualOutput"] = 3] = "ResultActualOutput";
    /** Specific expected output message in a test */
    TestUriType[TestUriType["ResultExpectedOutput"] = 4] = "ResultExpectedOutput";
})(TestUriType || (TestUriType = {}));
var TestUriParts;
(function (TestUriParts) {
    TestUriParts["Results"] = "results";
    TestUriParts["AllOutput"] = "output";
    TestUriParts["Messages"] = "message";
    TestUriParts["Text"] = "TestFailureMessage";
    TestUriParts["ActualOutput"] = "ActualOutput";
    TestUriParts["ExpectedOutput"] = "ExpectedOutput";
})(TestUriParts || (TestUriParts = {}));
export const parseTestUri = (uri) => {
    const type = uri.authority;
    const [resultId, ...request] = uri.path.slice(1).split('/');
    if (request[0] === "message" /* TestUriParts.Messages */) {
        const taskIndex = Number(request[1]);
        const testExtId = uri.query;
        const index = Number(request[2]);
        const part = request[3];
        if (type === "results" /* TestUriParts.Results */) {
            switch (part) {
                case "TestFailureMessage" /* TestUriParts.Text */:
                    return { resultId, taskIndex, testExtId, messageIndex: index, type: 2 /* TestUriType.ResultMessage */ };
                case "ActualOutput" /* TestUriParts.ActualOutput */:
                    return { resultId, taskIndex, testExtId, messageIndex: index, type: 3 /* TestUriType.ResultActualOutput */ };
                case "ExpectedOutput" /* TestUriParts.ExpectedOutput */:
                    return { resultId, taskIndex, testExtId, messageIndex: index, type: 4 /* TestUriType.ResultExpectedOutput */ };
                case "message" /* TestUriParts.Messages */:
            }
        }
    }
    if (request[0] === "output" /* TestUriParts.AllOutput */) {
        const testExtId = uri.query;
        const taskIndex = Number(request[1]);
        return testExtId
            ? { resultId, taskIndex, testExtId, type: 1 /* TestUriType.TestOutput */ }
            : { resultId, taskIndex, type: 0 /* TestUriType.TaskOutput */ };
    }
    return undefined;
};
export const buildTestUri = (parsed) => {
    const uriParts = {
        scheme: TEST_DATA_SCHEME,
        authority: "results" /* TestUriParts.Results */
    };
    if (parsed.type === 0 /* TestUriType.TaskOutput */) {
        return URI.from({
            ...uriParts,
            path: ['', parsed.resultId, "output" /* TestUriParts.AllOutput */, parsed.taskIndex].join('/'),
        });
    }
    const msgRef = (resultId, ...remaining) => URI.from({
        ...uriParts,
        query: parsed.testExtId,
        path: ['', resultId, "message" /* TestUriParts.Messages */, ...remaining].join('/'),
    });
    switch (parsed.type) {
        case 3 /* TestUriType.ResultActualOutput */:
            return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, "ActualOutput" /* TestUriParts.ActualOutput */);
        case 4 /* TestUriType.ResultExpectedOutput */:
            return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, "ExpectedOutput" /* TestUriParts.ExpectedOutput */);
        case 2 /* TestUriType.ResultMessage */:
            return msgRef(parsed.resultId, parsed.taskIndex, parsed.messageIndex, "TestFailureMessage" /* TestUriParts.Text */);
        case 1 /* TestUriType.TestOutput */:
            return URI.from({
                ...uriParts,
                query: parsed.testExtId,
                path: ['', parsed.resultId, "output" /* TestUriParts.AllOutput */, parsed.taskIndex].join('/'),
            });
        default:
            assertNever(parsed, 'Invalid test uri');
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ1VyaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RpbmdVcmkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVyRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxrQkFBa0IsQ0FBQztBQUVuRCxNQUFNLENBQU4sSUFBa0IsV0FXakI7QUFYRCxXQUFrQixXQUFXO0lBQzVCLG9DQUFvQztJQUNwQyx5REFBVSxDQUFBO0lBQ1YsOENBQThDO0lBQzlDLHlEQUFVLENBQUE7SUFDVixpQ0FBaUM7SUFDakMsK0RBQWEsQ0FBQTtJQUNiLCtDQUErQztJQUMvQyx5RUFBa0IsQ0FBQTtJQUNsQixpREFBaUQ7SUFDakQsNkVBQW9CLENBQUE7QUFDckIsQ0FBQyxFQVhpQixXQUFXLEtBQVgsV0FBVyxRQVc1QjtBQWtDRCxJQUFXLFlBUVY7QUFSRCxXQUFXLFlBQVk7SUFDdEIsbUNBQW1CLENBQUE7SUFFbkIsb0NBQW9CLENBQUE7SUFDcEIsb0NBQW9CLENBQUE7SUFDcEIsMkNBQTJCLENBQUE7SUFDM0IsNkNBQTZCLENBQUE7SUFDN0IsaURBQWlDLENBQUE7QUFDbEMsQ0FBQyxFQVJVLFlBQVksS0FBWixZQUFZLFFBUXRCO0FBRUQsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLENBQUMsR0FBUSxFQUE2QixFQUFFO0lBQ25FLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUM7SUFDM0IsTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENB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