/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { DiffServiceImpl } from '../../../../platform/diff/node/diffServiceImpl';
import { stringEditFromDiff } from '../../../../platform/editing/common/edit';
import { RootedEdit } from '../../../../platform/inlineEdits/common/dataTypes/edit';
import { ImportChanges } from '../../../../platform/inlineEdits/common/dataTypes/importFilteringOptions';
import { LanguageId } from '../../../../platform/inlineEdits/common/dataTypes/languageId';
import { StatelessNextEditDocument } from '../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { IgnoreImportChangesAspect } from '../../node/importFiltering';

suite('IgnoreImportChangesAspect', () => {
	const diffService = new DiffServiceImpl();

	async function computeDiff(val1: StringText, val2: StringText): Promise<RootedEdit> {
		const edit = await stringEditFromDiff(val1.value, val2.value, diffService);
		return new RootedEdit(val1, edit);
	}

	const doc1 = new StringText(`
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { win32 } from '../../../util/vs/base/common/path';

class FooBar {
}
	`);


	test('ImportDeletion', async () => {
		const doc2 = new StringText(`
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { win32 } from '../../../util/vs/base/common/path';

class FooBar {
}
`);

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(doc1, doc2));
		expect(IgnoreImportChangesAspect.isImportChange(lineEdit.replacements[0], 'typescript', doc1.getLines())).toBe(true);
	});


	test('ImportAddition', async () => {
		const doc2 = new StringText(`
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { assert2 } from '../../../util/vs/base/common/assert2';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { win32 } from '../../../util/vs/base/common/path';

class FooBar {
}
`);

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(doc1, doc2));
		expect(IgnoreImportChangesAspect.isImportChange(lineEdit.replacements[0], 'typescript', doc1.getLines())).toBe(true);
	});

	test('ImportChange', async () => {
		const doc2 = new StringText(`
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { CancellationToken2 } from '../../../util/vs/base/common/cancellation';
import { win32 } from '../../../util/vs/base/common/path';

class FooBar {
}
`);

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(doc1, doc2));
		expect(IgnoreImportChangesAspect.isImportChange(lineEdit.replacements[0], 'typescript', doc1.getLines())).toBe(true);
	});


	test('ClassChange', async () => {
		const doc2 = new StringText(`
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../util/vs/base/common/assert';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { win32 } from '../../../util/vs/base/common/path';

class FooBar {
	test() {}
}
`);

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(doc1, doc2));
		expect(IgnoreImportChangesAspect.isImportChange(lineEdit.replacements[0], 'typescript', doc1.getLines())).toBe(false);
	});
});

suite('filterEdit with ImportChanges', () => {
	const diffService = new DiffServiceImpl();

	async function computeDiff(val1: StringText, val2: StringText): Promise<RootedEdit> {
		const edit = await stringEditFromDiff(val1.value, val2.value, diffService);
		return new RootedEdit(val1, edit);
	}

	function makeDoc(languageId: string, lines: string[]): Pick<StatelessNextEditDocument, 'languageId' | 'documentLinesBeforeEdit'> {
		return { languageId: LanguageId.create(languageId), documentLinesBeforeEdit: lines };
	}

	const tsDocWithLocalImport = new StringText([
		`import { foo } from './local';`,
		'',
		'class A {}',
	].join('\n'));

	const tsDocWithBothImports = new StringText([
		`import { foo } from './local';`,
		`import { bar } from 'lodash';`,
		'',
		'class A {}',
	].join('\n'));

	test('none filters all imports', async () => {
		const modified = new StringText([
			`import { foo } from './local';`,
			`import { baz } from './new-local';`,
			'',
			'class A {}',
		].join('\n'));

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(tsDocWithLocalImport, modified));
		const doc = makeDoc('typescript', tsDocWithLocalImport.getLines());
		const result = IgnoreImportChangesAspect.filterEdit(doc as StatelessNextEditDocument, lineEdit.replacements, ImportChanges.None);
		expect(result).toHaveLength(0);
	});

	test('all keeps all imports', async () => {
		const modified = new StringText([
			`import { foo } from './local';`,
			`import { baz } from 'lodash';`,
			'',
			'class A {}',
		].join('\n'));

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(tsDocWithLocalImport, modified));
		const doc = makeDoc('typescript', tsDocWithLocalImport.getLines());
		const result = IgnoreImportChangesAspect.filterEdit(doc as StatelessNextEditDocument, lineEdit.replacements, ImportChanges.All);
		expect(result).toHaveLength(lineEdit.replacements.length);
	});

	test('none still keeps non-import edits', async () => {
		const modified = new StringText([
			`import { foo } from './local';`,
			`import { bar } from 'lodash';`,
			'',
			'class A { method() {} }',
		].join('\n'));

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(tsDocWithBothImports, modified));
		const doc = makeDoc('typescript', tsDocWithBothImports.getLines());
		const result = IgnoreImportChangesAspect.filterEdit(doc as StatelessNextEditDocument, lineEdit.replacements, ImportChanges.None);
		expect(result.length).toBeGreaterThan(0);
		const allNewLines = result.flatMap(r => r.newLines);
		expect(allNewLines.some(l => l.includes('method'))).toBe(true);
	});

	test('defaults to none when no mode specified', async () => {
		const modified = new StringText([
			`import { foo } from './local';`,
			`import { baz } from './new-local';`,
			'',
			'class A {}',
		].join('\n'));

		const lineEdit = RootedEdit.toLineEdit(await computeDiff(tsDocWithLocalImport, modified));
		const doc = makeDoc('typescript', tsDocWithLocalImport.getLines());
		const result = IgnoreImportChangesAspect.filterEdit(doc as StatelessNextEditDocument, lineEdit.replacements);
		expect(result).toHaveLength(0);
	});
});
