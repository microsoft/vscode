/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { describe, expect, test } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { runOnChange } from '../../../../util/vs/base/common/observableInternal';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { IRecordingInformation } from '../../common/observableWorkspaceRecordingReplayer';
import { RejectionCollector } from '../../common/rejectionCollector';
import { loadJSON, relativeFile } from './fileLoading';
import { runRecording } from './runRecording';

describe('RejectionCollector[visualizable]', () => {
	test('test1', async () => {
		const result = await runRecording(
			await loadJSON<IRecordingInformation>({
				filePath: relativeFile('recordings/RejectionCollector.test1.w.json'),
			}),
			ctx => {
				const rejs: (boolean | string)[] = [];

				const rejectionCollector = ctx.store.add(new RejectionCollector(ctx.workspace, new TestLogService()));

				ctx.workspace.lastActiveDocument.recomputeInitiallyAndOnChange(ctx.store);

				const getEdit = (doc: IObservableDocument | undefined = undefined) => {
					if (!doc) {
						doc = ctx.workspace.lastActiveDocument.get();
					}
					if (!doc) {
						return undefined;
					}

					const edit = createEdit(
						doc.value.get().value,
						`items.push([[oldItem ? item.withIdentity(oldItem.identity) : item]]);`,
						`OLDiTEM`,
					);
					if (!edit) {
						return undefined;
					}

					return { edit, doc };
				};

				while (!getEdit()) {
					if (!ctx.step()) {
						return { rejs };
					}
				}
				const { doc } = getEdit()!;

				ctx.store.add(runOnChange(ctx.workspace.onDidOpenDocumentChange, () => {
					const e = getEdit(doc);
					if (e) {
						rejs.push(rejectionCollector.isRejected(doc.id, e.edit));
					} else {
						rejs.push('edit not found');
					}
				}));

				ctx.stepSkipNonContentChanges();

				const { edit } = getEdit()!;
				rejectionCollector.reject(doc.id, edit);

				ctx.finishReplay();

				return { rejs };
			}
		);

		expect(result.rejs).toMatchInlineSnapshot(`
			[
			  false,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  true,
			  "edit not found",
			]
		`);
	});
	test.skip('overlapping', () => {
		const observableWorkspace = new MutableObservableWorkspace();
		const doc = observableWorkspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue: outdent`
class Point {
	constructor(
		private readonly x: number,
		private readonly y: number,
	) { }
	getDistance() {
		return Math.sqrt(this.x ** 2 + this.y ** 2);
	}
}
`.trim()
		});

		const rejectionCollector = new RejectionCollector(observableWorkspace, new TestLogService());
		try {
			const edit1 = StringReplacement.replace(OffsetRange.fromTo(96, 107), 'fo');
			expect(rejectionCollector.isRejected(doc.id, edit1)).toBe(false);
			const rej1 = StringReplacement.replace(OffsetRange.fromTo(96, 107), 'foobar');
			rejectionCollector.reject(doc.id, rej1);
			expect(rejectionCollector.isRejected(doc.id, rej1)).toBe(true);

			expect(rejectionCollector.isRejected(doc.id, edit1)).toBe(false);
			doc.applyEdit(StringEdit.single(edit1));
			expect(rejectionCollector.isRejected(doc.id, StringReplacement.replace(OffsetRange.fromTo(98, 98), 'obar'))).toBe(true);

			const edit2 = StringReplacement.replace(OffsetRange.fromTo(98, 98), 'ob');
			expect(rejectionCollector.isRejected(doc.id, edit2)).toBe(false);
			doc.applyEdit(StringEdit.single(edit2));
			expect(rejectionCollector.isRejected(doc.id, StringReplacement.replace(OffsetRange.fromTo(100, 100), 'ar'))).toBe(true);

			const edit3 = StringReplacement.replace(OffsetRange.fromTo(100, 100), 'A');
			expect(rejectionCollector.isRejected(doc.id, edit3)).toBe(false);
			doc.applyEdit(StringEdit.single(edit3));
			// now evicted
			expect(rejectionCollector.isRejected(doc.id, StringReplacement.replace(OffsetRange.fromTo(101, 101), 'r'))).toBe(false);
		} finally {
			rejectionCollector.dispose();
		}
	});
});


/**
 * Match is context[[valueToReplace]]context
*/
function createEdit(base: string, match: string, newValue: string): StringReplacement | undefined {
	let cleanedMatch: string;
	const idxStart = match.indexOf('[[');
	const idxEnd = match.indexOf(']]') - 2;

	let range: OffsetRange;
	if (idxStart === -1 || idxEnd === -3) {
		range = new OffsetRange(0, match.length);
		cleanedMatch = match;
	} else {
		range = new OffsetRange(idxStart, idxEnd);
		cleanedMatch = match.replace('[[', '').replace(']]', '');
	}

	const idx = base.indexOf(cleanedMatch);
	if (idx === -1) {
		return undefined;
	}

	const r = range.delta(idx);
	return StringReplacement.replace(r, newValue);
}
