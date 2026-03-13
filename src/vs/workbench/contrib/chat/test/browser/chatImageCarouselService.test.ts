/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { buildCollectionArgs, buildSingleImageArgs, findClickedImageIndex, ICarouselSection } from '../../browser/chatImageCarouselService.js';

suite('ChatImageCarouselService helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makeImage(id: string, name: string = 'img.png', mimeType: string = 'image/png'): { id: string; name: string; mimeType: string; data: Uint8Array } {
		return { id, name, mimeType, data: new Uint8Array([1, 2, 3]) };
	}

	function makeSections(...imageCounts: number[]): ICarouselSection[] {
		return imageCounts.map((count, sectionIdx) => ({
			title: `Section ${sectionIdx}`,
			images: Array.from({ length: count }, (_, imgIdx) =>
				makeImage(URI.file(`/image_s${sectionIdx}_i${imgIdx}.png`).toString(), `image_s${sectionIdx}_i${imgIdx}.png`)
			),
		}));
	}

	suite('findClickedImageIndex', () => {

		test('finds image by URI string match in first section', () => {
			const sections = makeSections(3);
			const targetUri = URI.parse(sections[0].images[1].id);
			assert.strictEqual(findClickedImageIndex(sections, targetUri), 1);
		});

		test('finds image by URI string match in second section', () => {
			const sections = makeSections(2, 3);
			const targetUri = URI.parse(sections[1].images[2].id);
			// globalOffset = 2 (first section) + 2 (third in second section) = 4
			assert.strictEqual(findClickedImageIndex(sections, targetUri), 4);
		});

		test('returns -1 when no match found', () => {
			const sections = makeSections(2, 2);
			const unknownUri = URI.file('/nonexistent.png');
			assert.strictEqual(findClickedImageIndex(sections, unknownUri), -1);
		});

		test('falls back to data buffer match', () => {
			const sections: ICarouselSection[] = [{
				title: 'Section',
				images: [
					{ id: 'custom-id-1', name: 'a.png', mimeType: 'image/png', data: new Uint8Array([10, 20]) },
					{ id: 'custom-id-2', name: 'b.png', mimeType: 'image/png', data: new Uint8Array([30, 40]) },
				],
			}];
			const unknownUri = URI.from({ scheme: 'data', path: 'b.png' });
			assert.strictEqual(findClickedImageIndex(sections, unknownUri, new Uint8Array([30, 40])), 1);
		});

		test('returns -1 for empty sections', () => {
			assert.strictEqual(findClickedImageIndex([], URI.file('/x.png')), -1);
		});
	});

	suite('buildCollectionArgs', () => {

		test('uses section title when single section', () => {
			const sections = makeSections(2);
			const result = buildCollectionArgs(sections, 0, URI.file('/session'));
			assert.deepStrictEqual(result, {
				collection: {
					id: URI.file('/session').toString() + '_carousel',
					title: 'Section 0',
					sections,
				},
				startIndex: 0,
			});
		});

		test('uses generic title for multiple sections', () => {
			const sections = makeSections(1, 1);
			const result = buildCollectionArgs(sections, 1, URI.file('/session'));
			assert.strictEqual(result.collection.title, 'Conversation Images');
			assert.strictEqual(result.startIndex, 1);
		});
	});

	suite('buildSingleImageArgs', () => {

		test('extracts name and mime from URI path', () => {
			const uri = URI.file('/path/to/photo.jpg');
			const data = new Uint8Array([1, 2, 3]);
			assert.deepStrictEqual(buildSingleImageArgs(uri, data), {
				name: 'photo.jpg',
				mimeType: 'image/jpg',
				data,
				title: 'photo.jpg',
			});
		});

		test('defaults mime to image/png for unknown extension', () => {
			const uri = URI.file('/path/to/file.xyz');
			const data = new Uint8Array([1]);
			assert.strictEqual(buildSingleImageArgs(uri, data).mimeType, 'image/png');
		});
	});
});
