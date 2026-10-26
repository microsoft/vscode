/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import path from 'node:path';

import { API } from '@typescript/native/unstable/async';
import { version } from '@typescript/native';
import type * as vscode from 'vscode';
import { afterAll, beforeAll, suite, test } from 'vitest';
import * as protocol from '../../../common/serverProtocol';
import { computeContext } from '../api';
import { CharacterBudget, ComputeContextSession, ContextResult, RequestContext } from '../contextProvider';
import { CancellationTokenWithTimer } from '../typescripts';

const fixtures = path.join(__dirname, '../../../serverPlugin/fixtures/context');
const cancellationToken: vscode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => ({ dispose() { } }),
};

suite('TypeScript 7 context engine', () => {
	let api: API;

	beforeAll(() => {
		api = new API({ cwd: process.cwd() });
	});

	afterAll(async () => {
		await api.close();
	});

	test('computes compiler option traits', async () => {
		const items = await compute('p1', 'source/f1.ts', 0, 0);
		const traits = items.filter(item => item.kind === protocol.ContextKind.Trait).map(item => [item.name, item.value]);
		assert.deepStrictEqual(traits, [
			['The TypeScript version used in this project is ', version],
			['The TypeScript module system used in this project is ', 'Node16'],
			['The TypeScript module resolution strategy used in this project is ', 'Node16'],
			['The target version of JavaScript for this project is ', 'ES2022'],
			['Library files that should be included in TypeScript compilation are ', 'lib.es2022.d.ts,lib.dom.d.ts'],
		]);
	});

	test.skip('computes imported and local types', async () => {
		const imported = await compute('p12', 'source/f2.ts', 3, 0);
		const local = await compute('p12', 'source/f3.ts', 4, 0, 'TypeOfLocalsRunnable');
		const expected = normalize('declare class Person { constructor(age: number = 10); public getAlter(): number; }');
		assert.deepStrictEqual({
			imported: snippets(imported).includes(expected),
			local: snippets(local).includes(expected),
		}, { imported: true, local: true });
	});

	test('computes function signature types', async () => {
		const items = await compute('p7', 'source/f2.ts', 6, 0);
		const values = snippets(items);
		assert.deepStrictEqual([
			'declare class Foo { public foo(): void; }',
			'interface Bar { bar(): void; }',
			'enum Enum { a = 1, b = 2 }',
			'const enum CEnum { a = 1, b = 2 }',
			'type Baz = { baz(): void; bazz: () => number; }',
		].map(value => values.includes(normalize(value))), [true, true, true, true, true]);
	});

	test('computes inherited and property types', async () => {
		const inherited = await compute('p2', 'source/f2.ts', 5, 0);
		const properties = await compute('p13', 'source/f2.ts', 15, 0);
		assert.deepStrictEqual({
			inherited: snippets(inherited).includes(normalize('declare class B { /** * The distance between two points. */ protected distance: number; /** * The length of the line. */ protected _length: number; /** * Returns the occurrence of \'foo\'. * * @returns the occurrence of \'foo\'. */ public foo(): number; }')),
			age: snippets(properties).includes(normalize('type Age = { value: number; }')),
			street: snippets(properties).includes(normalize('declare class Street { constructor(name: string); public getName(); }')),
		}, { inherited: true, age: true, street: true });
	});

	test('computes expression types', async () => {
		const calculator = await compute('p14', 'source/f3.ts', 4, 22);
		const result = await compute('p14', 'source/f4.ts', 4, 25);
		assert.deepStrictEqual({
			calculator: snippets(calculator).includes(normalize('declare class Calculator { constructor(initial: number = 0); public add(x: number): Calculator; public getResult(): Result; }')),
			result: snippets(result).includes(normalize('interface Result { value: number; message: string; }')),
		}, { calculator: true, result: true });
	});

	test('computes class, method, and constructor blueprints', async () => {
		const classItems = snippets(await compute('p1', 'source/f3.ts', 3, 0));
		const methodItems = snippets(await compute('p5', 'source/f3.ts', 4, 0));
		const constructorItems = snippets(await compute('p8', 'source/f3.ts', 5, 0));
		assert.deepStrictEqual({
			class: classItems.includes(normalize('export class X implements Name, NameLength { name() { return \'x\'; } length() { return \'x\'.length; } }')),
			method: methodItems.includes(normalize('/** * Javadoc */ export class Bar extends Foo { private name(): string { return \'Bar\'; } }')),
			constructor: constructorItems.includes(normalize('/** * Javadoc */ export class Bar extends Foo { private name: string; constructor() { super(); this.name = \'Bar\'; } }')),
		}, { class: true, method: true, constructor: true });
	});

	async function compute(projectName: string, relativeFile: string, line: number, character: number, runnableId?: protocol.ContextRunnableResultId): Promise<protocol.FullContextItem[]> {
		const projectDirectory = path.join(fixtures, projectName);
		const configFile = path.join(projectDirectory, 'tsconfig.json');
		const fileName = path.join(projectDirectory, relativeFile);
		const snapshot = await api.updateSnapshot({ openProjects: [configFile] });
		try {
			const project = snapshot.getProject(configFile) ?? await snapshot.getDefaultProjectForFile(fileName);
			assert.ok(project !== undefined, `No project for ${fileName}`);
			const sourceFile = await project.program.getSourceFile(fileName);
			assert.ok(sourceFile !== undefined, `No source file for ${fileName}`);
			const startTime = Date.now();
			const token = new CancellationTokenWithTimer(cancellationToken, startTime, 30_000);
			const session = new TestComputeContextSession(project, token);
			const context = new RequestContext(session, [], new Map(), true);
			const result = new ContextResult(new CharacterBudget(7 * 1024 * 4), new CharacterBudget(8 * 1024 * 4), context);
			const position = sourceFile.getPositionOfLineAndCharacter(line, character);
			await computeContext(result, session, project, sourceFile, position, token);
			return resolveItems(result.toJson(), runnableId);
		} finally {
			await snapshot.dispose();
		}
	}
});

class TestComputeContextSession extends ComputeContextSession {
	public override enableBlueprintSearch(): boolean {
		return true;
	}
}

function resolveItems(response: protocol.ComputeContextResponse.OK, runnableId?: protocol.ContextRunnableResultId): protocol.FullContextItem[] {
	const itemMap = new Map<protocol.ContextItemKey, protocol.FullContextItem>();
	for (const item of response.contextItems ?? []) {
		if (item.kind !== protocol.ContextKind.Reference && protocol.ContextItem.hasKey(item)) {
			itemMap.set(item.key, item);
		}
	}
	const result: protocol.FullContextItem[] = [];
	const seen = new Set<protocol.ContextItemKey>();
	for (const runnable of response.runnableResults ?? []) {
		if (runnable.kind !== protocol.ContextRunnableResultKind.ComputedResult || (runnableId !== undefined && runnable.id !== runnableId)) {
			continue;
		}
		for (const item of runnable.items) {
			if (item.kind === protocol.ContextKind.Reference) {
				if (seen.has(item.key)) {
					continue;
				}
				const referenced = itemMap.get(item.key);
				if (referenced !== undefined) {
					seen.add(item.key);
					result.push(referenced);
				}
			} else {
				result.push(item);
			}
		}
	}
	return result;
}

function snippets(items: readonly protocol.FullContextItem[]): string[] {
	return items.filter(item => item.kind === protocol.ContextKind.Snippet).map(item => normalize(item.value));
}

function normalize(value: string): string {
	return value.trim().replace(/\r?\n/g, ' ').replace(/\t+/g, ' ').replace(/\s+/g, ' ');
}
