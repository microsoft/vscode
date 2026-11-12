/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

type VisitorKeys = Context['sourceCode']['visitorKeys'];

/** A method, getter or function-valued field that a field initializer can run. */
interface Member {
	readonly runsOn: 'call' | 'access';
	/** What runs: the parameters, whose default values run when the arguments are left out, and the body. */
	readonly roots: readonly ESTree.Node[];
}

/** How running a member reads a parameter property: its name, and the path to it, such as `['this.update()', 'this.service']`. */
interface Read {
	readonly name: string;
	readonly path: readonly string[];
}

/**
 * With JavaScript class field semantics (`useDefineForClassFields`), class fields are initialized before the
 * constructor assigns the parameter properties, so a field initializer must not read a parameter property, directly or
 * through the methods and getters that it runs.
 *
 * This only follows code that runs during initialization: function bodies are skipped unless the initializer calls them
 * as a method or a function-valued field of the same class, or reads them as a getter.
 */
export default new class NoParameterPropertyBeforeInit implements CreateRule {
	meta: RuleMeta = {
		type: 'problem',
		messages: {
			direct: 'Parameter property \'{{name}}\' is read before it is initialized: class fields are initialized before the constructor assigns parameter properties.',
			indirect: 'Parameter property \'{{name}}\' is read before it is initialized, through {{path}}: class fields are initialized before the constructor assigns parameter properties.',
		},
		schema: false,
	};

	create(context: Context): Visitor {
		const visitorKeys = context.sourceCode.visitorKeys;
		return {
			ClassBody: (body: ESTree.ClassBody) => {
				const parameterProperties = getParameterProperties(body);
				if (!parameterProperties.size) {
					return;
				}

				const members = getMembers(body);

				/** Calls `onRead` for each parameter property that `root` reads, and `onRun` for each member that it runs, until either returns `true`. */
				const forEachUse = (root: ESTree.Node, onRead: (node: ESTree.MemberExpression, name: string) => boolean, onRun: (node: ESTree.MemberExpression, name: string) => boolean) => {
					walk(root, visitorKeys, node => {
						const name = getThisMemberName(node);
						if (name === undefined || isAssignmentTarget(node as ESTree.MemberExpression)) {
							return false;
						}
						const memberExpression = node as ESTree.MemberExpression;
						if (parameterProperties.has(name)) {
							return onRead(memberExpression, name);
						}
						const member = members.get(name);
						return member && (member.runsOn === 'access' || isInvoked(memberExpression)) ? onRun(memberExpression, name) : false;
					});
				};

				/** What running each member reads directly, and the members that it runs, in order. */
				const summaries = new Map<string, { readonly read: Read | null; readonly runs: readonly { readonly name: string; readonly label: string }[] }>();
				const summarize = (memberName: string) => {
					let summary = summaries.get(memberName);
					if (!summary) {
						let read: Read | null = null;
						const runs: { name: string; label: string }[] = [];
						for (const root of members.get(memberName)!.roots) {
							forEachUse(root, (node, name) => {
								read = { name, path: [formatThisMember(node, name)] };
								return true;
							}, (node, name) => {
								runs.push({ name, label: formatThisMember(node, name) });
								return false;
							});
							if (read) {
								break;
							}
						}
						summary = { read, runs };
						summaries.set(memberName, summary);
					}
					return summary;
				};

				/** How running each member reads a parameter property, directly or through the members that it runs. */
				const reads = new Map<string, Read | null>();
				const getRead = (memberName: string): Read | null => {
					if (!reads.has(memberName)) {
						// Summarize the members that the member can run, then propagate their reads until nothing changes,
						// which handles members that run each other.
						const reachable = [memberName];
						for (let i = 0; i < reachable.length; i++) {
							for (const { name } of summarize(reachable[i]).runs) {
								if (!reads.has(name) && !reachable.includes(name)) {
									reachable.push(name);
								}
							}
						}
						const found = new Map(reachable.map(name => [name, summarize(name).read]));
						for (let changed = true; changed;) {
							changed = false;
							for (const name of reachable) {
								if (!found.get(name)) {
									for (const run of summarize(name).runs) {
										const read = reads.get(run.name) ?? found.get(run.name);
										if (read) {
											found.set(name, { name: read.name, path: [run.label, ...read.path] });
											changed = true;
											break;
										}
									}
								}
							}
						}
						for (const [name, read] of found) {
							reads.set(name, read);
						}
					}
					return reads.get(memberName)!;
				};

				for (const element of body.body) {
					if ((element.type === 'PropertyDefinition' || element.type === 'AccessorProperty') && !element.static && element.value) {
						forEachUse(element.value, (node, name) => {
							context.report({ node, messageId: 'direct', data: { name } });
							return false;
						}, (node, memberName) => {
							const read = getRead(memberName);
							if (read) {
								context.report({ node, messageId: 'indirect', data: { name: read.name, path: [formatThisMember(node, memberName), ...read.path].join(' -> ') } });
							}
							return false;
						});
					}
				}
			}
		};
	}
};

function getParameterProperties(body: ESTree.ClassBody): Set<string> {
	const names = new Set<string>();
	for (const element of body.body) {
		if (element.type === 'MethodDefinition' && element.kind === 'constructor') {
			for (const param of element.value.params) {
				if (param.type === 'TSParameterProperty') {
					const binding = param.parameter.type === 'AssignmentPattern' ? param.parameter.left : param.parameter;
					if (binding.type === 'Identifier') {
						names.add(binding.name);
					}
				}
			}
		}
	}
	return names;
}

function getMembers(body: ESTree.ClassBody): Map<string, Member> {
	const members = new Map<string, Member>();
	for (const element of body.body) {
		// Calling a generator only creates an iterator, which doesn't run its body.
		if (element.type === 'MethodDefinition' && !element.static && (element.kind === 'method' || element.kind === 'get') && element.value.body && !element.value.generator) {
			const name = getKeyName(element.key, element.computed);
			if (name !== undefined) {
				members.set(name, { runsOn: element.kind === 'get' ? 'access' : 'call', roots: [...element.value.params, element.value.body] });
			}
		} else if (element.type === 'PropertyDefinition' && !element.static && (element.value?.type === 'ArrowFunctionExpression' || element.value?.type === 'FunctionExpression') && element.value.body && !element.value.generator) {
			const name = getKeyName(element.key, element.computed);
			if (name !== undefined) {
				members.set(name, { runsOn: 'call', roots: [...element.value.params, element.value.body] });
			}
		}
	}
	return members;
}

function getKeyName(key: ESTree.Node, computed: boolean): string | undefined {
	if (key.type === 'Identifier' && !computed) {
		return key.name;
	}
	if (key.type === 'PrivateIdentifier') {
		return `#${key.name}`;
	}
	if (key.type === 'Literal' && typeof key.value === 'string') {
		return key.value;
	}
	return undefined;
}

/** The name of the member that `node` reads from `this`, as in `this.name`, `this['name']` or `this.#name`. */
function getThisMemberName(node: ESTree.Node): string | undefined {
	if (node.type !== 'MemberExpression' || node.object.type !== 'ThisExpression') {
		return undefined;
	}
	return getKeyName(node.property, node.computed);
}

/** Whether `node` is called, as in `this.m()`, or used as the tag of a template, as in ``this.m`text` ``. */
function isInvoked(node: ESTree.MemberExpression): boolean {
	return node.parent.type === 'CallExpression' && node.parent.callee === node
		|| node.parent.type === 'TaggedTemplateExpression' && node.parent.tag === node;
}

/** Whether `node` is only written, as in `this.s = value`. */
function isAssignmentTarget(node: ESTree.MemberExpression): boolean {
	return node.parent.type === 'AssignmentExpression' && node.parent.operator === '=' && node.parent.left === node;
}

function formatThisMember(node: ESTree.MemberExpression, name: string): string {
	if (node.parent.type === 'TaggedTemplateExpression' && node.parent.tag === node) {
		return `this.${name}\`\``;
	}
	return `this.${name}${isInvoked(node) ? '()' : ''}`;
}

/** Functions and classes don't run when they are created, and have their own `this`. */
const skippedTypes = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ClassExpression', 'ClassDeclaration']);

/**
 * Visits `node` and its descendants, except for functions and classes, until `visit` returns `true`.
 */
function walk(node: ESTree.Node, visitorKeys: VisitorKeys, visit: (node: ESTree.Node) => boolean): boolean {
	if (skippedTypes.has(node.type)) {
		return false;
	}
	if (visit(node)) {
		return true;
	}
	for (const key of visitorKeys[node.type] ?? []) {
		const child = (node as unknown as Record<string, unknown>)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (isNode(item) && walk(item, visitorKeys, visit)) {
					return true;
				}
			}
		} else if (isNode(child) && walk(child, visitorKeys, visit)) {
			return true;
		}
	}
	return false;
}

function isNode(value: unknown): value is ESTree.Node {
	return !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}
