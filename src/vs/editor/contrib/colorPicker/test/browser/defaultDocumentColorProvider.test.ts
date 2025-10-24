/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DefaultDocumentColorProvider } from '../../browser/defaultDocumentColorProvider.js';
import { IColorInformation } from '../../../../common/languages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../common/model.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';

suite('DefaultDocumentColorProvider', () => {

	let provider: DefaultDocumentColorProvider;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		provider = new DefaultDocumentColorProvider({} as IEditorWorkerService);
	});

	suite('provideColorPresentations', () => {
		test('should handle transparent colors correctly', () => {
			// Test case from issue: rgba(0, 0, 0, 0) should become #00000000, not #000000
			const transparentBlackInfo: IColorInformation = {
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				color: { red: 0, green: 0, blue: 0, alpha: 0 }
			};

			const presentations = provider.provideColorPresentations({} as ITextModel, transparentBlackInfo, CancellationToken.None);

			// Find the hex presentation
			const hexPresentation = presentations.find(p => p.label.startsWith('#'));
			assert.ok(hexPresentation, 'Should have a hex presentation');
			assert.strictEqual(hexPresentation.label, '#00000000', 'Transparent black should be #00000000');
		});

		test('should handle opaque colors correctly', () => {
			const opaqueBlackInfo: IColorInformation = {
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				color: { red: 0, green: 0, blue: 0, alpha: 1 }
			};

			const presentations = provider.provideColorPresentations({} as ITextModel, opaqueBlackInfo, CancellationToken.None);

			// Find the hex presentation
			const hexPresentation = presentations.find(p => p.label.startsWith('#'));
			assert.ok(hexPresentation, 'Should have a hex presentation');
			assert.strictEqual(hexPresentation.label, '#000000', 'Opaque black should be #000000');
		});

		test('should handle semi-transparent colors correctly', () => {
			const semiTransparentBlackInfo: IColorInformation = {
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				color: { red: 0, green: 0, blue: 0, alpha: 0.5 }
			};

			const presentations = provider.provideColorPresentations({} as ITextModel, semiTransparentBlackInfo, CancellationToken.None);

			// Find the hex presentation
			const hexPresentation = presentations.find(p => p.label.startsWith('#'));
			assert.ok(hexPresentation, 'Should have a hex presentation');
			assert.strictEqual(hexPresentation.label, '#00000080', 'Semi-transparent black should be #00000080');
		});

		test('should handle transparent red correctly', () => {
			const transparentRedInfo: IColorInformation = {
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				color: { red: 1, green: 0, blue: 0, alpha: 0 }
			};

			const presentations = provider.provideColorPresentations({} as ITextModel, transparentRedInfo, CancellationToken.None);

			// Find the hex presentation
			const hexPresentation = presentations.find(p => p.label.startsWith('#'));
			assert.ok(hexPresentation, 'Should have a hex presentation');
			assert.strictEqual(hexPresentation.label, '#ff000000', 'Transparent red should be #ff000000');
		});

		test('should provide all three color format options', () => {
			const colorInfo: IColorInformation = {
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				color: { red: 0.5, green: 0.5, blue: 0.5, alpha: 0.75 }
			};

			const presentations = provider.provideColorPresentations({} as ITextModel, colorInfo, CancellationToken.None);

			assert.strictEqual(presentations.length, 3, 'Should provide exactly 3 color presentations');

			const labels = presentations.map(p => p.label);
			assert.ok(labels.some(l => l.startsWith('rgba(')), 'Should include rgba format');
			assert.ok(labels.some(l => l.startsWith('hsla(')), 'Should include hsla format');
			assert.ok(labels.some(l => l.startsWith('#')), 'Should include hex format');
		});
	});
});
