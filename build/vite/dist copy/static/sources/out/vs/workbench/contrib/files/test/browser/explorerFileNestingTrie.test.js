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
    const assertMapEquals = (actual, expected) => {
        const actualStr = [...actual.entries()].map(e => `${e[0]} => [${[...e[1].keys()].join()}]`);
        const expectedStr = Object.entries(expected).map(e => `${e[0]}: [${[e[1]].join()}]`);
        const bigMsg = actualStr + '===' + expectedStr;
        assert.strictEqual(actual.size, Object.keys(expected).length, bigMsg);
        for (const parent of actual.keys()) {
            const act = actual.get(parent);
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
                '.npmrc', 'npm-shrinkwrap.json', 'yarn.lock'
            ],
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL3Rlc3QvYnJvd3Nlci9leHBsb3JlckZpbGVOZXN0aW5nVHJpZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0sc0JBQXNCLEdBQUcsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDO0FBRS9FLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3JCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7UUFDekIsTUFBTSxDQUFDLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN4QixDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QixNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyRSxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLHNCQUFz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