/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { AutoRevealPairedFileContribution } from '../../browser/autoRevealPairedFile.js';
import { IExplorerService } from '../../browser/files.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { ISortOrderConfiguration } from '../../common/files.js';
import { IEditableData } from '../../../../common/views.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ProgressLocation } from '../../../../../platform/progress/common/progress.js';

/**
 * Mock ExplorerService to track select() calls for testing.
 */
class MockExplorerService implements IExplorerService {
	readonly _serviceBrand: undefined;

	public selectCalls: { resource: URI; reveal?: boolean | string }[] = [];
	public roots: ExplorerItem[] = [];
	public sortOrderConfiguration: ISortOrderConfiguration = {
		sortOrder: 'default' as any,
		lexicographicOptions: 'default' as any,
		reverse: false
	};

	async select(resource: URI, reveal?: boolean | string): Promise<void> {
		this.selectCalls.push({ resource, reveal });
	}

	getContext(_respectMultiSelection: boolean, _ignoreNestedChildren?: boolean): ExplorerItem[] {
		return [];
	}

	hasViewFocus(): boolean {
		return false;
	}

	async setEditable(_stat: ExplorerItem, _data: IEditableData | null): Promise<void> {
		// noop
	}

	getEditable(): { stat: ExplorerItem; data: IEditableData } | undefined {
		return undefined;
	}

	getEditableData(_stat: ExplorerItem): IEditableData | undefined {
		return undefined;
	}

	isEditable(_stat: ExplorerItem | undefined): boolean {
		return false;
	}

	findClosest(_resource: URI): ExplorerItem | null {
		return null;
	}

	findClosestRoot(_resource: URI): ExplorerItem | null {
		return null;
	}

	async refresh(): Promise<void> {
		// noop
	}

	async setToCopy(_stats: ExplorerItem[], _cut: boolean): Promise<void> {
		// noop
	}

	isCut(_stat: ExplorerItem): boolean {
		return false;
	}

	async applyBulkEdit(_edit: ResourceFileEdit[], _options: { undoLabel: string; progressLabel: string; confirmBeforeUndo?: boolean; progressLocation?: ProgressLocation.Explorer | ProgressLocation.Window }): Promise<void> {
		// noop
	}

	registerView(): void {
		// noop
	}

	reset(): void {
		this.selectCalls = [];
	}
}

/**
 * Mock FileService that can be configured to report file existence.
 */
class MockFileService extends TestFileService {
	private existingFiles = new Set<string>();

	setFileExists(uri: URI, exists: boolean): void {
		if (exists) {
			this.existingFiles.add(uri.toString());
		} else {
			this.existingFiles.delete(uri.toString());
		}
	}

	override async exists(resource: URI): Promise<boolean> {
		return this.existingFiles.has(resource.toString());
	}

	reset(): void {
		this.existingFiles.clear();
	}
}

suite('Files - AutoRevealPairedFile', () => {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let mockExplorerService: MockExplorerService;
	let mockFileService: MockFileService;
	let mockContextService: TestContextService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);

		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);

		mockExplorerService = new MockExplorerService();
		instantiationService.stub(IExplorerService, mockExplorerService);

		mockFileService = disposables.add(new MockFileService());
		instantiationService.stub(IFileService, mockFileService);

		mockContextService = new TestContextService(TestWorkspace);
		instantiationService.stub(IWorkspaceContextService, mockContextService);
	});

	teardown(() => {
		disposables.clear();
	});

	// ============================================
	// UNIT TESTS - Pattern Compilation & Matching
	// ============================================

	suite('Pattern Compilation', () => {

		test('compiles valid source regex pattern', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/(.*)\\.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Access private compiledPatterns for testing
			const compiledPatterns = (contribution as any).compiledPatterns;
			assert.strictEqual(compiledPatterns.length, 1);
			assert.strictEqual(compiledPatterns[0].isValid, true);

			// Test that source regex matches expected path
			const sourceRegex = compiledPatterns[0].sourceRegex;
			const match = sourceRegex.exec('src/utils/math.ts');
			assert.ok(match, 'Source regex should match src/utils/math.ts');
			assert.strictEqual(match[1], 'utils/math');
		});

		test('compiles valid template-style pattern with $1 placeholder', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const compiledPatterns = (contribution as any).compiledPatterns;
			assert.strictEqual(compiledPatterns.length, 1);
			assert.strictEqual(compiledPatterns[0].isValid, true);
		});

		test('handles invalid regex gracefully without crashing', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: '[invalid(regex', test: 'tests/$1.test.ts' }
					]
				}
			});

			// Should not throw
			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const compiledPatterns = (contribution as any).compiledPatterns;
			assert.strictEqual(compiledPatterns.length, 1);
			assert.strictEqual(compiledPatterns[0].isValid, false);
		});

		test('skips patterns with missing source or test', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/(.*).ts' } as any, // missing test
						{ test: 'tests/$1.test.ts' } as any, // missing source
						{ source: '', test: 'tests/$1.test.ts' }, // empty source
						{ source: 'src/(.*).ts', test: '' } // empty test
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const compiledPatterns = (contribution as any).compiledPatterns;
			// All patterns should be skipped due to missing/empty source or test
			assert.strictEqual(compiledPatterns.length, 0);
		});

		test('recompiles patterns when configuration changes', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/(.*)\\.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			let compiledPatterns = (contribution as any).compiledPatterns;
			assert.strictEqual(compiledPatterns.length, 1);

			// Change configuration
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'lib/(.*)\\.js', test: 'spec/$1.spec.js' },
						{ source: 'app/(.*)\\.tsx', test: '__tests__/$1.test.tsx' }
					]
				}
			});

			// Trigger configuration change
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: (key: string) => key === 'workbench.autoRevealPairedFile',
				source: 1 as any,
				affectedKeys: new Set(['workbench.autoRevealPairedFile']),
				change: {} as any
			});

			compiledPatterns = (contribution as any).compiledPatterns;
			assert.strictEqual(compiledPatterns.length, 2);
		});

	});

	// ============================================
	// UNIT TESTS - Capture Group Substitution
	// ============================================

	suite('Capture Group Substitution', () => {

		test('substitutes single capture group $1', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/(.*)\\.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/utils/math.ts');

			assert.strictEqual(result, 'tests/utils/math.test.ts');
		});

		test('substitutes multiple capture groups $1, $2', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/([^/]+)/(.*)\\.tsx', test: 'tests/$1/$2.test.tsx' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/components/Button.tsx');

			assert.strictEqual(result, 'tests/components/Button.test.tsx');
		});

		test('handles missing capture group gracefully', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/(.*)\\.ts', test: 'tests/$1/$2.test.ts' } // $2 doesn't exist
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/utils/math.ts');

			// $2 should be replaced with empty string
			assert.strictEqual(result, 'tests/utils/math/.test.ts');
		});

	});

	// ============================================
	// UNIT TESTS - Bidirectional Mapping
	// ============================================

	suite('Bidirectional Mapping', () => {

		test('source file maps to test file', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/utils/math.ts');

			assert.strictEqual(result, 'tests/utils/math.test.ts');
		});

		test('test file maps to source file', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('tests/utils/math.test.ts');

			assert.strictEqual(result, 'src/utils/math.ts');
		});

		test('first matching pattern wins', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' },
						{ source: 'src/$1.ts', test: 'spec/$1.spec.ts' } // Should not be used
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/utils/math.ts');

			// First pattern should win
			assert.strictEqual(result, 'tests/utils/math.test.ts');
		});

	});

	// ============================================
	// UNIT TESTS - Path Handling
	// ============================================

	suite('Path Handling', () => {

		test('handles POSIX-style paths', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/utils/math.ts');

			assert.strictEqual(result, 'tests/utils/math.test.ts');
		});

		test('handles deeply nested paths', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('src/features/auth/utils/validators/email.ts');

			assert.strictEqual(result, 'tests/features/auth/utils/validators/email.test.ts');
		});

	});

	// ============================================
	// UNIT TESTS - Feature Toggle & Edge Cases
	// ============================================

	suite('Feature Toggle', () => {

		test('no action when feature is disabled', async () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: false,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Trigger onActiveEditorChange
			(contribution as any).onActiveEditorChange();

			assert.strictEqual(mockExplorerService.selectCalls.length, 0);
		});

		test('no action when patterns array is empty', async () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: []
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Trigger onActiveEditorChange
			(contribution as any).onActiveEditorChange();

			assert.strictEqual(mockExplorerService.selectCalls.length, 0);
		});

		test('no action when workspace is empty', async () => {
			// Create a context service that reports empty workspace
			const emptyContextService = new TestContextService();
			(emptyContextService as any).getWorkbenchState = () => WorkbenchState.EMPTY;
			instantiationService.stub(IWorkspaceContextService, emptyContextService);

			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Trigger onActiveEditorChange
			(contribution as any).onActiveEditorChange();

			assert.strictEqual(mockExplorerService.selectCalls.length, 0);
		});

	});

	suite('No Match Behavior', () => {

		test('silent exit when file does not match any pattern', () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedPath = (contribution as any).computePairedPath.bind(contribution);
			const result = computePairedPath('README.md');

			assert.strictEqual(result, undefined);
		});

		test('silent exit when paired file does not exist', async () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			// File does NOT exist
			mockFileService.setFileExists(URI.file('/workspace/tests/utils/math.test.ts'), false);

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Call checkAndRevealPairedFile directly
			const checkAndReveal = (contribution as any).checkAndRevealPairedFile.bind(contribution);
			await checkAndReveal(URI.file('/workspace/tests/utils/math.test.ts'));

			assert.strictEqual(mockExplorerService.selectCalls.length, 0);
		});

	});

	// ============================================
	// INTEGRATION TESTS - Full Workflow
	// ============================================

	suite('Integration - Explorer Reveal', () => {

		test('reveal is called when paired file exists', async () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const pairedUri = URI.file('/workspace/tests/utils/math.test.ts');
			mockFileService.setFileExists(pairedUri, true);

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Call checkAndRevealPairedFile directly
			const checkAndReveal = (contribution as any).checkAndRevealPairedFile.bind(contribution);
			await checkAndReveal(pairedUri);

			assert.strictEqual(mockExplorerService.selectCalls.length, 1);
			assert.strictEqual(mockExplorerService.selectCalls[0].resource.toString(), pairedUri.toString());
			assert.strictEqual(mockExplorerService.selectCalls[0].reveal, 'force');
		});

		test('reveal not called when paired file does not exist', async () => {
			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const pairedUri = URI.file('/workspace/tests/utils/math.test.ts');
			mockFileService.setFileExists(pairedUri, false);

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			// Call checkAndRevealPairedFile directly
			const checkAndReveal = (contribution as any).checkAndRevealPairedFile.bind(contribution);
			await checkAndReveal(pairedUri);

			assert.strictEqual(mockExplorerService.selectCalls.length, 0);
		});

	});

	// ============================================
	// UNIT TESTS - computePairedUri
	// ============================================

	suite('computePairedUri', () => {

		test('returns undefined when resource has no workspace folder', () => {
			// Create a context service that returns null for getWorkspaceFolder
			const noFolderContextService = new TestContextService();
			(noFolderContextService as any).getWorkspaceFolder = () => null;
			instantiationService.stub(IWorkspaceContextService, noFolderContextService);

			configurationService.setUserConfiguration('workbench', {
				autoRevealPairedFile: {
					enabled: true,
					patterns: [
						{ source: 'src/$1.ts', test: 'tests/$1.test.ts' }
					]
				}
			});

			const contribution = disposables.add(instantiationService.createInstance(AutoRevealPairedFileContribution));

			const computePairedUri = (contribution as any).computePairedUri.bind(contribution);
			const result = computePairedUri(URI.file('/outside/workspace/file.ts'));

			assert.strictEqual(result, undefined);
		});

	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

