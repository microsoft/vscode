/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { suite, test } from 'vitest';
import {
	CodeOrDocsSearchRepoError,
	EmbeddingsUnavailableError,
	InaccessibleRepoOrgError,
	MaxRetriesExceededError,
	NoAccessToEndpointError,
	NotIndexedError,
	SearchErrorType,
	SearchRepoErrorType,
	constructSearchError,
	constructSearchRepoError
} from '../../common/codeOrDocsSearchErrors';

suite('Search Client Errors', () => {
	test('should return an instance of InaccessibleRepoOrgError when error is missingInaccessibleRepoOrg', () => {
		const error = constructSearchRepoError({
			error: SearchRepoErrorType.missingInaccessibleRepoOrg,
			message: 'Error message',
			repo: 'microsoft/vscode'
		});
		assert.ok(error instanceof InaccessibleRepoOrgError);
	});

	test('should return an instance of EmbeddingsUnavailableError when error is docsEmbeddingsUnavailable', () => {
		const error = constructSearchRepoError({
			error: SearchRepoErrorType.docsEmbeddingsUnavailable,
			message: 'Error message',
			repo: 'microsoft/vscode'
		});
		assert.ok(error instanceof EmbeddingsUnavailableError);
	});

	test('should return an instance of NotIndexedError when error is notIndexed', () => {
		const error = constructSearchRepoError({
			error: SearchRepoErrorType.notIndexed,
			message: 'Error message',
			repo: 'microsoft/vscode'
		});
		assert.ok(error instanceof NotIndexedError);
	});

	test('should return an instance of CodeOrDocsSearchRepoError when error is unknown', () => {
		const error = constructSearchRepoError({
			error: 'unknownERror',
			message: 'Error message',
			repo: 'microsoft/vscode'
		});
		assert.ok(error instanceof CodeOrDocsSearchRepoError);
	});

	test('should return an instance of MaxRetriesExceededError when error is maxRetriesExceeded', () => {
		const error = constructSearchError({
			error: SearchErrorType.maxRetriesExceeded,
			message: 'Error message',
		});
		assert.ok(error instanceof MaxRetriesExceededError);
	});

	test('should return an instance of NoAccessToEndpointError when error is noAccessToEndpoint', () => {
		const error = constructSearchError({
			error: SearchErrorType.noAccessToEndpoint,
			message: 'Error message',
		});
		assert.ok(error instanceof NoAccessToEndpointError);
	});

	test('should return an instance of Error when error is not any of the known error types', () => {
		const error = constructSearchError({
			error: 'unknownError',
			message: 'Error message',
		});
		assert.ok(error instanceof Error);
	});
});
