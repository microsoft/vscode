/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, it, suite } from 'vitest';
import type * as vscode from 'vscode';
import { _hasSupportedNotebooks, EditorAssociation, INotebookEditorContribution, RegisteredEditorPriority } from '../../../../util/common/notebooks';
import { ExtHostNotebookDocumentData } from '../../../../util/common/test/shims/notebookDocument';
import { URI } from '../../../../util/vs/base/common/uri';
import { NotebookData } from '../../../../vscodeTypes';

describe('NotebookService', () => {
	suite('hasSupportedNotebooks', () => {
		// all real providers pulled from package.json of various extensions
		const jupyterNotebookProvider: INotebookEditorContribution = {
			type: 'jupyter-notebook',
			displayName: 'Jupyter Notebook',
			priority: RegisteredEditorPriority.default,
			selector: [{ filenamePattern: '*.ipynb' }]
		};
		const kustoNotebookProvider: INotebookEditorContribution = {
			type: 'kusto-notebook',
			displayName: 'Kusto Notebook',
			selector: [{ filenamePattern: '*.knb' }]
		};
		const kustoNotebookProvider2: INotebookEditorContribution = {
			type: 'kusto-notebook-kql',
			displayName: 'Kusto Notebook',
			priority: RegisteredEditorPriority.option,
			selector: [{ filenamePattern: '*.kql' }, { filenamePattern: '*.csl' }]
		};
		const ghinbNotebookProvider: INotebookEditorContribution = {
			type: 'github-issues',
			displayName: 'GitHub Issues Notebook',
			selector: [{ filenamePattern: '*.github-issues' }]
		};

		suite('mock tests', () => {
			it('should return false when no providers are registered', async () => {
				const notebookDocument = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;

				assert.isFalse(
					_hasSupportedNotebooks(notebookDocument.uri, [], [], []),
					'Notebook with .ipynb extension should not be supported when there are no providers registered.'
				);
			});

			it('should support untitled notebooks with matching provider', async () => {
				const untitledUri: vscode.Uri = URI.from({
					scheme: 'untitled',
					authority: '',
					path: 'Untitled-1.ipynb',
					query: 'jupyter-notebook',
					fragment: '',
				});
				const untitledNotebook = ExtHostNotebookDocumentData.fromNotebookData(
					untitledUri,
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				const provider: INotebookEditorContribution = {
					type: 'test-provider',
					displayName: 'Test Provider',
					priority: RegisteredEditorPriority.default,
					selector: ['*.ipynb']
				};
				assert.isTrue(
					_hasSupportedNotebooks(untitledNotebook.uri, [untitledNotebook], [provider], []),
					'Untitled notebook with .ipynb extension should be supported by a provider with a matching selector.'
				);
			});

			it('should support notebooks with basic string selector', async () => {
				const provider: INotebookEditorContribution = {
					type: 'test-provider',
					displayName: 'Test Provider',
					priority: RegisteredEditorPriority.default,
					selector: ['*.ipynb']
				};
				const notebookDocument = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(notebookDocument.uri, [], [provider], []),
					'Notebook with .ipynb extension should be supported by a provider with a basic string selector.'
				);
			});

			it('should support case-insensitive selector matching for file extensions', async () => {
				const provider: INotebookEditorContribution = {
					type: 'test-provider',
					displayName: 'Test Provider',
					priority: RegisteredEditorPriority.default,
					selector: ['*.ipynb']
				};
				const notebookDocument = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.IPYNB'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(notebookDocument.uri, [], [provider], []),
					'Notebook with .IPYNB extension should be supported by a provider due to case-insensitive selectors.'
				);
			});

			it('should respect include and exclude patterns in provider selector', async () => {
				const provider: INotebookEditorContribution = {
					type: 'test-provider',
					displayName: 'Test Provider',
					priority: RegisteredEditorPriority.default,
					selector: [{
						include: '*.ipynb',
						exclude: 'test.*'
					}]
				};

				// Test file that matches include but not exclude
				const valid = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(valid.uri, [], [provider], []),
					'Notebook matching only the include pattern should be supported.'
				);

				// Test file that matches both include and exclude
				const excluded = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('test.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isFalse(
					_hasSupportedNotebooks(excluded.uri, [], [provider], []),
					'Notebook matching both include and exclude patterns should not be supported.'
				);

				// Test file that doesn't match either pattern
				const nonMatching = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.txt'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isFalse(
					_hasSupportedNotebooks(nonMatching.uri, [], [provider], []),
					'Notebook matching neither include nor exclude pattern should not be supported.'
				);

				// Test file in a subdirectory
				const subDirValid = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('subdir/one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(subDirValid.uri, [], [provider], []),
					'Notebook in subdirectory matching include pattern should be supported.'
				);

				// Test remote URI
				const remoteValid = ExtHostNotebookDocumentData.fromNotebookData(
					URI.parse('vscode-remote://ssh-remote+test/one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(remoteValid.uri, [], [provider], []),
					'Notebook with remote URI matching include pattern should be supported.'
				);
			});

			it('should respect filenamePattern and excludeFileNamePattern in provider selector', async () => {
				const provider: INotebookEditorContribution = {
					type: 'test-provider',
					displayName: 'Test Provider',
					priority: RegisteredEditorPriority.default,
					selector: [{
						filenamePattern: '*.ipynb',
						excludeFileNamePattern: 'test.*'
					}]
				};

				// Test file that matches include but not exclude
				const valid = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('one.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isTrue(
					_hasSupportedNotebooks(valid.uri, [], [provider], []),
					'Notebook matching filenamePattern but not excludeFileNamePattern should be supported.'
				);

				// Test file that matches both include and exclude
				const excluded = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('test.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;
				assert.isFalse(
					_hasSupportedNotebooks(excluded.uri, [], [provider], []),
					'Notebook matching both filenamePattern and excludeFileNamePattern should not be supported.'
				);
			});

			it('should return false when only providers with valid selector have non-default priority', async () => {
				const testNotebook = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('test.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;

				const providers = [
					{
						type: 'provider1',
						displayName: 'Provider 1',
						priority: RegisteredEditorPriority.option,
						selector: ['*.ipynb']
					},
					{
						type: 'provider2',
						displayName: 'Provider 2',
						priority: RegisteredEditorPriority.default,
						selector: ['*.other']
					}
				];
				assert.isFalse(
					_hasSupportedNotebooks(testNotebook.uri, [], providers, []),
					'Notebook with .ipynb extension should not be supported when only non-default priority providers match.'
				);
			});

			it('should return true when a provider with valid selector has default priority', async () => {
				const testNotebook = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('test.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;

				const providers = [
					{
						type: 'provider1',
						displayName: 'Provider 1',
						priority: RegisteredEditorPriority.default,
						selector: ['*.ipynb']
					},
					{
						type: 'provider2',
						displayName: 'Provider 2',
						priority: RegisteredEditorPriority.default,
						selector: ['*.other']
					}
				];
				assert.isTrue(
					_hasSupportedNotebooks(testNotebook.uri, [], providers, []),
					'Notebook with .ipynb extension should be supported when a provider with default priority matches.'
				);
			});

			it('should return true when only option-priority providers match but there is a matching editor association', async () => {
				const testNotebook = ExtHostNotebookDocumentData.fromNotebookData(
					URI.file('test.ipynb'),
					new NotebookData([]),
					'jupyter-notebook'
				).document;

				const associations = [{ viewType: 'option-provider', filenamePattern: '*.ipynb' }];
				const providers = [{
					type: 'option-provider',
					displayName: 'Option Provider',
					priority: RegisteredEditorPriority.option,
					selector: ['*.ipynb']
				}];
				assert.isTrue(
					_hasSupportedNotebooks(testNotebook.uri, [], providers, associations),
					'Notebook with .ipynb extension should be supported when an option-priority provider matches and there is a matching editor association.'
				);
			});
		});

		suite('real extension tests', () => {
			it('should return true for providers with no set priority, due to default fallback', async () => {
				const ghinbUri: vscode.Uri = URI.from({
					scheme: 'file',
					authority: '',
					path: '_endgame.github-issues',
					query: '',
					fragment: '',
				});
				assert.isTrue(
					_hasSupportedNotebooks(ghinbUri, [], [ghinbNotebookProvider], []),
					'Notebook with .github-issues extension should be supported even when there is no valid editor association.'
				);
			});

			it('should return true for github issues notebook provider with *.github-issues uri and a valid association', async () => {
				const ghinbUri: vscode.Uri = URI.from({
					scheme: 'file',
					authority: '',
					path: '_endgame.github-issues',
					query: '',
					fragment: '',
				});
				const ghinbAssociation: EditorAssociation = { viewType: 'github-issues', filenamePattern: '*.github-issues' };
				assert.isTrue(
					_hasSupportedNotebooks(ghinbUri, [], [ghinbNotebookProvider], [ghinbAssociation]),
					'Notebook with .github-issues extension should be supported when there is a valid editor association.'
				);
			});

			it('should return true for various notebook files with multiple providers and all valid associations', async () => {
				const providers = [ghinbNotebookProvider, jupyterNotebookProvider, kustoNotebookProvider, kustoNotebookProvider2];
				const associations = [
					{ viewType: 'jupyter-notebook', filenamePattern: '*.ipynb' },
					{ viewType: 'kusto-notebook', filenamePattern: '*.knb' },
					{ viewType: 'kusto-notebook-kql', filenamePattern: '*.kql' },
					{ viewType: 'kusto-notebook-kql', filenamePattern: '*.csl' },
					{ viewType: 'github-issues', filenamePattern: '*.github-issues' }
				];
				const testFiles = [
					URI.file('test.ipynb'),
					URI.file('test.knb'),
					URI.file('test.kql'),
					URI.file('test.csl'),
					URI.file('test.github-issues'),
				];

				for (const testFile of testFiles) {
					assert.isTrue(
						_hasSupportedNotebooks(testFile, [], providers, associations),
						`Notebook with extension matching a provider and association should be supported: ${testFile.toString()}`
					);
				}
			});
		});
	});


});
