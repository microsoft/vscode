// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { Uri } from 'vscode';
import { buildErrorNodeOptions } from '../../../../client/testing/testController/common/utils';

suite('buildErrorNodeOptions - pytest not installed detection', () => {
    const workspaceUri = Uri.file('/test/workspace');

    test('Should detect pytest ModuleNotFoundError and provide specific message', () => {
        const errorMessage =
            'Traceback (most recent call last):\n  File "<string>", line 1, in <module>\n    import pytest\nModuleNotFoundError: No module named \'pytest\'';

        const result = buildErrorNodeOptions(workspaceUri, errorMessage, 'pytest');

        expect(result.label).to.equal('pytest Not Installed [workspace]');
        expect(result.error).to.equal(
            'pytest is not installed in the selected Python environment. Please install pytest to enable test discovery and execution.',
        );
    });

    test('Should detect pytest ImportError and provide specific message', () => {
        const errorMessage = 'ImportError: No module named pytest';

        const result = buildErrorNodeOptions(workspaceUri, errorMessage, 'pytest');

        expect(result.label).to.equal('pytest Not Installed [workspace]');
        expect(result.error).to.equal(
            'pytest is not installed in the selected Python environment. Please install pytest to enable test discovery and execution.',
        );
    });

    test('Should use generic error for non-pytest-related errors', () => {
        const errorMessage = 'Some other error occurred';

        const result = buildErrorNodeOptions(workspaceUri, errorMessage, 'pytest');

        expect(result.label).to.equal('pytest Discovery Error [workspace]');
        expect(result.error).to.equal('Some other error occurred');
    });

    test('Should use generic error for unittest errors', () => {
        const errorMessage = "ModuleNotFoundError: No module named 'pytest'";

        const result = buildErrorNodeOptions(workspaceUri, errorMessage, 'unittest');

        expect(result.label).to.equal('Unittest Discovery Error [workspace]');
        expect(result.error).to.equal("ModuleNotFoundError: No module named 'pytest'");
    });
});
