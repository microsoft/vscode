/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';

import * as tt from 'typescript';
import TS from '../../common/typescript';
const ts = TS();

import { computeContext as _computeContext, nesRename as _nesRename, prepareNesRename as _prepareNesRename } from '../../common/api';
import { CharacterBudget, ComputeContextSession, ContextResult, NullLogger, RequestContext, type Logger, type Search } from '../../common/contextProvider';
import type { Host } from '../../common/host';
import { PrepareNesRenameResult } from '../../common/nesRenameValidator';
import { CodeSnippet, ContextKind, type ContextItem, type FullContextItem, type PriorityTag, type Range, type RenameGroup, type RenameKind, type Trait } from '../../common/protocol';
import { NullCancellationToken } from '../../common/typescripts';
import { NodeHost } from '../host';
import { LanguageServices } from './languageServices';

export class SingleLanguageServiceSession extends ComputeContextSession {

	private readonly languageService: tt.LanguageService;

	public readonly logger: Logger;

	constructor(languageService: tt.LanguageService, languageServiceHost: tt.LanguageServiceHost, host: Host) {
		super(languageServiceHost, host, false);
		this.languageService = languageService;
		this.logger = new NullLogger();
	}

	public logError(_error: Error, _cmd: string): void {
		// Null logger;
	}

	public *getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService> {
		const ls: tt.LanguageService | undefined = this.languageService;
		if (ls === undefined) {
			return;
		}
		if (sourceFile === undefined) {
			yield ls;
		} else {
			const file = ts.server.toNormalizedPath(sourceFile.fileName);
			const scriptInfo = ls.getProgram()?.getSourceFile(file);
			if (scriptInfo === undefined) {
				return;
			}
			yield ls;
		}
	}

	public override run<R>(search: Search<R>, context: RequestContext, token: tt.CancellationToken): [tt.Program | undefined, R | undefined] {
		const program = this.languageService.getProgram();
		if (program === undefined) {
			return [undefined, undefined];
		}
		if (search.score(program, context) === 0) {
			return [undefined, undefined];
		}
		const programSearch = search.with(program);
		const result = programSearch.run(context, token);
		if (result !== undefined) {
			return [program, result];
		} else {
			return [undefined, undefined];
		}
	}

	public override getScriptVersion(_sourceFile: tt.SourceFile): string | undefined {
		return undefined;
	}
}

function normalize(value: string): string {
	return value.trim().replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\t+/g, ' ').replace(/\s+/g, ' ');
}

export type ExpectedCodeSnippet = {
	kind: ContextKind.Snippet;
	value: string;
	fileName: RegExp;
};

export type ExpectedTrait = {
	kind: ContextKind.Trait;
	name: string;
	value: string;
};

export type ExpectedContextItem = ExpectedCodeSnippet | ExpectedTrait;

const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+([\w.-]+))?$|^(\d+)\.(\d+)$|^(\d+)$/;
function assertCodeSnippet(actual: CodeSnippet, expected: ExpectedCodeSnippet): void {
	assert.strictEqual(actual.kind, expected.kind);
	assert.ok(actual.kind === ContextKind.Snippet, `Expected snippet, got ${actual.kind}`);
	assert.ok(expected.kind === ContextKind.Snippet, `Expected snippet, got ${expected.kind}`);
	assert.strictEqual(normalize(actual.value), normalize(expected.value));
	const source = actual.fileName;
	assert.ok(source.match(expected.fileName) !== null);
}

function assertTrait(actual: Trait, expected: ExpectedTrait): void {
	assert.strictEqual(actual.kind, expected.kind);
	assert.ok(actual.kind === ContextKind.Trait, `Expected trait, got ${actual.kind}`);
	assert.ok(expected.kind === ContextKind.Trait, `Expected trait, got ${expected.kind}`);
	assert.strictEqual(actual.name, expected.name);
	if (actual.name.startsWith('The TypeScript version used in this project is')) {
		assert.ok(semverRegex.test(actual.value), `Expected semver, got ${actual.value}`);
	} else {
		assert.strictEqual(actual.value, expected.value);
	}
}

export function assertContextItems(actual: (ContextItem & PriorityTag)[], expected: ExpectedContextItem[], mode: 'equals' | 'contains' = 'equals'): void {
	const actualSnippets: (CodeSnippet & PriorityTag)[] = [];
	const actualTraits: (Trait & PriorityTag)[] = [];
	for (const item of actual) {
		if (item.kind === ContextKind.Snippet) {
			actualSnippets.push(item);
		} else if (item.kind === ContextKind.Trait) {
			actualTraits.push(item);
		}
	}
	actualSnippets.sort((a, b) => {
		return a.priority < b.priority ? 1 : a.priority > b.priority ? -1 : 0;
	});

	const expectedSnippets: ExpectedCodeSnippet[] = [];
	const expectedTraits: Map<string, ExpectedTrait> = new Map();
	for (const item of expected) {
		if (item.kind === ContextKind.Snippet) {
			expectedSnippets.push(item);
		} else if (item.kind === ContextKind.Trait) {
			expectedTraits.set(item.name, item);
		}
	}

	if (mode === 'equals') {
		assert.strictEqual(actualSnippets.length, expectedSnippets.length);
		for (let i = 0; i < actualSnippets.length; i++) {
			assertCodeSnippet(actualSnippets[i], expectedSnippets[i]);
		}
		assert.strictEqual(actualTraits.length, expectedTraits.size);
	} else {
		assert.ok(actualSnippets.length >= expectedSnippets.length, `Expected ${expectedSnippets.length} snippets, got ${actualSnippets.length}`);
		const actualSnippetMap: Map<string, CodeSnippet> = new Map();
		for (const actualSnippet of actualSnippets) {
			actualSnippetMap.set(normalize(actualSnippet.value), actualSnippet);
		}
		for (const expectedSnippet of expectedSnippets) {
			const actualSnippet = actualSnippetMap.get(normalize(expectedSnippet.value));
			assert.ok(actualSnippet !== undefined, `Missing expected snippet ${expectedSnippet.value}`);
			assertCodeSnippet(actualSnippet, expectedSnippet);
		}
	}
	for (const actualTrait of actualTraits) {
		const expectedTrait = expectedTraits.get(actualTrait.name);
		assert.ok(expectedTrait !== undefined, `Missing expected trait ${actualTrait.name}`);
		expectedTraits.delete(actualTrait.name);
		assertTrait(actualTrait, expectedTrait);
	}
	assert.strictEqual(expectedTraits.size, 0);
}

export type TestSession = {
	service: tt.LanguageService;
	session: ComputeContextSession;
};

export type ContextItemWithPriority = FullContextItem & PriorityTag;

export function computeContext(session: TestSession, document: string, position: { line: number; character: number }, contextKind: ContextKind): ContextItemWithPriority[] {
	const result: ContextResult = new ContextResult(new CharacterBudget(7 * 1024 * 4), new CharacterBudget(8 * 1024 * 4), new RequestContext(session.session, [], new Map(), true));
	const program = session.service.getProgram();
	if (program === undefined) {
		return [];
	}
	const sourceFile = program.getSourceFile(document);
	if (sourceFile === undefined) {
		return [];
	}
	const pos = sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
	_computeContext(result, session.session, session.service, document, pos, new NullCancellationToken());
	return result.items().filter((item) => item.kind === contextKind);
}

export function prepareNesRename(session: TestSession, document: string, position: { line: number; character: number }, oldName: string, newName: string, lastSymbolRename?: Range): RenameKind | undefined {
	const program = session.service.getProgram();
	if (program === undefined) {
		return;
	}
	const sourceFile = program.getSourceFile(document);
	if (sourceFile === undefined) {
		return;
	}
	const result = new PrepareNesRenameResult();
	const pos = sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
	_prepareNesRename(result, session.session, session.service, document, pos, oldName, newName, lastSymbolRename, new NullCancellationToken());
	return result.getCanRename();
}

export function nesRename(session: TestSession, document: string, position: { line: number; character: number }, oldName: string, newName: string, lastSymbolRename: Range): RenameGroup[] {
	const program = session.service.getProgram();
	if (program === undefined) {
		return [];
	}
	const sourceFile = program.getSourceFile(document);
	if (sourceFile === undefined) {
		return [];
	}
	const pos = sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
	return _nesRename(session.session, session.service, document, pos, oldName, newName, lastSymbolRename);
}

class LanguageServiceTestSession extends SingleLanguageServiceSession {
	constructor(service: tt.LanguageService, languageServiceHost: tt.LanguageServiceHost, host: NodeHost) {
		super(service, languageServiceHost, host);
	}

	public override enableBlueprintSearch(): boolean {
		return true;
	}
}

export function create(fileOrDirectory: string): TestSession {
	const [service, host] = LanguageServices.createLanguageService(fileOrDirectory);
	const session = new LanguageServiceTestSession(service, host, new NodeHost());
	return { service, session };
}
