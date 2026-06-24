/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IMarkerData, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ApplyToKind, FileLocationKind, ProblemMatcher } from '../../common/problemMatcher.js';
import { WatchingProblemCollector } from '../../common/problemCollectors.js';

class TestModelService implements IModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _onModelAdded = new Emitter<ITextModel>();
	readonly onModelAdded = this._onModelAdded.event;

	private readonly _onModelRemoved = new Emitter<ITextModel>();
	readonly onModelRemoved = this._onModelRemoved.event;

	private readonly _onModelLanguageChanged = new Emitter<{ readonly model: ITextModel; readonly oldLanguageId: string }>();
	readonly onModelLanguageChanged = this._onModelLanguageChanged.event;

	private readonly _models = new Map<string, ITextModel>();

	dispose(): void {
		this._onModelAdded.dispose();
		this._onModelRemoved.dispose();
		this._onModelLanguageChanged.dispose();
	}

	openModel(resource: URI): void {
		const model = { uri: resource } as ITextModel;
		this._models.set(resource.toString(), model);
		this._onModelAdded.fire(model);
	}

	getModels(): ITextModel[] {
		return [...this._models.values()];
	}

	getModel(resource: URI): ITextModel | null {
		return this._models.get(resource.toString()) ?? null;
	}

	createModel(): ITextModel { throw new Error('Not implemented'); }
	updateModel(): void { throw new Error('Not implemented'); }
	destroyModel(): void { throw new Error('Not implemented'); }
	getCreationOptions(): never { throw new Error('Not implemented'); }
}

suite('WatchingProblemCollector', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.file('/work/greet.ts');

	function createMatcher(): ProblemMatcher {
		return {
			owner: 'typescript',
			source: 'ts',
			applyTo: ApplyToKind.closedDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: {
				regexp: /^([^\s]+):(\d+):(\d+) - error: (.*)$/,
				file: 1,
				line: 2,
				character: 3,
				message: 4
			},
			watching: {
				activeOnStart: false,
				beginsPattern: { regexp: /File change detected\. Starting incremental compilation\.\.\./ },
				endsPattern: { regexp: /Found \d+ errors?\. Watching for file changes\./ }
			}
		};
	}

	function createCollector(modelService: IModelService) {
		const markerService = store.add(new MarkerService());
		const collector = store.add(new WatchingProblemCollector([createMatcher()], markerService, modelService));
		const processLines = async (lines: string[]) => {
			for (const line of lines) {
				// Bypass the internal async queue so the test can await processing deterministically.
				await (collector as unknown as { processLineInternal(line: string): Promise<void> }).processLineInternal(line);
			}
		};
		return { markerService, collector, processLines };
	}

	const errorLine = `${resource.fsPath}:5:10 - error: 'foo' is declared but its value is never read.`;

	test('cleans up its own stale marker after a closed document was opened (#322730)', async () => {
		const modelService = store.add(new TestModelService());
		const { markerService, processLines } = createCollector(modelService);

		// First compile cycle reports an error while the document is closed.
		await processLines([
			'File change detected. Starting incremental compilation...',
			errorLine,
			'Found 1 error. Watching for file changes.'
		]);
		assert.strictEqual(markerService.read({ owner: 'typescript', resource }).length, 1, 'marker reported for closed document');

		// The user opens the document and then fixes the problem.
		modelService.openModel(resource);

		// Second compile cycle reports no errors; the previously reported marker must be cleaned up
		// even though the document is now open.
		await processLines([
			'File change detected. Starting incremental compilation...',
			'Found 0 errors. Watching for file changes.'
		]);
		assert.strictEqual(markerService.read({ owner: 'typescript', resource }).length, 0, 'stale marker cleaned up after fix');
	});

	test('does not remove markers that another producer took over under the same owner', async () => {
		const modelService = store.add(new TestModelService());
		const { markerService, processLines } = createCollector(modelService);

		await processLines([
			'File change detected. Starting incremental compilation...',
			errorLine,
			'Found 1 error. Watching for file changes.'
		]);

		// The document is opened and another producer replaces the markers for the same owner/resource.
		modelService.openModel(resource);
		const foreign: IMarkerData = {
			severity: MarkerSeverity.Error,
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: 2,
			message: 'A different, live diagnostic'
		};
		markerService.changeOne('typescript', resource, [foreign]);

		// A subsequent error-free compile must not wipe the foreign marker.
		await processLines([
			'File change detected. Starting incremental compilation...',
			'Found 0 errors. Watching for file changes.'
		]);

		const remaining = markerService.read({ owner: 'typescript', resource });
		assert.strictEqual(remaining.length, 1, 'foreign marker preserved');
		assert.strictEqual(remaining[0].message, foreign.message);
	});
});
