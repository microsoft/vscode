/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type FilenameAttributes = {
	// index.test in index.test.json
	basename: string;
	// json in index.test.json
	extname: string;
	// my-folder in my-folder/index.test.json
	dirname: string;
};

/**
 * A sort of double-ended trie, used to efficiently query for matches to "star" patterns, where
 * a given key represents a parent and may contain a capturing group ("*"), which can then be
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

	private getAttributes(filename: string, dirname: string): FilenameAttributes {
		const lastDot = filename.lastIndexOf('.');
		if (lastDot < 1) {
			return {
				dirname,
				basename: filename,
				extname: ''
			};
		} else {
			return {
				dirname,
				basename: filename.substring(0, lastDot),
				extname: filename.substring(lastDot + 1)
			};
		}
	}

	nest(files: string[], dirname: string): Map<string, Set<string>> {
		const parentFinder = new PreTrie();

		for (const potentialParent of files) {
			const attributes = this.getAttributes(potentialParent, dirname);
			const children = this.root.get(potentialParent, attributes);
			for (const child of children) {
				parentFinder.add(child, potentialParent);
			}
		}

		const findAllRootAncestors = (file: string, seen: Set<string> = new Set()): string[] => {
			if (seen.has(file)) { return []; }
			seen.add(file);
			const attributes = this.getAttributes(file, dirname);
			const ancestors = parentFinder.get(file, attributes);
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

	get(key: string, attributes: FilenameAttributes): string[] {
		const results: string[] = [];
		results.push(...this.value.get(key, attributes));

		const head = key[0];
		const rest = key.slice(1);
		const existing = this.map.get(head);
		if (existing) {
			results.push(...existing.get(rest, attributes));
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
	private star: SubstitutionString[] = [];
	private epsilon: SubstitutionString[] = [];

	private map: Map<string, SufTrie> = new Map();
	hasItems: boolean = false;

	constructor() { }

	add(key: string, value: string) {
		this.hasItems = true;
		if (key === '*') {
			this.star.push(new SubstitutionString(value));
		} else if (key === '') {
			this.epsilon.push(new SubstitutionString(value));
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

	get(key: string, attributes: FilenameAttributes): string[] {
		const results: string[] = [];
		if (key === '') {
			results.push(...this.epsilon.map(ss => ss.substitute(attributes)));
		}
		if (this.star.length) {
			results.push(...this.star.map(ss => ss.substitute(attributes, key)));
		}

		const tail = key[key.length - 1];
		const rest = key.slice(0, key.length - 1);
		const existing = this.map.get(tail);
		if (existing) {
			results.push(...existing.get(rest, attributes));
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

const enum SubstitutionType {
	capture = 'capture',
	basename = 'basename',
	dirname = 'dirname',
	extname = 'extname',
}

const substitutionStringTokenizer = /\$[({](capture|basename|dirname|extname)[)}]/g;

class SubstitutionString {

	private tokens: (string | { capture: SubstitutionType })[] = [];

	constructor(pattern: string) {
		substitutionStringTokenizer.lastIndex = 0;
		let token;
		let lastIndex = 0;
		while (token = substitutionStringTokenizer.exec(pattern)) {
			const prefix = pattern.slice(lastIndex, token.index);
			this.tokens.push(prefix);

			const type = token[1];
			switch (type) {
				case SubstitutionType.basename:
				case SubstitutionType.dirname:
				case SubstitutionType.extname:
				case SubstitutionType.capture:
					this.tokens.push({ capture: type });
					break;
				default: throw Error('unknown substitution type: ' + type);
			}
			lastIndex = token.index + token[0].length;
		}

		if (lastIndex !== pattern.length) {
			const suffix = pattern.slice(lastIndex, pattern.length);
			this.tokens.push(suffix);
		}
	}

	substitute(attributes: FilenameAttributes, capture?: string): string {
		return this.tokens.map(t => {
			if (typeof t === 'string') { return t; }
			switch (t.capture) {
				case SubstitutionType.basename: return attributes.basename;
				case SubstitutionType.dirname: return attributes.dirname;
				case SubstitutionType.extname: return attributes.extname;
				case SubstitutionType.capture: return capture || '';
			}
		}).join('');
	}
}
