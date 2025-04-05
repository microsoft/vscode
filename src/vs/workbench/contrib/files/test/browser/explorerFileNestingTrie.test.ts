/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { PreTrie, ExplorerFileNestingTrie, SufTrie } from '../../common/explorerFileNestingTrie.js';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const fakeFilenameAttributes = { dirname: 'mydir', basename: '', extname: '' };

suite('SufTrie', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exactMatches', () => {
		const t = new SufTrie();
		t.add('.npmrc', 'MyKey');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), []);
	});

	test('starMatches', () => {
		const t = new SufTrie();
		t.add('*.npmrc', 'MyKey');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['MyKey']);
	});

	test('starSubstitutes', () => {
		const t = new SufTrie();
		t.add('*.npmrc', '${capture}.json');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['.json']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['a.json']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['a.b.c.d.json']);
	});

	test('multiMatches', () => {
		const t = new SufTrie();
		t.add('*.npmrc', 'Key1');
		t.add('*.json', 'Key2');
		t.add('*d.npmrc', 'Key3');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['Key1']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.json', fakeFilenameAttributes), ['Key2']);
		assert.deepStrictEqual(t.get('a.json', fakeFilenameAttributes), ['Key2']);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['Key1']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['Key1', 'Key3']);
	});

	test('multiSubstitutes', () => {
		const t = new SufTrie();
		t.add('*.npmrc', 'Key1.${capture}.js');
		t.add('*.json', 'Key2.${capture}.js');
		t.add('*d.npmrc', 'Key3.${capture}.js');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['Key1..js']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.json', fakeFilenameAttributes), ['Key2..js']);
		assert.deepStrictEqual(t.get('a.json', fakeFilenameAttributes), ['Key2.a.js']);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['Key1.a.js']);
		assert.deepStrictEqual(t.get('a.b.cd.npmrc', fakeFilenameAttributes), ['Key1.a.b.cd.js', 'Key3.a.b.c.js']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['Key1.a.b.c.d.js', 'Key3.a.b.c..js']);
	});
});

suite('PreTrie', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exactMatches', () => {
		const t = new PreTrie();
		t.add('.npmrc', 'MyKey');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), []);
	});

	test('starMatches', () => {
		const t = new PreTrie();
		t.add('*.npmrc', 'MyKey');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['MyKey']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['MyKey']);
	});

	test('starSubstitutes', () => {
		const t = new PreTrie();
		t.add('*.npmrc', '${capture}.json');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['.json']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['a.json']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['a.b.c.d.json']);
	});

	test('multiMatches', () => {
		const t = new PreTrie();
		t.add('*.npmrc', 'Key1');
		t.add('*.json', 'Key2');
		t.add('*d.npmrc', 'Key3');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['Key1']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.json', fakeFilenameAttributes), ['Key2']);
		assert.deepStrictEqual(t.get('a.json', fakeFilenameAttributes), ['Key2']);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['Key1']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['Key1', 'Key3']);
	});

	test('multiSubstitutes', () => {
		const t = new PreTrie();
		t.add('*.npmrc', 'Key1.${capture}.js');
		t.add('*.json', 'Key2.${capture}.js');
		t.add('*d.npmrc', 'Key3.${capture}.js');
		assert.deepStrictEqual(t.get('.npmrc', fakeFilenameAttributes), ['Key1..js']);
		assert.deepStrictEqual(t.get('npmrc', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.npmrcs', fakeFilenameAttributes), []);
		assert.deepStrictEqual(t.get('.json', fakeFilenameAttributes), ['Key2..js']);
		assert.deepStrictEqual(t.get('a.json', fakeFilenameAttributes), ['Key2.a.js']);
		assert.deepStrictEqual(t.get('a.npmrc', fakeFilenameAttributes), ['Key1.a.js']);
		assert.deepStrictEqual(t.get('a.b.cd.npmrc', fakeFilenameAttributes), ['Key1.a.b.cd.js', 'Key3.a.b.c.js']);
		assert.deepStrictEqual(t.get('a.b.c.d.npmrc', fakeFilenameAttributes), ['Key1.a.b.c.d.js', 'Key3.a.b.c..js']);
	});


	test('emptyMatches', () => {
		const t = new PreTrie();
		t.add('package*json', 'package');
		assert.deepStrictEqual(t.get('package.json', fakeFilenameAttributes), ['package']);
		assert.deepStrictEqual(t.get('packagejson', fakeFilenameAttributes), ['package']);
		assert.deepStrictEqual(t.get('package-lock.json', fakeFilenameAttributes), ['package']);
	});
});

suite('StarTrie', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const assertMapEquals = (actual: Map<string, Set<string>>, expected: Record<string, string[]>) => {
		const actualStr = [...actual.entries()].map(e => `${e[0]} => [${[...e[1].keys()].join()}]`);
		const expectedStr = Object.entries(expected).map(e => `${e[0]}: [${[e[1]].join()}]`);
		const bigMsg = actualStr + '===' + expectedStr;
		assert.strictEqual(actual.size, Object.keys(expected).length, bigMsg);
		for (const parent of actual.keys()) {
			const act = actual.get(parent)!;
			const exp = expected[parent];
			const str = [...act.keys()].join() + '===' + exp.join();
			const msg = bigMsg + '\n' + str;
			assert(act.size === exp.length, msg);
			for (const child of exp) {
				assert(act.has(child), msg);
			}
		}
	};

	test('does added extension nesting', () => {
		const t = new ExplorerFileNestingTrie([
			['*', ['${capture}.*']],
		]);
		const nesting = t.nest([
			'file',
			'file.json',
			'boop.test',
			'boop.test1',
			'boop.test.1',
			'beep',
			'beep.test1',
			'beep.boop.test1',
			'beep.boop.test2',
			'beep.boop.a',
		], 'mydir');
		assertMapEquals(nesting, {
			'file': ['file.json'],
			'boop.test': ['boop.test.1'],
			'boop.test1': [],
			'beep': ['beep.test1', 'beep.boop.test1', 'beep.boop.test2', 'beep.boop.a']
		});
	});

	test('does ext specific nesting', () => {
		const t = new ExplorerFileNestingTrie([
			['*.ts', ['${capture}.js']],
			['*.js', ['${capture}.map']],
		]);
		const nesting = t.nest([
			'a.ts',
			'a.js',
			'a.jss',
			'ab.js',
			'b.js',
			'b.map',
			'c.ts',
			'c.js',
			'c.map',
			'd.ts',
			'd.map',
		], 'mydir');
		assertMapEquals(nesting, {
			'a.ts': ['a.js'],
			'ab.js': [],
			'a.jss': [],
			'b.js': ['b.map'],
			'c.ts': ['c.js', 'c.map'],
			'd.ts': [],
			'd.map': [],
		});
	});

	test('handles loops', () => {
		const t = new ExplorerFileNestingTrie([
			['*.a', ['${capture}.b', '${capture}.c']],
			['*.b', ['${capture}.a']],
			['*.c', ['${capture}.d']],

			['*.aa', ['${capture}.bb']],
			['*.bb', ['${capture}.cc', '${capture}.dd']],
			['*.cc', ['${capture}.aa']],
			['*.dd', ['${capture}.ee']],
		]);
		const nesting = t.nest([
			'.a', '.b', '.c', '.d',
			'a.a', 'a.b', 'a.d',
			'a.aa', 'a.bb', 'a.cc',
			'b.aa', 'b.bb',
			'c.bb', 'c.cc',
			'd.aa', 'd.cc',
			'e.aa', 'e.bb', 'e.dd', 'e.ee',
			'f.aa', 'f.bb', 'f.cc', 'f.dd', 'f.ee',
		], 'mydir');

		assertMapEquals(nesting, {
			'.a': [], '.b': [], '.c': [], '.d': [],
			'a.a': [], 'a.b': [], 'a.d': [],
			'a.aa': [], 'a.bb': [], 'a.cc': [],
			'b.aa': ['b.bb'],
			'c.bb': ['c.cc'],
			'd.cc': ['d.aa'],
			'e.aa': ['e.bb', 'e.dd', 'e.ee'],
			'f.aa': [], 'f.bb': [], 'f.cc': [], 'f.dd': [], 'f.ee': []
		});
	});

	test('does general bidirectional suffix matching', () => {
		const t = new ExplorerFileNestingTrie([
			['*-vsdoc.js', ['${capture}.js']],
			['*.js', ['${capture}-vscdoc.js']],
		]);

		const nesting = t.nest([
			'a-vsdoc.js',
			'a.js',
			'b.js',
			'b-vscdoc.js',
		], 'mydir');

		assertMapEquals(nesting, {
			'a-vsdoc.js': ['a.js'],
			'b.js': ['b-vscdoc.js'],
		});
	});

	test('does general bidirectional prefix matching', () => {
		const t = new ExplorerFileNestingTrie([
			['vsdoc-*.js', ['${capture}.js']],
			['*.js', ['vscdoc-${capture}.js']],
		]);

		const nesting = t.nest([
			'vsdoc-a.js',
			'a.js',
			'b.js',
			'vscdoc-b.js',
		], 'mydir');

		assertMapEquals(nesting, {
			'vsdoc-a.js': ['a.js'],
			'b.js': ['vscdoc-b.js'],
		});
	});

	test('does general bidirectional general matching', () => {
		const t = new ExplorerFileNestingTrie([
			['foo-*-bar.js', ['${capture}.js']],
			['*.js', ['bib-${capture}-bap.js']],
		]);

		const nesting = t.nest([
			'foo-a-bar.js',
			'a.js',
			'b.js',
			'bib-b-bap.js',
		], 'mydir');

		assertMapEquals(nesting, {
			'foo-a-bar.js': ['a.js'],
			'b.js': ['bib-b-bap.js'],
		});
	});

	test('does extension specific path segment matching', () => {
		const t = new ExplorerFileNestingTrie([
			['*.js', ['${capture}.*.js']],
		]);

		const nesting = t.nest([
			'foo.js',
			'foo.test.js',
			'fooTest.js',
			'bar.js.js',
		], 'mydir');

		assertMapEquals(nesting, {
			'foo.js': ['foo.test.js'],
			'fooTest.js': [],
			'bar.js.js': [],
		});
	});

	test('does exact match nesting', () => {
		const t = new ExplorerFileNestingTrie([
			['package.json', ['.npmrc', 'npm-shrinkwrap.json', 'yarn.lock', '.yarnclean', '.yarnignore', '.yarn-integrity', '.yarnrc']],
			['bower.json', ['.bowerrc']],
		]);

		const nesting = t.nest([
			'package.json',
			'.npmrc', 'npm-shrinkwrap.json', 'yarn.lock',
			'.bowerrc',
		], 'mydir');

		assertMapEquals(nesting, {
			'package.json': [
				'.npmrc', 'npm-shrinkwrap.json', 'yarn.lock'],
			'.bowerrc': [],
		});
	});

	test('eslint test', () => {
		const t = new ExplorerFileNestingTrie([
			['.eslintrc*', ['.eslint*']],
		]);

		const nesting1 = t.nest([
			'.eslintrc.json',
			'.eslintignore',
		], 'mydir');

		assertMapEquals(nesting1, {
			'.eslintrc.json': ['.eslintignore'],
		});

		const nesting2 = t.nest([
			'.eslintrc',
			'.eslintignore',
		], 'mydir');

		assertMapEquals(nesting2, {
			'.eslintrc': ['.eslintignore'],
		});
	});

	test('basename expansion', () => {
		const t = new ExplorerFileNestingTrie([
			['*-vsdoc.js', ['${basename}.doc']],
		]);

		const nesting1 = t.nest([
			'boop-vsdoc.js',
			'boop-vsdoc.doc',
			'boop.doc',
		], 'mydir');

		assertMapEquals(nesting1, {
			'boop-vsdoc.js': ['boop-vsdoc.doc'],
			'boop.doc': [],
		});
	});

	test('extname expansion', () => {
		const t = new ExplorerFileNestingTrie([
			['*-vsdoc.js', ['${extname}.doc']],
		]);

		const nesting1 = t.nest([
			'boop-vsdoc.js',
			'js.doc',
			'boop.doc',
		], 'mydir');

		assertMapEquals(nesting1, {
			'boop-vsdoc.js': ['js.doc'],
			'boop.doc': [],
		});
	});

	test('added segment matcher', () => {
		const t = new ExplorerFileNestingTrie([
			['*', ['${basename}.*.${extname}']],
		]);

		const nesting1 = t.nest([
			'some.file',
			'some.html.file',
			'some.html.nested.file',
			'other.file',
			'some.thing',
			'some.thing.else',
		], 'mydir');

		assertMapEquals(nesting1, {
			'some.file': ['some.html.file', 'some.html.nested.file'],
			'other.file': [],
			'some.thing': [],
			'some.thing.else': [],
		});
	});

	test('added segment matcher (old format)', () => {
		const t = new ExplorerFileNestingTrie([
			['*', ['$(basename).*.$(extname)']],
		]);

		const nesting1 = t.nest([
			'some.file',
			'some.html.file',
			'some.html.nested.file',
			'other.file',
			'some.thing',
			'some.thing.else',
		], 'mydir');

		assertMapEquals(nesting1, {
			'some.file': ['some.html.file', 'some.html.nested.file'],
			'other.file': [],
			'some.thing': [],
			'some.thing.else': [],
		});
	});

	test('dirname matching', () => {
		const t = new ExplorerFileNestingTrie([
			['index.ts', ['${dirname}.ts']],
		]);

		const nesting1 = t.nest([
			'otherFile.ts',
			'MyComponent.ts',
			'index.ts',
		], 'MyComponent');

		assertMapEquals(nesting1, {
			'index.ts': ['MyComponent.ts'],
			'otherFile.ts': [],
		});
	});

	test.skip('is fast', () => {
		const bigNester = new ExplorerFileNestingTrie([
			['*', ['${capture}.*']],
			['*.js', ['${capture}.*.js', '${capture}.map']],
			['*.jsx', ['${capture}.js']],
			['*.ts', ['${capture}.js', '${capture}.*.ts']],
			['*.tsx', ['${capture}.js']],
			['*.css', ['${capture}.*.css', '${capture}.map']],
			['*.html', ['${capture}.*.html']],
			['*.htm', ['${capture}.*.htm']],
			['*.less', ['${capture}.*.less', '${capture}.css']],
			['*.scss', ['${capture}.*.scss', '${capture}.css']],
			['*.sass', ['${capture}.css']],
			['*.styl', ['${capture}.css']],
			['*.coffee', ['${capture}.*.coffee', '${capture}.js']],
			['*.iced', ['${capture}.*.iced', '${capture}.js']],
			['*.config', ['${capture}.*.config']],
			['*.cs', ['${capture}.*.cs', '${capture}.cs.d.ts']],
			['*.vb', ['${capture}.*.vb']],
			['*.json', ['${capture}.*.json']],
			['*.md', ['${capture}.html']],
			['*.mdown', ['${capture}.html']],
			['*.markdown', ['${capture}.html']],
			['*.mdwn', ['${capture}.html']],
			['*.svg', ['${capture}.svgz']],
			['*.a', ['${capture}.b']],
			['*.b', ['${capture}.a']],
			['*.resx', ['${capture}.designer.cs']],
			['package.json', ['.npmrc', 'npm-shrinkwrap.json', 'yarn.lock', '.yarnclean', '.yarnignore', '.yarn-integrity', '.yarnrc']],
			['bower.json', ['.bowerrc']],
			['*-vsdoc.js', ['${capture}.js']],
			['*.tt', ['${capture}.*']]
		]);

		const bigFiles = Array.from({ length: 50000 / 6 }).map((_, i) => [
			'file' + i + '.js',
			'file' + i + '.map',
			'file' + i + '.css',
			'file' + i + '.ts',
			'file' + i + '.d.ts',
			'file' + i + '.jsx',
		]).flat();

		const start = performance.now();
		// const _bigResult =
		bigNester.nest(bigFiles, 'mydir');
		const end = performance.now();
		assert(end - start < 1000, 'too slow...' + (end - start));
		// console.log(bigResult)
	});
});
