/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IMarker, IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { ProblemCollectorEventKind, WatchingProblemCollector } from '../../common/problemCollectors.js';
import { ApplyToKind, FileLocationKind, ProblemMatcher } from '../../common/problemMatcher.js';

class CountingRegExp extends RegExp {
	count = 0;

	override exec(value: string): RegExpExecArray | null {
		this.count++;
		return super.exec(value);
	}
}

suite('ProblemCollectors', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const twoFiles of [false, true]) {
		test(`publishes the final resource in a completed background cycle (two files: ${twoFiles})`, async () => {
			const markerService = store.add(new MarkerService());
			const modelService = new class extends mock<IModelService>() {
				override readonly onModelAdded = Event.None;
				override readonly onModelRemoved = Event.None;
				override getModels(): ITextModel[] { return []; }
			};
			const matcher: ProblemMatcher = {
				owner: 'test', applyTo: ApplyToKind.allDocuments, fileLocation: FileLocationKind.Relative, filePrefix: '/workspace',
				pattern: { regexp: /^(.*):(\d+): (.*)$/, file: 1, line: 2, message: 3 },
				watching: { activeOnStart: true, beginsPattern: { regexp: /^begin$/ }, endsPattern: { regexp: /^end$/ } }
			};
			const collector = store.add(new WatchingProblemCollector([matcher], markerService, modelService));
			const snapshots: string[][] = [];
			let invalidated = 0;
			store.add(collector.onDidRequestInvalidateLastMarker(() => invalidated++));
			store.add(collector.onDidFindErrors((markers: IMarker[]) => snapshots.push(markers.map(m => m.message))));
			let completed: (() => void) | undefined;
			store.add(collector.onDidStateChange(event => {
				if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
					completed?.();
				}
			}));
			collector.aboutToStart();
			for (const prefix of ['first', 'next']) {
				const ended = new Promise<void>(resolve => completed = resolve);
				for (const line of ['begin', `a.ts:1: ${prefix} one`, `a.ts:2: ${prefix} two`, ...(twoFiles ? [`b.ts:3: ${prefix} three`] : []), 'end']) {
					collector.processLine(line);
				}
				await ended;
			}
			const emptyCycle = new Promise<void>(resolve => completed = resolve);
			collector.processLine('begin');
			collector.processLine('end');
			await emptyCycle;
			assert.deepStrictEqual({ invalidated, remaining: markerService.read({ owner: 'test' }).length }, { invalidated: 1, remaining: 0 });
			assert.deepStrictEqual(snapshots, twoFiles ? [['first one', 'first two', 'first three'], ['next one', 'next two', 'next three']] : [['first one', 'first two'], ['next one', 'next two']]);
		});
	}

	test('does not retain replayed lines when a model is removed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const modelRemoved = store.add(new Emitter<ITextModel>());
		const modelService = new class extends mock<IModelService>() {
			override readonly onModelAdded = Event.None;
			override readonly onModelRemoved = modelRemoved.event;
			override getModels(): ITextModel[] { return []; }
		};

		const markerChanged = store.add(new Emitter<readonly URI[]>());
		const markerService = new class extends mock<IMarkerService>() {
			override readonly onMarkerChanged = markerChanged.event;
			override read() { return []; }
		};

		const problemPattern = new CountingRegExp('^never$');
		const problemMatcher: ProblemMatcher = {
			owner: 'test',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: { regexp: problemPattern },
			watching: {
				activeOnStart: true,
				beginsPattern: { regexp: /^begin$/ },
				endsPattern: { regexp: /^end$/ }
			}
		};
		const collector = store.add(new WatchingProblemCollector([problemMatcher], markerService, modelService));
		const resource = URI.parse('test:///file.ts');
		const model = new class extends mock<ITextModel>() {
			override readonly uri = resource;
		};

		collector.processLine('output');
		await timeout(0);
		const matchCounts = [problemPattern.count];

		for (let i = 0; i < 2; i++) {
			modelRemoved.fire(model);
			markerChanged.fire([resource]);
			await timeout(600);
			matchCounts.push(problemPattern.count);
		}

		assert.deepStrictEqual(matchCounts, [1, 2, 3]);
	}));
});
