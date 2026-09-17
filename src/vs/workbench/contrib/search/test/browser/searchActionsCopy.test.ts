/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IFileMatch, OneLineRange, QueryType, TextSearchMatch } from '../../../../services/search/common/search.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IReplaceService } from '../../browser/replace.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { TestEditorGroupsService, TestEditorService } from '../../../../test/browser/workbenchTestServices.js';
import { NotebookEditorWidgetService } from '../../../notebook/browser/services/notebookEditorServiceImpl.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { ISearchResult } from '../../browser/searchTreeModel/searchTreeCommon.js';
import { addToSearchResult, createFileUriFromPathFromRoot } from './searchTestCommon.js';
import { allFolderMatchesToString, lineDelimiter } from '../../browser/searchActionsCopy.js';

const lineOneRange = new OneLineRange(1, 0, 1);

suite('Search Actions Copy (#270519)', () => {

	let instantiationService: TestInstantiationService;
	let labelService: ILabelService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IThemeService, new TestThemeService());
		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);
		const modelService = instantiationService.createInstance(ModelService);
		store.add(modelService);
		instantiationService.stub(IModelService, modelService);
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		const editorService = new TestEditorService();
		store.add(editorService);
		instantiationService.stub(IEditorService, editorService);
		const notebookEditorWidgetService = instantiationService.createInstance(NotebookEditorWidgetService);
		store.add(notebookEditorWidgetService);
		instantiationService.stub(INotebookEditorService, notebookEditorWidgetService);
		const fileService = new FileService(new NullLogService());
		store.add(fileService);
		const uriIdentityService = new UriIdentityService(fileService);
		store.add(uriIdentityService);
		instantiationService.stub(IUriIdentityService, uriIdentityService);
		instantiationService.stubPromise(IReplaceService, {});
		instantiationService.stub(IReplaceService, 'replace', () => Promise.resolve(null));
		labelService = new MockLabelService();
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ILogService, new NullLogService());
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('allFolderMatchesToString in list mode emits a flat list with full URI labels', () => {
		const searchResult = aPopulatedSearchResult();

		const text = allFolderMatchesToString(searchResult.folderMatches(), labelService, /* isTree */ false);

		// In list mode the output is a flat list where each file is identified by
		// its full URI label (no indentation for nested folder structure).
		assert.ok(text.length > 0, 'expected non-empty output');
		// The nested file label (no indentation) should appear verbatim.
		assert.ok(text.includes('bar.b'), 'expected bar.b to be present');
		// List mode must not contain a bare folder-name header line (only file URIs + match lines).
		const lines = text.split(lineDelimiter);
		const folderHeaderLine = lines.find(l => l.trim() === 'path');
		assert.strictEqual(folderHeaderLine, undefined, 'list mode must not emit bare folder headers');
	});

	test('allFolderMatchesToString in tree mode emits indented/tree-formatted output (fixes #270519)', () => {
		const searchResult = aPopulatedSearchResult();

		const text = allFolderMatchesToString(searchResult.folderMatches(), labelService, /* isTree */ true);
		const lines = text.split(lineDelimiter);

		// A nested folder ('path' under '/with') should be rendered as its basename,
		// not as the full URI path.
		const pathHeader = lines.find(l => l.trim() === 'path');
		assert.ok(pathHeader, `expected a nested 'path' folder header line in tree output; got:\n${text}`);

		// The file bar.b (under /with/path/) should appear indented under its parent folder,
		// as its basename only ('bar.b'), not as a full URI.
		const barLineIdx = lines.findIndex(l => l.trimStart() === 'bar.b');
		assert.ok(barLineIdx >= 0, `expected 'bar.b' as an indented line in tree output; got:\n${text}`);
		const barLeadingSpaces = lines[barLineIdx].length - lines[barLineIdx].trimStart().length;
		assert.ok(barLeadingSpaces > 0, `expected 'bar.b' to be indented in tree mode, got leading spaces = ${barLeadingSpaces}`);

		// The nested 'path' folder header should be indented under its workspace root folder.
		const pathLineIdx = lines.indexOf(pathHeader!);
		const pathLeadingSpaces = pathHeader!.length - pathHeader!.trimStart().length;
		assert.ok(pathLeadingSpaces > 0, `expected 'path' folder header to be indented in tree mode, got leading spaces = ${pathLeadingSpaces}`);

		// bar.b must be indented strictly deeper than its parent folder header 'path'.
		assert.ok(barLeadingSpaces > pathLeadingSpaces,
			`expected 'bar.b' (indent=${barLeadingSpaces}) to be deeper than parent folder 'path' (indent=${pathLeadingSpaces})`);

		// Sanity: the file's match line must be indented deeper than the file header itself.
		const matchLineForBar = lines[barLineIdx + 1];
		assert.ok(matchLineForBar !== undefined, 'expected match preview line after file header');
		const matchLeadingSpaces = matchLineForBar.length - matchLineForBar.trimStart().length;
		assert.ok(matchLeadingSpaces > barLeadingSpaces,
			`expected match line indent (${matchLeadingSpaces}) to be deeper than file header indent (${barLeadingSpaces})`);

		// Ordering: the workspace root header precedes the nested 'path' header, which precedes 'bar.b'.
		assert.ok(pathLineIdx < barLineIdx, 'expected nested folder header to precede its file');
	});

	function aSearchResult(): ISearchResult {
		const searchModel = instantiationService.createInstance(SearchModelImpl);
		store.add(searchModel);
		searchModel.searchResult.query = {
			type: QueryType.Text,
			folderQueries: [{ folder: createFileUriFromPathFromRoot() }],
			contentPattern: { pattern: '' }
		};
		return searchModel.searchResult;
	}

	function aRawMatch(resource: string, ...results: TextSearchMatch[]): IFileMatch {
		return { resource: createFileUriFromPathFromRoot(resource), results };
	}

	function aPopulatedSearchResult(): ISearchResult {
		const searchResult = aSearchResult();
		searchResult.query = {
			type: QueryType.Text,
			contentPattern: { pattern: 'foo' },
			folderQueries: [
				{ folder: createFileUriFromPathFromRoot('/voo') },
				{ folder: createFileUriFromPathFromRoot('/with') },
			]
		};
		addToSearchResult(searchResult, [
			aRawMatch('/voo/foo.a', new TextSearchMatch('preview 1', lineOneRange)),
			aRawMatch('/with/path/bar.b', new TextSearchMatch('preview 3', lineOneRange)),
		]);
		return searchResult;
	}
});
