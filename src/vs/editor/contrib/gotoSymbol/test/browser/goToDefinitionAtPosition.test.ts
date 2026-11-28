/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { LocationLink } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../browser/link/goToDefinitionAtPosition.js';

interface IPreviewValueProvider {
	getPreviewValue(textEditorModel: ITextModel, startLineNumber: number, result: LocationLink): string;
}

suite('GotoDefinitionAtPosition', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preview removes the common indentation and keeps blank lines', () => {
		const model = store.add(createTextModel([
			'class A {',
			'\tfoo() {',
			'\t\tconst x = 1;',
			'',
			'\t\treturn x;',
			'\t}',
			'}',
		].join('\n')));
		const contribution = Object.create(GotoDefinitionAtPositionEditorContribution.prototype) as IPreviewValueProvider;

		assert.strictEqual(contribution.getPreviewValue(model, 2, { uri: model.uri, range: new Range(2, 1, 6, 3) }), [
			'foo() {',
			'\tconst x = 1;',
			'',
			'\treturn x;',
			'}',
		].join('\n'));
	});
});
