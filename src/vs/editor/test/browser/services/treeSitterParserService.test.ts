/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type * as Parser from '@vscode/tree-sitter-wasm';
import { createTextModel } from '../../common/testTextModel.js';
import { timeout } from '../../../../base/common/async.js';
import { ConsoleMainLogger, ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { LogService } from '../../../../platform/log/common/logService.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ITreeSitterImporter } from '../../../common/services/treeSitterParserService.js';
import { TextModelTreeSitter } from '../../../common/services/treeSitter/textModelTreeSitter.js';
import { TreeSitterLanguages } from '../../../common/services/treeSitter/treeSitterLanguages.js';

class MockParser implements Parser.Parser {
	language: Parser.Language | null = null;
	delete(): void { }
	setLanguage(language: Parser.Language | null) { return this; }
	parse(callback: string | Parser.ParseCallback, oldTree?: Parser.Tree | null, options?: Parser.ParseOptions): Parser.Tree | null {
		return new MockTree();
	}
	reset(): void { }
	getIncludedRanges(): Parser.Range[] {
		return [];
	}
	getTimeoutMicros(): number { return 0; }
	setTimeoutMicros(timeout: number): void { }
	setLogger(callback: Parser.LogCallback | boolean | null): this {
		throw new Error('Method not implemented.');
	}
	getLogger(): Parser.LogCallback | null {
		throw new Error('Method not implemented.');
	}
}

class MockTreeSitterImporter implements ITreeSitterImporter {
	_serviceBrand: undefined;
	async getParserClass(): Promise<typeof Parser.Parser> {
		return MockParser as any;
	}
	async getLanguageClass(): Promise<typeof Parser.Language> {
		return MockLanguage as any;
	}
	async getQueryClass(): Promise<typeof Parser.Query> {
		throw new Error('Method not implemented.');
	}
	parserClass = MockParser as any;
}

class MockTree implements Parser.Tree {
	language: Parser.Language = new MockLanguage();
	editorLanguage: string = '';
	editorContents: string = '';
	rootNode: Parser.Node = {} as any;
	rootNodeWithOffset(offsetBytes: number, offsetExtent: Parser.Point): Parser.Node {
		throw new Error('Method not implemented.');
	}
	copy(): Parser.Tree {
		throw new Error('Method not implemented.');
	}
	delete(): void { }
	edit(edit: Parser.Edit): Parser.Tree {
		return this;
	}
	walk(): Parser.TreeCursor {
		throw new Error('Method not implemented.');
	}
	getChangedRanges(other: Parser.Tree): Parser.Range[] {
		throw new Error('Method not implemented.');
	}
	getIncludedRanges(): Parser.Range[] {
		throw new Error('Method not implemented.');
	}
	getEditedRange(other: Parser.Tree): Parser.Range {
		throw new Error('Method not implemented.');
	}
	getLanguage(): Parser.Language {
		throw new Error('Method not implemented.');
	}
}

class MockLanguage implements Parser.Language {
	types: string[] = [];
	fields: (string | null)[] = [];
	get name(): string | null {
		throw new Error('Method not implemented.');
	}
	get abiVersion(): number {
		throw new Error('Method not implemented.');
	}
	get metadata(): Parser.LanguageMetadata | null {
		throw new Error('Method not implemented.');
	}
	get supertypes(): number[] {
		throw new Error('Method not implemented.');
	}
	subtypes(supertype: number): number[] {
		throw new Error('Method not implemented.');
	}
	version: number = 0;
	fieldCount: number = 0;
	stateCount: number = 0;
	nodeTypeCount: number = 0;
	fieldNameForId(fieldId: number): string | null {
		throw new Error('Method not implemented.');
	}
	fieldIdForName(fieldName: string): number | null {
		throw new Error('Method not implemented.');
	}
	idForNodeType(type: string, named: boolean): number {
		throw new Error('Method not implemented.');
	}
	nodeTypeForId(typeId: number): string | null {
		throw new Error('Method not implemented.');
	}
	nodeTypeIsNamed(typeId: number): boolean {
		throw new Error('Method not implemented.');
	}
	nodeTypeIsVisible(typeId: number): boolean {
		throw new Error('Method not implemented.');
	}
	nextState(stateId: number, typeId: number): number {
		throw new Error('Method not implemented.');
	}
	query(source: string): Parser.Query {
		throw new Error('Method not implemented.');
	}
	lookaheadIterator(stateId: number): Parser.LookaheadIterator | null {
		throw new Error('Method not implemented.');
	}
	languageId: string = '';
}

suite('TreeSitterParserService', function () {
	const treeSitterImporter: ITreeSitterImporter = new MockTreeSitterImporter();
	let logService: ILogService;
	let telemetryService: ITelemetryService;
	setup(function () {
		logService = new LogService(new ConsoleMainLogger());
		telemetryService = new class extends mock<ITelemetryService>() {
			override async publicLog2() {
				//
			}
		};
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('TextModelTreeSitter race condition: first language is slow to load', async function () {
		class MockTreeSitterLanguages extends TreeSitterLanguages {
			private async _fetchJavascript(): Promise<void> {
				await timeout(200);
				const language = new MockLanguage();
				language.languageId = 'javascript';
				this._onDidAddLanguage.fire({ id: 'javascript', language });
			}
			public override getOrInitLanguage(languageId: string): Parser.Language | undefined {
				if (languageId === 'javascript') {
					this._fetchJavascript();
					return undefined;
				}
				const language = new MockLanguage();
				language.languageId = languageId;
				return language;
			}
		}

		const treeSitterLanguages: TreeSitterLanguages = store.add(new MockTreeSitterLanguages(treeSitterImporter, {} as any, { isBuilt: false } as any, new Map()));
		const textModel = store.add(createTextModel('console.log("Hello, world!");', 'javascript'));
		const textModelTreeSitter = store.add(new TextModelTreeSitter(textModel, treeSitterLanguages, false, treeSitterImporter, logService, telemetryService, { exists: async () => false } as any));
		textModel.setLanguage('typescript');
		await timeout(300);
		assert.strictEqual((textModelTreeSitter.parseResult?.language as MockLanguage).languageId, 'typescript');
	});
});
