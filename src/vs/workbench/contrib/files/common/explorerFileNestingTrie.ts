/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A sort of double-ended trie, used to efficiently query for matches to "star" patterns, where
 * a given key representas a parent and may contain a capturing group ("*"), which can then be
 * referenced via the token "$(capture)" in associated child patterns.
 *
 * The generated tree will have at most two levels, as subtrees are flattened rather than nested.
 *
 * Example:
 * The config: [
 * [ *.ts , [ $(capture).*.ts ; $(capture).js ] ]
 * [ *.js , [ $(capture).min.js ] ] ]
 * Nests the files: [ a.ts ; a.d.ts ; a.js ; a.min.js ; b.ts ; b.min.js ]
 * As:
 * - a.ts => [ a.d.ts ; a.js ; a.min.js ]
 * - b.ts => [ ]
 * - b.min.ts => [ ]
 */
export class ExplorerFileNestingTrie {
	private root = new PreTrie();

	constructor(config: [string, string[]][]) {
		for (const [parentPattern, childPatterns] of config) {
			for (const childPattern of childPatterns) {
				this.root.add(parentPattern, childPattern);
			}
		}
	}

	toString() {
		return this.root.toString();
	}

	nest(files: string[]): Map<string, Set<string>> {
		const parentFinder = new PreTrie();

		for (const potentialParent of files) {
			const children = this.root.get(potentialParent);
			for (const child of children) {
				parentFinder.add(child, potentialParent);
			}
		}

		const findAllRootAncestors = (file: string, seen: Set<string> = new Set()): string[] => {
			if (seen.has(file)) { return []; }
			seen.add(file);

			const ancestors = parentFinder.get(file);
			if (ancestors.length === 0) {
				return [file];
			}

			if (ancestors.length === 1 && ancestors[0] === file) {
				return [file];
			}

			return ancestors.flatMap(a => findAllRootAncestors(a, seen));
		};

		const result = new Map<string, Set<string>>();
		for (const file of files) {
			let ancestors = findAllRootAncestors(file);
			if (ancestors.length === 0) { ancestors = [file]; }
			for (const ancestor of ancestors) {
				let existing = result.get(ancestor);
				if (!existing) { result.set(ancestor, existing = new Set()); }
				if (file !== ancestor) {
					existing.add(file);
				}
			}
		}
		return result;
	}
}

/** Export for test only. */
export class PreTrie {
	private value: SufTrie = new SufTrie();

	private map: Map<string, PreTrie> = new Map();

	constructor() { }

	add(key: string, value: string) {
		if (key === '') {
			this.value.add(key, value);
		} else if (key[0] === '*') {
			this.value.add(key, value);
		} else {
			const head = key[0];
			const rest = key.slice(1);
			let existing = this.map.get(head);
			if (!existing) {
				this.map.set(head, existing = new PreTrie());
			}
			existing.add(rest, value);
		}
	}

	get(key: string): string[] {
		const results: string[] = [];
		results.push(...this.value.get(key));

		const head = key[0];
		const rest = key.slice(1);
		const existing = this.map.get(head);
		if (existing) {
			results.push(...existing.get(rest));
		}

		return results;
	}

	toString(indentation = ''): string {
		const lines = [];
		if (this.value.hasItems) {
			lines.push('* => \n' + this.value.toString(indentation + '  '));
		}
		[...this.map.entries()].map(([key, trie]) =>
			lines.push('^' + key + ' => \n' + trie.toString(indentation + '  ')));
		return lines.map(l => indentation + l).join('\n');
	}
}

/** Export for test only. */
export class SufTrie {
	private star: string[] = [];
	private epsilon: string[] = [];

	private map: Map<string, SufTrie> = new Map();
	hasItems: boolean = false;

	constructor() { }

	add(key: string, value: string) {
		this.hasItems = true;
		if (key === '*') {
			this.star.push(value);
		} else if (key === '') {
			this.epsilon.push(value);
		} else {
			const tail = key[key.length - 1];
			const rest = key.slice(0, key.length - 1);
			if (tail === '*') {
				throw Error('Unexpected star in SufTrie key: ' + key);
			} else {
				let existing = this.map.get(tail);
				if (!existing) {
					this.map.set(tail, existing = new SufTrie());
				}
				existing.add(rest, value);
			}
		}
	}

	get(key: string): string[] {
		const results: string[] = [];
		if (key === '') {
			results.push(...this.epsilon);
		}
		if (this.star.length) {
			results.push(...this.star.map(x => x.replace('$(capture)', key)));
		}

		const tail = key[key.length - 1];
		const rest = key.slice(0, key.length - 1);
		const existing = this.map.get(tail);
		if (existing) {
			results.push(...existing.get(rest));
		}

		return results;
	}

	toString(indentation = ''): string {
		const lines = [];
		if (this.star.length) {
			lines.push('* => ' + this.star.join('; '));
		}

		if (this.epsilon.length) {
			// allow-any-unicode-next-line
			lines.push('ε => ' + this.epsilon.join('; '));
		}

		[...this.map.entries()].map(([key, trie]) =>
			lines.push(key + '$' + ' => \n' + trie.toString(indentation + '  ')));

		return lines.map(l => indentation + l).join('\n');
	}
}
