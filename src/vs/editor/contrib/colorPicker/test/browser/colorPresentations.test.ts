/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DocumentColorProvider, IColorInformation, IColorPresentation } from '../../../../common/languages.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { getColorPresentations } from '../../browser/color.js';
import { createColorHover, updateColorPresentations, updateEditorModel } from '../../browser/colorPickerParticipantUtils.js';
import { DefaultDocumentColorProvider } from '../../browser/defaultDocumentColorProvider.js';

suite('Color picker presentations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const range = new Range(1, 1, 1, 22);
	const colorInfo: IColorInformation = { range, color: { red: 1, green: 0, blue: 0, alpha: 0.55 } };

	function providerFor(presentations: IColorPresentation[]): DocumentColorProvider {
		return {
			provideDocumentColors: () => [],
			provideColorPresentations: () => presentations
		};
	}

	test('Modernizes CSS language service presentations without changing edits or ordering', async () => {
		const labels = [
			'rgba(255, 0, 0, 0.55)', '#ff00008c', 'hsla(0, 100%, 50%, 0.55)',
			'hwb(0 0% 0% / 0.55)', 'lab(54.29% 80.81 69.89 / 0.55)',
			'lch(54.29% 106.84 40.85 / 0.55)', 'oklab(62.8% 0.22 0.13 / 0.55)',
			'oklch(62.8% 0.26 29.23 / 0.55)'
		];
		const presentations = labels.map(label => ({ label, textEdit: { range, text: label } }));
		const actual = await getColorPresentations(null!, colorInfo, providerFor(presentations), CancellationToken.None, true);
		const expected = [
			'rgb(255 0 0 / 55%)', '#ff00008c', 'hsl(0deg 100% 50% / 55%)',
			'hwb(0deg 0% 0% / 55%)', 'lab(54.29% 80.81 69.89 / 55%)',
			'lch(54.29% 106.84 40.85deg / 55%)', 'oklab(62.8% 0.22 0.13 / 55%)',
			'oklch(62.8% 0.26 29.23deg / 55%)'
		];
		assert.deepStrictEqual(actual, expected.map(label => ({ label, textEdit: { range, text: label } })));
		assert.deepStrictEqual(presentations.map(p => p.label), labels);
	});

	test('Preserves default and explicitly disabled output', async () => {
		const presentations = [{ label: 'hsla(0, 100%, 50%, 0.55)', textEdit: { range, text: 'hsla(0, 100%, 50%, 0.55)' } }];
		const provider = providerFor(presentations);
		assert.deepStrictEqual([
			await getColorPresentations(null!, colorInfo, provider, CancellationToken.None),
			await getColorPresentations(null!, colorInfo, provider, CancellationToken.None, false)
		], [presentations, presentations]);
	});

	test('Handles opaque, transparent, percentage, and already modern colors', async () => {
		const labels = ['rgb(255, 0, 0)', 'hsl(120, 50%, 75%)', 'rgba(0, 0, 0, 0)', 'rgb(100%, 0%, 0%, 55%)', 'hsl(0deg 100% 50% / 55%)', 'hsl(.5turn 100% 50%)'];
		const actual = await getColorPresentations(null!, colorInfo, providerFor(labels.map(label => ({ label }))), CancellationToken.None, true);
		assert.deepStrictEqual(actual?.map(p => p.label), ['rgb(255 0 0)', 'hsl(120deg 50% 75%)', 'rgb(0 0 0 / 0%)', 'rgb(100% 0% 0% / 55%)', labels[4], labels[5]]);
	});

	test('Preserves custom presentations and additional edits', async () => {
		const additionalTextEdits = [{ range, text: 'custom' }];
		const presentations: IColorPresentation[] = [
			{ label: 'rgba(255, 0, 0, 0.55)', textEdit: { range, text: 'Color(255, 0, 0, 0.55)' } },
			{ label: 'Color(255, 0, 0, 0.55)' },
			{ label: 'rgb(var(--red) 0 0)' },
			{ label: 'rgb(1, 2)' },
			{ label: 'rgb(1, 2, 3)', textEdit: { range, text: 'rgb(1, 2, 3)' }, additionalTextEdits }
		];
		const actual = await getColorPresentations(null!, colorInfo, providerFor(presentations), CancellationToken.None, true);
		assert.deepStrictEqual(actual, [...presentations.slice(0, 4), { label: 'rgb(1 2 3)', textEdit: { range, text: 'rgb(1 2 3)' }, additionalTextEdits }]);
	});

	test('Preserves absent provider results', async () => {
		const provider: DocumentColorProvider = { provideDocumentColors: () => [], provideColorPresentations: () => null };
		assert.strictEqual(await getColorPresentations(null!, colorInfo, provider, CancellationToken.None, true), null);
	});

	for (const text of ['hsla(0, 100%, 50%, .55)', 'hsl(0deg 100% 50% / 55%)']) {
		test(`Selects HSL and inserts modern syntax for ${text}`, async () => {
			await withAsyncTestCodeEditor(text, { colorPickerUseModernSyntax: true }, async editor => {
				const info = { ...colorInfo, range: editor.getModel().getFullModelRange() };
				const hover = await createColorHover(editor, info, new DefaultDocumentColorProvider(null!));
				store.add(hover.model);
				updateEditorModel(editor, hover.range, hover.model);
				assert.deepStrictEqual({ label: hover.model.presentation.label, text: editor.getModel().getValue() }, {
					label: 'hsl(0deg 100% 50% / 55%)', text: 'hsl(0deg 100% 50% / 55%)'
				});
			});
		});
	}

	test('Recomputes presentations when the setting is enabled, disabled, and re-enabled', async () => {
		await withAsyncTestCodeEditor('rgba(255, 0, 0, .55)', {}, async editor => {
			const hover = await createColorHover(editor, colorInfo, new DefaultDocumentColorProvider(null!));
			store.add(hover.model);
			const labels = [hover.model.presentation.label];
			for (const enabled of [true, false, true]) {
				editor.updateOptions({ colorPickerUseModernSyntax: enabled });
				await updateColorPresentations(editor, hover.model, hover.model.color, hover.range, hover);
				labels.push(hover.model.presentation.label);
			}
			assert.deepStrictEqual(labels, ['rgba(255, 0, 0, 0.55)', 'rgb(255 0 0 / 55%)', 'rgba(255, 0, 0, 0.55)', 'rgb(255 0 0 / 55%)']);
		});
	});
});
