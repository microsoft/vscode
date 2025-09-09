/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestMarkerService } from '../../../../../platform/markers/test/common/markerService.test.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { extUri } from '../../../../../base/common/resources.js';

class TestEditorInput extends EditorInput {
	constructor(private readonly _resource: URI) {
		super();
	}

	override get resource(): URI | undefined {
		return this._resource;
	}

	override get typeId(): string {
		return 'test';
	}

	override getName(): string {
		return 'test';
	}
}

class TestLabelService implements ILabelService {
	_serviceBrand: undefined;

	getUriLabel(resource: URI, options?: { relative?: boolean }): string {
		if (options?.relative) {
			return resource.path.split('/').pop() || resource.path;
		}
		return resource.toString();
	}

	getUriBasenameLabel(resource: URI): string {
		return resource.path.split('/').pop() || resource.path;
	}

	// Add other required methods with minimal implementations
	onDidChangeFormatters = new (require('../../../../../base/common/event.js').Emitter)().event;
	getWorkspaceLabel = () => '';
	getHostLabel = () => '';
	getSeparator = () => '/';
	registerFormatter = () => ({ dispose: () => { } });
	registerCachedFormatter = () => ({ dispose: () => { } });
}

class TestEditorService implements Partial<IEditorService> {
	_serviceBrand: undefined;

	private _activeEditor: EditorInput | undefined;

	get activeEditor(): EditorInput | undefined {
		return this._activeEditor;
	}

	setActiveEditor(editor: EditorInput | undefined): void {
		this._activeEditor = editor;
	}

	// Add other required properties with minimal implementations
	onDidActiveEditorChange = new (require('../../../../../base/common/event.js').Emitter)().event;
	onDidVisibleEditorsChange = new (require('../../../../../base/common/event.js').Emitter)().event;
	activeEditorPane = undefined;
	activeTextEditorControl = undefined;
	activeTextEditorLanguageId = undefined;
	visibleEditorPanes = [];
	visibleEditors = [];
	visibleTextEditorControls = [];
	editors = [];
	count = 0;
}

suite('MarkersChatContext', () => {

	let instantiationService: TestInstantiationService;
	let markerService: TestMarkerService;
	let labelService: TestLabelService;
	let editorService: TestEditorService;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		markerService = new TestMarkerService();
		labelService = new TestLabelService();
		editorService = new TestEditorService();

		instantiationService.set(IMarkerService, markerService);
		instantiationService.set(ILabelService, labelService);
		instantiationService.set(IEditorService, editorService as any);
	});

	test('prioritizes problems from active file', async () => {
		const activeFileUri = URI.parse('file:///activeFile.ts');
		const otherFileUri = URI.parse('file:///otherFile.ts');

		// Set up markers for both files
		markerService.changeAll('owner', [
			{
				resource: activeFileUri,
				marker: {
					severity: MarkerSeverity.Error,
					message: 'Error in active file',
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5
				}
			},
			{
				resource: otherFileUri,
				marker: {
					severity: MarkerSeverity.Error,
					message: 'Error in other file',
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5
				}
			}
		]);

		// Set active editor
		const activeEditor = new TestEditorInput(activeFileUri);
		editorService.setActiveEditor(activeEditor);

		// Import the class to test after services are set up
		const { MarkerChatContextPick } = await import('../../browser/markersChatContext.js');
		const contextPick = instantiationService.createInstance(MarkerChatContextPick);
		const picker = contextPick.asPicker();

		// Get picks
		const picksResult = picker.picks as Function;
		const picks = await picksResult(
			{ read: () => '' } as any, // empty query observable
			{ isCancellationRequested: false } as any // cancellation token
		);

		const actualPicks = picks.picks || picks;

		// Find the separators to identify file order
		const separators = actualPicks.filter((item: any) => item.type === 'separator');
		
		// The first separator (after "All Problems") should be for the active file
		assert.ok(separators.length >= 2, 'Should have separators for both files');
		assert.ok(separators[1].label.includes('(current file)'), 'Active file should be marked as current file');
	});

	test('filters problems by file name', async () => {
		const tsFileUri = URI.parse('file:///test.ts');
		const jsFileUri = URI.parse('file:///test.js');

		// Set up markers for both files
		markerService.changeAll('owner', [
			{
				resource: tsFileUri,
				marker: {
					severity: MarkerSeverity.Error,
					message: 'TypeScript error',
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5
				}
			},
			{
				resource: jsFileUri,
				marker: {
					severity: MarkerSeverity.Error,
					message: 'JavaScript error',
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5
				}
			}
		]);

		// Import the class to test after services are set up
		const { MarkerChatContextPick } = await import('../../browser/markersChatContext.js');
		const contextPick = instantiationService.createInstance(MarkerChatContextPick);
		const picker = contextPick.asPicker();

		// Get picks with filter query
		const picksResult = picker.picks as Function;
		const picks = await picksResult(
			{ read: () => '.ts' } as any, // query observable for TypeScript files
			{ isCancellationRequested: false } as any // cancellation token
		);

		const actualPicks = picks.picks || picks;

		// Find separators to identify which files are included
		const separators = actualPicks.filter((item: any) => item.type === 'separator');
		
		// Should only have "All Problems" and the TypeScript file
		assert.strictEqual(separators.length, 2, 'Should only show filtered files');
		assert.ok(separators[1].label.includes('test.ts'), 'Should include TypeScript file');
	});

	test('returns all problems when query is empty', async () => {
		const file1Uri = URI.parse('file:///file1.ts');
		const file2Uri = URI.parse('file:///file2.js');

		// Set up markers for both files
		markerService.changeAll('owner', [
			{
				resource: file1Uri,
				marker: {
					severity: MarkerSeverity.Error,
					message: 'Error 1',
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 5
				}
			},
			{
				resource: file2Uri,
				marker: {
					severity: MarkerSeverity.Warning,
					message: 'Warning 1',
					startLineNumber: 2,
					startColumn: 1,
					endLineNumber: 2,
					endColumn: 5
				}
			}
		]);

		// Import the class to test after services are set up
		const { MarkerChatContextPick } = await import('../../browser/markersChatContext.js');
		const contextPick = instantiationService.createInstance(MarkerChatContextPick);
		const picker = contextPick.asPicker();

		// Get picks with empty query
		const picksResult = picker.picks as Function;
		const picks = await picksResult(
			{ read: () => '' } as any, // empty query observable
			{ isCancellationRequested: false } as any // cancellation token
		);

		const actualPicks = picks.picks || picks;

		// Should have "All Problems" + 2 file separators + 2 problem items
		assert.ok(actualPicks.length >= 5, 'Should include all problems and separators');
		
		// Find problem items (non-separators, non-"All Problems")
		const problemItems = actualPicks.filter((item: any) => 
			item.type !== 'separator' && item.label !== 'All Problems'
		);
		
		assert.strictEqual(problemItems.length, 2, 'Should have both problem items');
	});
});