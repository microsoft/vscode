/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { TokenSelectionSupport } from 'vs/editor/contrib/smartSelect/tokenSelectionSupport';
import { MockMode, StaticLanguageSelector } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { javascriptOnEnterRules } from 'vs/editor/test/common/modes/supports/javascriptOnEnterRules';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { isLinux, isMacintosh } from 'vs/base/common/platform';

class MockJSMode extends MockMode {

	private static readonly _id = new LanguageIdentifier('mockJSMode', 3);

	constructor() {
		super(MockJSMode._id);

		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			brackets: [
				['(', ')'],
				['{', '}'],
				['[', ']']
			],

			onEnterRules: javascriptOnEnterRules
		}));
	}
}

suite('TokenSelectionSupport', () => {

	let modelService: ModelServiceImpl | null = null;
	let tokenSelectionSupport: TokenSelectionSupport;
	let mode: MockJSMode | null = null;

	setup(() => {
		const configurationService = new TestConfigurationService();
		modelService = new ModelServiceImpl(null, configurationService, new TestTextResourcePropertiesService(configurationService));
		tokenSelectionSupport = new TokenSelectionSupport(modelService);
		mode = new MockJSMode();
	});

	teardown(() => {
		modelService.dispose();
		mode.dispose();
	});

	function assertGetRangesToPosition(text: string[], lineNumber: number, column: number, ranges: Range[]): void {
		let uri = URI.file('test.js');
		modelService.createModel(text.join('\n'), new StaticLanguageSelector(mode.getLanguageIdentifier()), uri);

		let actual = tokenSelectionSupport.getRangesToPositionSync(uri, new Position(lineNumber, column));

		let actualStr = actual.map(r => new Range(r.range.startLineNumber, r.range.startColumn, r.range.endLineNumber, r.range.endColumn).toString());
		let desiredStr = ranges.map(r => String(r));

		assert.deepEqual(actualStr, desiredStr);

		modelService.destroyModel(uri);
	}

	test('getRangesToPosition #1', () => {

		assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			'\t\treturn (bar + (2 * foo))',
			'\t}',
			'}'
		], 3, 20, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(3, 1, 4, 2),
				new Range(3, 1, 3, 27),
				new Range(3, 10, 3, 27),
				new Range(3, 11, 3, 26),
				new Range(3, 17, 3, 26),
				new Range(3, 18, 3, 25),
				// new Range(3, 19, 3, 20)
			]);
	});

	test('getRangesToPosition #56886. Skip empty lines correctly.', () => {

		assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			'',
			'\t}',
			'}'
		], 3, 1, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3)
			]);
	});

	test('getRangesToPosition #56886. Do not skip lines with only whitespaces.', () => {

		assertGetRangesToPosition([
			'function a(bar, foo){',
			'\tif (bar) {',
			' ',
			'\t}',
			'}'
		], 3, 1, [
				new Range(1, 1, 5, 2),
				new Range(1, 21, 5, 2),
				new Range(2, 1, 4, 3),
				new Range(2, 11, 4, 3),
				new Range(3, 1, 4, 2),
				new Range(3, 1, 3, 2)
			]);
	});

	test('getRangesToPosition #40658. Cursor at first position inside brackets should select line inside.', () => {

		assertGetRangesToPosition([
			' [ ]',
			' { } ',
			'( ) '
		], 2, 3, [
				new Range(1, 1, 3, 5),
				new Range(2, 1, 2, 6),
				new Range(2, 2, 2, 5),
				new Range(2, 3, 2, 4)
			]);
	});

	test('getRangesToPosition #40658. Cursor in empty brackets should reveal brackets first.', () => {

		assertGetRangesToPosition([
			' [] ',
			' { } ',
			'  ( ) '
		], 1, 3, [
				new Range(1, 1, 3, 7),
				new Range(1, 1, 1, 5),
				new Range(1, 2, 1, 4)
			]);
	});

	test('getRangesToPosition #40658. Tokens before bracket will be revealed first.', () => {

		assertGetRangesToPosition([
			'  [] ',
			' { } ',
			'selectthis( ) '
		], 3, 11, [
				new Range(1, 1, 3, 15),
				new Range(3, 1, 3, 15),
				new Range(3, 1, 3, 11)
			]);
	});
});

class TestTextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: any;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI): string {
		const filesConfiguration = this.configurationService.getValue<{ eol: string }>('files');
		if (filesConfiguration && filesConfiguration.eol) {
			if (filesConfiguration.eol !== 'auto') {
				return filesConfiguration.eol;
			}
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}

