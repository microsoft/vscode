/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Checks and applies the rulesets that the JSON files of this folder define (see README.md):
//
//   node .github/rulesets/rulesets.ts check   fails when a live ruleset is missing or differs from its file
//   node .github/rulesets/rulesets.ts apply   creates or updates the live rulesets from their files (admins only)

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

type JsonValue = string | number | boolean | null | readonly JsonValue[] | IJsonObject;

interface IJsonObject {
	readonly [key: string]: JsonValue | undefined;
}

interface IRuleset extends IJsonObject {
	readonly name: string;
}

interface IRule extends IJsonObject {
	readonly type: string;
}

function isObject(value: JsonValue | undefined): value is IJsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compare(where: string, expected: JsonValue, actual: JsonValue | undefined, drift: string[]): void {
	if (isObject(expected) && isObject(actual)) {
		for (const [key, value] of Object.entries(expected)) {
			if (value !== undefined) {
				compare(`${where}.${key}`, value, actual[key], drift);
			}
		}
	} else if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
		expected.forEach((value: JsonValue, index: number) => compare(`${where}[${index}]`, value, actual[index], drift));
	} else if (JSON.stringify(expected) !== JSON.stringify(actual)) {
		drift.push(`${where}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
	}
}

/**
 * Returns how a live ruleset differs from its definition. Every value of the definition must equal the live one, while
 * the live ruleset may have fields that the definition omits, such as its id and timestamps, or defaults. Rules match by
 * type, and the live ruleset must not have rules that the definition lacks. The API shows the bypass actors to admins
 * only, so they are only compared when the live ruleset has them.
 */
export function findDrift(definition: IRuleset, live: IJsonObject): string[] {
	const drift: string[] = [];
	for (const [key, value] of Object.entries(definition)) {
		if (value === undefined || (key === 'bypass_actors' && live[key] === undefined)) {
			continue;
		}
		if (key !== 'rules') {
			compare(key, value, live[key], drift);
			continue;
		}
		const rules = value as readonly IRule[];
		const liveRules = new Map(((live.rules ?? []) as readonly IRule[]).map(rule => [rule.type, rule]));
		for (const rule of rules) {
			compare(`rules.${rule.type}`, rule, liveRules.get(rule.type), drift);
			liveRules.delete(rule.type);
		}
		for (const type of liveRules.keys()) {
			drift.push(`rules.${type}: not in the definition`);
		}
	}
	return drift;
}

const repository = process.env.GITHUB_REPOSITORY || 'microsoft/vscode';

function gh(args: readonly string[], input?: string): JsonValue {
	return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', input }));
}

function definitions(): { readonly file: string; readonly definition: IRuleset }[] {
	return readdirSync(import.meta.dirname)
		.filter(file => file.endsWith('.json'))
		.map(file => ({ file: path.join('.github/rulesets', file), definition: JSON.parse(readFileSync(path.join(import.meta.dirname, file), 'utf8')) }));
}

/** The ids of the rulesets of the repository itself, not those it inherits from the organization, by name. */
function liveRulesetIds(): Map<string, number> {
	const rulesets = gh([`repos/${repository}/rulesets?includes_parents=false&per_page=100`]) as readonly { readonly id: number; readonly name: string }[];
	return new Map(rulesets.map(ruleset => [ruleset.name, ruleset.id]));
}

function check(): boolean {
	const ids = liveRulesetIds();
	let ok = true;
	for (const { file, definition } of definitions()) {
		const id = ids.get(definition.name);
		if (id === undefined) {
			console.log(`::error file=${file}::${repository} has no ruleset named "${definition.name}". An admin needs to apply it (see .github/rulesets/README.md).`);
			ok = false;
			continue;
		}
		const live = gh([`repos/${repository}/rulesets/${id}`]) as IJsonObject;
		const drift = findDrift(definition, live);
		if (drift.length > 0) {
			console.log(`::error file=${file}::The ruleset "${definition.name}" (${id}) differs from ${file}. Apply the file, or update it to match the settings (see .github/rulesets/README.md):%0A${drift.join('%0A')}`);
			ok = false;
		} else {
			const bypassActors = live.bypass_actors === undefined ? ' Its bypass actors are only visible to admins, and were not compared.' : '';
			console.log(`The ruleset "${definition.name}" (${id}) matches ${file}.${bypassActors}`);
		}
	}
	return ok;
}

function apply(): void {
	const ids = liveRulesetIds();
	for (const { file, definition } of definitions()) {
		const id = ids.get(definition.name);
		const args = id === undefined ? ['-X', 'POST', `repos/${repository}/rulesets`] : ['-X', 'PUT', `repos/${repository}/rulesets/${id}`];
		const applied = gh([...args, '--input', '-'], JSON.stringify(definition)) as IJsonObject;
		console.log(`${id === undefined ? 'Created' : 'Updated'} the ruleset "${definition.name}" (${applied.id}) from ${file}.`);
	}
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === 'check') {
		process.exitCode = check() ? 0 : 1;
	} else if (command === 'apply') {
		apply();
	} else {
		console.error('Usage: node .github/rulesets/rulesets.ts check|apply');
		process.exitCode = 2;
	}
}
