/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// NOTE: VSCode's copy of nodejs path library to be usable in common (non-node) namespace
// Copied from: https://github.com/nodejs/node/tree/43dd49c9782848c25e5b03448c8a0f923f13c158
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
import assert from 'assert';
import * as path from '../../common/path.js';
import { isWeb, isWindows } from '../../common/platform.js';
import * as process from '../../common/process.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('Paths (Node Implementation)', () => {
    const __filename = 'path.test.js';
    ensureNoDisposablesAreLeakedInTestSuite();
    test('join', () => {
        const failures = [];
        const backslashRE = /\\/g;
        const joinTests = [
            [[path.posix.join, path.win32.join],
                // arguments                     result
                [[['.', 'x/b', '..', '/b/c.js'], 'x/b/c.js'],
                    [[], '.'],
                    [['/.', 'x/b', '..', '/b/c.js'], '/x/b/c.js'],
                    [['/foo', '../../../bar'], '/bar'],
                    [['foo', '../../../bar'], '../../bar'],
                    [['foo/', '../../../bar'], '../../bar'],
                    [['foo/x', '../../../bar'], '../bar'],
                    [['foo/x', './bar'], 'foo/x/bar'],
                    [['foo/x/', './bar'], 'foo/x/bar'],
                    [['foo/x/', '.', 'bar'], 'foo/x/bar'],
                    [['./'], './'],
                    [['.', './'], './'],
                    [['.', '.', '.'], '.'],
                    [['.', './', '.'], '.'],
                    [['.', '/./', '.'], '.'],
                    [['.', '/////./', '.'], '.'],
                    [['.'], '.'],
                    [['', '.'], '.'],
                    [['', 'foo'], 'foo'],
                    [['foo', '/bar'], 'foo/bar'],
                    [['', '/foo'], '/foo'],
                    [['', '', '/foo'], '/foo'],
                    [['', '', 'foo'], 'foo'],
                    [['foo', ''], 'foo'],
                    [['foo/', ''], 'foo/'],
                    [['foo', '', '/bar'], 'foo/bar'],
                    [['./', '..', '/foo'], '../foo'],
                    [['./', '..', '..', '/foo'], '../../foo'],
                    [['.', '..', '..', '/foo'], '../../foo'],
                    [['', '..', '..', '/foo'], '../../foo'],
                    [['/'], '/'],
                    [['/', '.'], '/'],
                    [['/', '..'], '/'],
                    [['/', '..', '..'], '/'],
                    [[''], '.'],
                    [['', ''], '.'],
                    [[' /foo'], ' /foo'],
                    [[' ', 'foo'], ' /foo'],
                    [[' ', '.'], ' '],
                    [[' ', '/'], ' /'],
                    [[' ', ''], ' '],
                    [['/', 'foo'], '/foo'],
                    [['/', '/foo'], '/foo'],
                    [['/', '//foo'], '/foo'],
                    [['/', '', '/foo'], '/foo'],
                    [['', '/', 'foo'], '/foo'],
                    [['', '/', '/foo'], '/foo']
                ]
            ]
        ];
        // Windows-specific join tests
        joinTests.push([
            path.win32.join,
            joinTests[0][1].slice(0).concat([
                // UNC path expected
                [['//foo/bar'], '\\\\foo\\bar\\'],
                [['\\/foo/bar'], '\\\\foo\\bar\\'],
                [['\\\\foo/bar'], '\\\\foo\\bar\\'],
                // UNC path expected - server and share separate
                [['//foo', 'bar'], '\\\\foo\\bar\\'],
                [['//foo/', 'bar'], '\\\\foo\\bar\\'],
                [['//foo', '/bar'], '\\\\foo\\bar\\'],
                // UNC path expected - questionable
                [['//foo', '', 'bar'], '\\\\foo\\bar\\'],
                [['//foo/', '', 'bar'], '\\\\foo\\bar\\'],
                [['//foo/', '', '/bar'], '\\\\foo\\bar\\'],
                // UNC path expected - even more questionable
                [['', '//foo', 'bar'], '\\\\foo\\bar\\'],
                [['', '//foo/', 'bar'], '\\\\foo\\bar\\'],
                [['', '//foo/', '/bar'], '\\\\foo\\bar\\'],
                // No UNC path expected (no double slash in first component)
                [['\\', 'foo/bar'], '\\foo\\bar'],
                [['\\', '/foo/bar'], '\\foo\\bar'],
                [['', '/', '/foo/bar'], '\\foo\\bar'],
                // No UNC path expected (no non-slashes in first component -
                // questionable)
                [['//', 'foo/bar'], '\\foo\\bar'],
                [['//', '/foo/bar'], '\\foo\\bar'],
                [['\\\\', '/', '/foo/bar'], '\\foo\\bar'],
                [['//'], '\\'],
                // No UNC path expected (share name missing - questionable).
                [['//foo'], '\\foo'],
                [['//foo/'], '\\foo\\'],
                [['//foo', '/'], '\\foo\\'],
                [['//foo', '', '/'], '\\foo\\'],
                // No UNC path expected (too many leading slashes - questionable)
                [['///foo/bar'], '\\foo\\bar'],
                [['////foo', 'bar'], '\\foo\\bar'],
                [['\\\\\\/foo/bar'], '\\foo\\bar'],
                // Drive-relative vs drive-absolute paths. This merely describes the
                // status quo, rather than being obviously right
                [['c:'], 'c:.'],
                [['c:.'], 'c:.'],
                [['c:', ''], 'c:.'],
                [['', 'c:'], 'c:.'],
                [['c:.', '/'], 'c:.\\'],
                [['c:.', 'file'], 'c:file'],
                [['c:', '/'], 'c:\\'],
                [['c:', 'file'], 'c:\\file']
            ])
        ]);
        joinTests.forEach((test) => {
            if (!Array.isArray(test[0])) {
                test[0] = [test[0]];
            }
            test[0].forEach((join) => {
                test[1].forEach((test) => {
                    const actual = join.apply(null, test[0]);
                    const expected = test[1];
                    // For non-Windows specific tests with the Windows join(), we need to try
                    // replacing the slashes since the non-Windows specific tests' `expected`
                    // use forward slashes
                    let actualAlt;
                    let os;
                    if (join === path.win32.join) {
                        actualAlt = actual.replace(backslashRE, '/');
                        os = 'win32';
                    }
                    else {
                        os = 'posix';
                    }
                    const message = `path.${os}.join(${test[0].map(JSON.stringify).join(',')})\n  expect=${JSON.stringify(expected)}\n  actual=${JSON.stringify(actual)}`;
                    if (actual !== expected && actualAlt !== expected) {
                        failures.push(`\n${message}`);
                    }
                });
            });
        });
        assert.strictEqual(failures.length, 0, failures.join(''));
    });
    test('dirname', () => {
        assert.strictEqual(path.posix.dirname('/a/b/'), '/a');
        assert.strictEqual(path.posix.dirname('/a/b'), '/a');
        assert.strictEqual(path.posix.dirname('/a'), '/');
        assert.strictEqual(path.posix.dirname(''), '.');
        assert.strictEqual(path.posix.dirname('/'), '/');
        assert.strictEqual(path.posix.dirname('////'), '/');
        assert.strictEqual(path.posix.dirname('//a'), '//');
        assert.strictEqual(path.posix.dirname('foo'), '.');
        assert.strictEqual(path.win32.dirname('c:\\'), 'c:\\');
        assert.strictEqual(path.win32.dirname('c:\\foo'), 'c:\\');
        assert.strictEqual(path.win32.dirname('c:\\foo\\'), 'c:\\');
        assert.strictEqual(path.win32.dirname('c:\\foo\\bar'), 'c:\\foo');
        assert.strictEqual(path.win32.dirname('c:\\foo\\bar\\'), 'c:\\foo');
        assert.strictEqual(path.win32.dirname('c:\\foo\\bar\\baz'), 'c:\\foo\\bar');
        assert.strictEqual(path.win32.dirname('\\'), '\\');
        assert.strictEqual(path.win32.dirname('\\foo'), '\\');
        assert.strictEqual(path.win32.dirname('\\foo\\'), '\\');
        assert.strictEqual(path.win32.dirname('\\foo\\bar'), '\\foo');
        assert.strictEqual(path.win32.dirname('\\foo\\bar\\'), '\\foo');
        assert.strictEqual(path.win32.dirname('\\foo\\bar\\baz'), '\\foo\\bar');
        assert.strictEqual(path.win32.dirname('c:'), 'c:');
        assert.strictEqual(path.win32.dirname('c:foo'), 'c:');
        assert.strictEqual(path.win32.dirname('c:foo\\'), 'c:');
        assert.strictEqual(path.win32.dirname('c:foo\\bar'), 'c:foo');
        assert.strictEqual(path.win32.dirname('c:foo\\bar\\'), 'c:foo');
        assert.strictEqual(path.win32.dirname('c:foo\\bar\\baz'), 'c:foo\\bar');
        assert.strictEqual(path.win32.dirname('file:stream'), '.');
        assert.strictEqual(path.win32.dirname('dir\\file:stream'), 'dir');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share'), '\\\\unc\\share');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share\\foo'), '\\\\unc\\share\\');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share\\foo\\'), '\\\\unc\\share\\');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share\\foo\\bar'), '\\\\unc\\share\\foo');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share\\foo\\bar\\'), '\\\\unc\\share\\foo');
        assert.strictEqual(path.win32.dirname('\\\\unc\\share\\foo\\bar\\baz'), '\\\\unc\\share\\foo\\bar');
        assert.strictEqual(path.win32.dirname('/a/b/'), '/a');
        assert.strictEqual(path.win32.dirname('/a/b'), '/a');
        assert.strictEqual(path.win32.dirname('/a'), '/');
        assert.strictEqual(path.win32.dirname(''), '.');
        assert.strictEqual(path.win32.dirname('/'), '/');
        assert.strictEqual(path.win32.dirname('////'), '/');
        assert.strictEqual(path.win32.dirname('foo'), '.');
        // Tests from VSCode
        function assertDirname(p, expected, win = false) {
            const actual = win ? path.win32.dirname(p) : path.posix.dirname(p);
            if (actual !== expected) {
                assert.fail(`${p}: expected: ${expected}, ours: ${actual}`);
            }
        }
        assertDirname('foo/bar', 'foo');
        assertDirname('foo\\bar', 'foo', true);
        assertDirname('/foo/bar', '/foo');
        assertDirname('\\foo\\bar', '\\foo', true);
        assertDirname('/foo', '/');
        assertDirname('\\foo', '\\', true);
        assertDirname('/', '/');
        assertDirname('\\', '\\', true);
        assertDirname('foo', '.');
        assertDirname('f', '.');
        assertDirname('f/', '.');
        assertDirname('/folder/', '/');
        assertDirname('c:\\some\\file.txt', 'c:\\some', true);
        assertDirname('c:\\some', 'c:\\', true);
        assertDirname('c:\\', 'c:\\', true);
        assertDirname('c:', 'c:', true);
        assertDirname('\\\\server\\share\\some\\path', '\\\\server\\share\\some', true);
        assertDirname('\\\\server\\share\\some', '\\\\server\\share\\', true);
        assertDirname('\\\\server\\share\\', '\\\\server\\share\\', true);
    });
    test('extname', () => {
        const failures = [];
        const slashRE = /\//g;
        [
            [__filename, '.js'],
            ['', ''],
            ['/path/to/file', ''],
            ['/path/to/file.ext', '.ext'],
            ['/path.to/file.ext', '.ext'],
            ['/path.to/file', ''],
            ['/path.to/.file', ''],
            ['/path.to/.file.ext', '.ext'],
            ['/path/to/f.ext', '.ext'],
            ['/path/to/..ext', '.ext'],
            ['/path/to/..', ''],
            ['file', ''],
            ['file.ext', '.ext'],
            ['.file', ''],
            ['.file.ext', '.ext'],
            ['/file', ''],
            ['/file.ext', '.ext'],
            ['/.file', ''],
            ['/.file.ext', '.ext'],
            ['.path/file.ext', '.ext'],
            ['file.ext.ext', '.ext'],
            ['file.', '.'],
            ['.', ''],
            ['./', ''],
            ['.file.ext', '.ext'],
            ['.file', ''],
            ['.file.', '.'],
            ['.file..', '.'],
            ['..', ''],
            ['../', ''],
            ['..file.ext', '.ext'],
            ['..file', '.file'],
            ['..file.', '.'],
            ['..file..', '.'],
            ['...', '.'],
            ['...ext', '.ext'],
            ['....', '.'],
            ['file.ext/', '.ext'],
            ['file.ext//', '.ext'],
            ['file/', ''],
            ['file//', ''],
            ['file./', '.'],
            ['file.//', '.'],
        ].forEach((test) => {
            const expected = test[1];
            [path.posix.extname, path.win32.extname].forEach((extname) => {
                let input = test[0];
                let os;
                if (extname === path.win32.extname) {
                    input = input.replace(slashRE, '\\');
                    os = 'win32';
                }
                else {
                    os = 'posix';
                }
                const actual = extname(input);
                const message = `path.${os}.extname(${JSON.stringify(input)})\n  expect=${JSON.stringify(expected)}\n  actual=${JSON.stringify(actual)}`;
                if (actual !== expected) {
                    failures.push(`\n${message}`);
                }
            });
            {
                const input = `C:${test[0].replace(slashRE, '\\')}`;
                const actual = path.win32.extname(input);
                const message = `path.win32.extname(${JSON.stringify(input)})\n  expect=${JSON.stringify(expected)}\n  actual=${JSON.stringify(actual)}`;
                if (actual !== expected) {
                    failures.push(`\n${message}`);
                }
            }
        });
        assert.strictEqual(failures.length, 0, failures.join(''));
        // On Windows, backslash is a path separator.
        assert.strictEqual(path.win32.extname('.\\'), '');
        assert.strictEqual(path.win32.extname('..\\'), '');
        assert.strictEqual(path.win32.extname('file.ext\\'), '.ext');
        assert.strictEqual(path.win32.extname('file.ext\\\\'), '.ext');
        assert.strictEqual(path.win32.extname('file\\'), '');
        assert.strictEqual(path.win32.extname('file\\\\'), '');
        assert.strictEqual(path.win32.extname('file.\\'), '.');
        assert.strictEqual(path.win32.extname('file.\\\\'), '.');
        // On *nix, backslash is a valid name component like any other character.
        assert.strictEqual(path.posix.extname('.\\'), '');
        assert.strictEqual(path.posix.extname('..\\'), '.\\');
        assert.strictEqual(path.posix.extname('file.ext\\'), '.ext\\');
        assert.strictEqual(path.posix.extname('file.ext\\\\'), '.ext\\\\');
        assert.strictEqual(path.posix.extname('file\\'), '');
        assert.strictEqual(path.posix.extname('file\\\\'), '');
        assert.strictEqual(path.posix.extname('file.\\'), '.\\');
        assert.strictEqual(path.posix.extname('file.\\\\'), '.\\\\');
        // Tests from VSCode
        assert.strictEqual(path.extname('far.boo'), '.boo');
        assert.strictEqual(path.extname('far.b'), '.b');
        assert.strictEqual(path.extname('far.'), '.');
        assert.strictEqual(path.extname('far.boo/boo.far'), '.far');
        assert.strictEqual(path.extname('far.boo/boo'), '');
    });
    test('resolve', () => {
        const failures = [];
        const slashRE = /\//g;
        const backslashRE = /\\/g;
        const resolveTests = [
            [path.win32.resolve,
                // arguments                               result
                [[['c:/blah\\blah', 'd:/games', 'c:../a'], 'c:\\blah\\a'],
                    [['c:/ignore', 'd:\\a/b\\c/d', '\\e.exe'], 'd:\\e.exe'],
                    [['c:/ignore', 'c:/some/file'], 'c:\\some\\file'],
                    [['d:/ignore', 'd:some/dir//'], 'd:\\ignore\\some\\dir'],
                    [['//server/share', '..', 'relative\\'], '\\\\server\\share\\relative'],
                    [['c:/', '//'], 'c:\\'],
                    [['c:/', '//dir'], 'c:\\dir'],
                    [['c:/', '//server/share'], '\\\\server\\share\\'],
                    [['c:/', '//server//share'], '\\\\server\\share\\'],
                    [['c:/', '///some//dir'], 'c:\\some\\dir'],
                    [['C:\\foo\\tmp.3\\', '..\\tmp.3\\cycles\\root.js'],
                        'C:\\foo\\tmp.3\\cycles\\root.js']
                ]
            ],
            [path.posix.resolve,
                // arguments                    result
                [[['/var/lib', '../', 'file/'], '/var/file'],
                    [['/var/lib', '/../', 'file/'], '/file'],
                    [['/some/dir', '.', '/absolute/'], '/absolute'],
                    [['/foo/tmp.3/', '../tmp.3/cycles/root.js'], '/foo/tmp.3/cycles/root.js']
                ]
            ],
            [(isWeb ? path.posix.resolve : path.resolve),
                // arguments						result
                [[['.'], process.cwd()],
                    [['a/b/c', '../../..'], process.cwd()]
                ]
            ],
        ];
        resolveTests.forEach((test) => {
            const resolve = test[0];
            //@ts-expect-error
            test[1].forEach((test) => {
                //@ts-expect-error
                const actual = resolve.apply(null, test[0]);
                let actualAlt;
                const os = resolve === path.win32.resolve ? 'win32' : 'posix';
                if (resolve === path.win32.resolve && !isWindows) {
                    actualAlt = actual.replace(backslashRE, '/');
                }
                else if (resolve !== path.win32.resolve && isWindows) {
                    actualAlt = actual.replace(slashRE, '\\');
                }
                const expected = test[1];
                const message = `path.${os}.resolve(${test[0].map(JSON.stringify).join(',')})\n  expect=${JSON.stringify(expected)}\n  actual=${JSON.stringify(actual)}`;
                if (actual !== expected && actualAlt !== expected) {
                    failures.push(`\n${message}`);
                }
            });
        });
        assert.strictEqual(failures.length, 0, failures.join(''));
        // if (isWindows) {
        // 	// Test resolving the current Windows drive letter from a spawned process.
        // 	// See https://github.com/nodejs/node/issues/7215
        // 	const currentDriveLetter = path.parse(process.cwd()).root.substring(0, 2);
        // 	const resolveFixture = fixtures.path('path-resolve.js');
        // 	const spawnResult = child.spawnSync(
        // 		process.argv[0], [resolveFixture, currentDriveLetter]);
        // 	const resolvedPath = spawnResult.stdout.toString().trim();
        // 	assert.strictEqual(resolvedPath.toLowerCase(), process.cwd().toLowerCase());
        // }
    });
    test('basename', () => {
        assert.strictEqual(path.basename(__filename), 'path.test.js');
        assert.strictEqual(path.basename(__filename, '.js'), 'path.test');
        assert.strictEqual(path.basename('.js', '.js'), '');
        assert.strictEqual(path.basename(''), '');
        assert.strictEqual(path.basename('/dir/basename.ext'), 'basename.ext');
        assert.strictEqual(path.basename('/basename.ext'), 'basename.ext');
        assert.strictEqual(path.basename('basename.ext'), 'basename.ext');
        assert.strictEqual(path.basename('basename.ext/'), 'basename.ext');
        assert.strictEqual(path.basename('basename.ext//'), 'basename.ext');
        assert.strictEqual(path.basename('aaa/bbb', '/bbb'), 'bbb');
        assert.strictEqual(path.basename('aaa/bbb', 'a/bbb'), 'bbb');
        assert.strictEqual(path.basename('aaa/bbb', 'bbb'), 'bbb');
        assert.strictEqual(path.basename('aaa/bbb//', 'bbb'), 'bbb');
        assert.strictEqual(path.basename('aaa/bbb', 'bb'), 'b');
        assert.strictEqual(path.basename('aaa/bbb', 'b'), 'bb');
        assert.strictEqual(path.basename('/aaa/bbb', '/bbb'), 'bbb');
        assert.strictEqual(path.basename('/aaa/bbb', 'a/bbb'), 'bbb');
        assert.strictEqual(path.basename('/aaa/bbb', 'bbb'), 'bbb');
        assert.strictEqual(path.basename('/aaa/bbb//', 'bbb'), 'bbb');
        assert.strictEqual(path.basename('/aaa/bbb', 'bb'), 'b');
        assert.strictEqual(path.basename('/aaa/bbb', 'b'), 'bb');
        assert.strictEqual(path.basename('/aaa/bbb'), 'bbb');
        assert.strictEqual(path.basename('/aaa/'), 'aaa');
        assert.strictEqual(path.basename('/aaa/b'), 'b');
        assert.strictEqual(path.basename('/a/b'), 'b');
        assert.strictEqual(path.basename('//a'), 'a');
        assert.strictEqual(path.basename('a', 'a'), '');
        // On Windows a backslash acts as a path separator.
        assert.strictEqual(path.win32.basename('\\dir\\basename.ext'), 'basename.ext');
        assert.strictEqual(path.win32.basename('\\basename.ext'), 'basename.ext');
        assert.strictEqual(path.win32.basename('basename.ext'), 'basename.ext');
        assert.strictEqual(path.win32.basename('basename.ext\\'), 'basename.ext');
        assert.strictEqual(path.win32.basename('basename.ext\\\\'), 'basename.ext');
        assert.strictEqual(path.win32.basename('foo'), 'foo');
        assert.strictEqual(path.win32.basename('aaa\\bbb', '\\bbb'), 'bbb');
        assert.strictEqual(path.win32.basename('aaa\\bbb', 'a\\bbb'), 'bbb');
        assert.strictEqual(path.win32.basename('aaa\\bbb', 'bbb'), 'bbb');
        assert.strictEqual(path.win32.basename('aaa\\bbb\\\\\\\\', 'bbb'), 'bbb');
        assert.strictEqual(path.win32.basename('aaa\\bbb', 'bb'), 'b');
        assert.strictEqual(path.win32.basename('aaa\\bbb', 'b'), 'bb');
        assert.strictEqual(path.win32.basename('C:'), '');
        assert.strictEqual(path.win32.basename('C:.'), '.');
        assert.strictEqual(path.win32.basename('C:\\'), '');
        assert.strictEqual(path.win32.basename('C:\\dir\\base.ext'), 'base.ext');
        assert.strictEqual(path.win32.basename('C:\\basename.ext'), 'basename.ext');
        assert.strictEqual(path.win32.basename('C:basename.ext'), 'basename.ext');
        assert.strictEqual(path.win32.basename('C:basename.ext\\'), 'basename.ext');
        assert.strictEqual(path.win32.basename('C:basename.ext\\\\'), 'basename.ext');
        assert.strictEqual(path.win32.basename('C:foo'), 'foo');
        assert.strictEqual(path.win32.basename('file:stream'), 'file:stream');
        assert.strictEqual(path.win32.basename('a', 'a'), '');
        // On unix a backslash is just treated as any other character.
        assert.strictEqual(path.posix.basename('\\dir\\basename.ext'), '\\dir\\basename.ext');
        assert.strictEqual(path.posix.basename('\\basename.ext'), '\\basename.ext');
        assert.strictEqual(path.posix.basename('basename.ext'), 'basename.ext');
        assert.strictEqual(path.posix.basename('basename.ext\\'), 'basename.ext\\');
        assert.strictEqual(path.posix.basename('basename.ext\\\\'), 'basename.ext\\\\');
        assert.strictEqual(path.posix.basename('foo'), 'foo');
        // POSIX filenames may include control characters
        // c.f. http://www.dwheeler.com/essays/fixing-unix-linux-filenames.html
        const controlCharFilename = `Icon${String.fromCharCode(13)}`;
        assert.strictEqual(path.posix.basename(`/a/b/${controlCharFilename}`), controlCharFilename);
        // Tests from VSCode
        assert.strictEqual(path.basename('foo/bar'), 'bar');
        assert.strictEqual(path.posix.basename('foo\\bar'), 'foo\\bar');
        assert.strictEqual(path.win32.basename('foo\\bar'), 'bar');
        assert.strictEqual(path.basename('/foo/bar'), 'bar');
        assert.strictEqual(path.posix.basename('\\foo\\bar'), '\\foo\\bar');
        assert.strictEqual(path.win32.basename('\\foo\\bar'), 'bar');
        assert.strictEqual(path.basename('./bar'), 'bar');
        assert.strictEqual(path.posix.basename('.\\bar'), '.\\bar');
        assert.strictEqual(path.win32.basename('.\\bar'), 'bar');
        assert.strictEqual(path.basename('/bar'), 'bar');
        assert.strictEqual(path.posix.basename('\\bar'), '\\bar');
        assert.strictEqual(path.win32.basename('\\bar'), 'bar');
        assert.strictEqual(path.basename('bar/'), 'bar');
        assert.strictEqual(path.posix.basename('bar\\'), 'bar\\');
        assert.strictEqual(path.win32.basename('bar\\'), 'bar');
        assert.strictEqual(path.basename('bar'), 'bar');
        assert.strictEqual(path.basename('////////'), '');
        assert.strictEqual(path.posix.basename('\\\\\\\\'), '\\\\\\\\');
        assert.strictEqual(path.win32.basename('\\\\\\\\'), '');
    });
    test('relative', () => {
        const failures = [];
        const relativeTests = [
            [path.win32.relative,
                // arguments                     result
                [['c:/blah\\blah', 'd:/games', 'd:\\games'],
                    ['c:/aaaa/bbbb', 'c:/aaaa', '..'],
                    ['c:/aaaa/bbbb', 'c:/cccc', '..\\..\\cccc'],
                    ['c:/aaaa/bbbb', 'c:/aaaa/bbbb', ''],
                    ['c:/aaaa/bbbb', 'c:/aaaa/cccc', '..\\cccc'],
                    ['c:/aaaa/', 'c:/aaaa/cccc', 'cccc'],
                    ['c:/', 'c:\\aaaa\\bbbb', 'aaaa\\bbbb'],
                    ['c:/aaaa/bbbb', 'd:\\', 'd:\\'],
                    ['c:/AaAa/bbbb', 'c:/aaaa/bbbb', ''],
                    ['c:/aaaaa/', 'c:/aaaa/cccc', '..\\aaaa\\cccc'],
                    ['C:\\foo\\bar\\baz\\quux', 'C:\\', '..\\..\\..\\..'],
                    ['C:\\foo\\test', 'C:\\foo\\test\\bar\\package.json', 'bar\\package.json'],
                    ['C:\\foo\\bar\\baz-quux', 'C:\\foo\\bar\\baz', '..\\baz'],
                    ['C:\\foo\\bar\\baz', 'C:\\foo\\bar\\baz-quux', '..\\baz-quux'],
                    ['\\\\foo\\bar', '\\\\foo\\bar\\baz', 'baz'],
                    ['\\\\foo\\bar\\baz', '\\\\foo\\bar', '..'],
                    ['\\\\foo\\bar\\baz-quux', '\\\\foo\\bar\\baz', '..\\baz'],
                    ['\\\\foo\\bar\\baz', '\\\\foo\\bar\\baz-quux', '..\\baz-quux'],
                    ['C:\\baz-quux', 'C:\\baz', '..\\baz'],
                    ['C:\\baz', 'C:\\baz-quux', '..\\baz-quux'],
                    ['\\\\foo\\baz-quux', '\\\\foo\\baz', '..\\baz'],
                    ['\\\\foo\\baz', '\\\\foo\\baz-quux', '..\\baz-quux'],
                    ['C:\\baz', '\\\\foo\\bar\\baz', '\\\\foo\\bar\\baz'],
                    ['\\\\foo\\bar\\baz', 'C:\\baz', 'C:\\baz']
                ]
            ],
            [path.posix.relative,
                // arguments          result
                [['/var/lib', '/var', '..'],
                    ['/var/lib', '/bin', '../../bin'],
                    ['/var/lib', '/var/lib', ''],
                    ['/var/lib', '/var/apache', '../apache'],
                    ['/var/', '/var/lib', 'lib'],
                    ['/', '/var/lib', 'var/lib'],
                    ['/foo/test', '/foo/test/bar/package.json', 'bar/package.json'],
                    ['/Users/a/web/b/test/mails', '/Users/a/web/b', '../..'],
                    ['/foo/bar/baz-quux', '/foo/bar/baz', '../baz'],
                    ['/foo/bar/baz', '/foo/bar/baz-quux', '../baz-quux'],
                    ['/baz-quux', '/baz', '../baz'],
                    ['/baz', '/baz-quux', '../baz-quux']
                ]
            ]
        ];
        relativeTests.forEach((test) => {
            const relative = test[0];
            //@ts-expect-error
            test[1].forEach((test) => {
                //@ts-expect-error
                const actual = relative(test[0], test[1]);
                const expected = test[2];
                const os = relative === path.win32.relative ? 'win32' : 'posix';
                const message = `path.${os}.relative(${test.slice(0, 2).map(JSON.stringify).join(',')})\n  expect=${JSON.stringify(expected)}\n  actual=${JSON.stringify(actual)}`;
                if (actual !== expected) {
                    failures.push(`\n${message}`);
                }
            });
        });
        assert.strictEqual(failures.length, 0, failures.join(''));
    });
    test('normalize', () => {
        assert.strictEqual(path.win32.normalize('./fixtures///b/../b/c.js'), 'fixtures\\b\\c.js');
        assert.strictEqual(path.win32.normalize('/foo/../../../bar'), '\\bar');
        assert.strictEqual(path.win32.normalize('a//b//../b'), 'a\\b');
        assert.strictEqual(path.win32.normalize('a//b//./c'), 'a\\b\\c');
        assert.strictEqual(path.win32.normalize('a//b//.'), 'a\\b');
        assert.strictEqual(path.win32.normalize('//server/share/dir/file.ext'), '\\\\server\\share\\dir\\file.ext');
        assert.strictEqual(path.win32.normalize('/a/b/c/../../../x/y/z'), '\\x\\y\\z');
        assert.strictEqual(path.win32.normalize('C:'), 'C:.');
        assert.strictEqual(path.win32.normalize('C:..\\abc'), 'C:..\\abc');
        assert.strictEqual(path.win32.normalize('C:..\\..\\abc\\..\\def'), 'C:..\\..\\def');
        assert.strictEqual(path.win32.normalize('C:\\.'), 'C:\\');
        assert.strictEqual(path.win32.normalize('file:stream'), 'file:stream');
        assert.strictEqual(path.win32.normalize('bar\\foo..\\..\\'), 'bar\\');
        assert.strictEqual(path.win32.normalize('bar\\foo..\\..'), 'bar');
        assert.strictEqual(path.win32.normalize('bar\\foo..\\..\\baz'), 'bar\\baz');
        assert.strictEqual(path.win32.normalize('bar\\foo..\\'), 'bar\\foo..\\');
        assert.strictEqual(path.win32.normalize('bar\\foo..'), 'bar\\foo..');
        assert.strictEqual(path.win32.normalize('..\\foo..\\..\\..\\bar'), '..\\..\\bar');
        assert.strictEqual(path.win32.normalize('..\\...\\..\\.\\...\\..\\..\\bar'), '..\\..\\bar');
        assert.strictEqual(path.win32.normalize('../../../foo/../../../bar'), '..\\..\\..\\..\\..\\bar');
        assert.strictEqual(path.win32.normalize('../../../foo/../../../bar/../../'), '..\\..\\..\\..\\..\\..\\');
        assert.strictEqual(path.win32.normalize('../foobar/barfoo/foo/../../../bar/../../'), '..\\..\\');
        assert.strictEqual(path.win32.normalize('../.../../foobar/../../../bar/../../baz'), '..\\..\\..\\..\\baz');
        assert.strictEqual(path.win32.normalize('foo/bar\\baz'), 'foo\\bar\\baz');
        assert.strictEqual(path.posix.normalize('./fixtures///b/../b/c.js'), 'fixtures/b/c.js');
        assert.strictEqual(path.posix.normalize('/foo/../../../bar'), '/bar');
        assert.strictEqual(path.posix.normalize('a//b//../b'), 'a/b');
        assert.strictEqual(path.posix.normalize('a//b//./c'), 'a/b/c');
        assert.strictEqual(path.posix.normalize('a//b//.'), 'a/b');
        assert.strictEqual(path.posix.normalize('/a/b/c/../../../x/y/z'), '/x/y/z');
        assert.strictEqual(path.posix.normalize('///..//./foo/.//bar'), '/foo/bar');
        assert.strictEqual(path.posix.normalize('bar/foo../../'), 'bar/');
        assert.strictEqual(path.posix.normalize('bar/foo../..'), 'bar');
        assert.strictEqual(path.posix.normalize('bar/foo../../baz'), 'bar/baz');
        assert.strictEqual(path.posix.normalize('bar/foo../'), 'bar/foo../');
        assert.strictEqual(path.posix.normalize('bar/foo..'), 'bar/foo..');
        assert.strictEqual(path.posix.normalize('../foo../../../bar'), '../../bar');
        assert.strictEqual(path.posix.normalize('../.../.././.../../../bar'), '../../bar');
        assert.strictEqual(path.posix.normalize('../../../foo/../../../bar'), '../../../../../bar');
        assert.strictEqual(path.posix.normalize('../../../foo/../../../bar/../../'), '../../../../../../');
        assert.strictEqual(path.posix.normalize('../foobar/barfoo/foo/../../../bar/../../'), '../../');
        assert.strictEqual(path.posix.normalize('../.../../foobar/../../../bar/../../baz'), '../../../../baz');
        assert.strictEqual(path.posix.normalize('foo/bar\\baz'), 'foo/bar\\baz');
    });
    test('isAbsolute', () => {
        assert.strictEqual(path.win32.isAbsolute('/'), true);
        assert.strictEqual(path.win32.isAbsolute('//'), true);
        assert.strictEqual(path.win32.isAbsolute('//server'), true);
        assert.strictEqual(path.win32.isAbsolute('//server/file'), true);
        assert.strictEqual(path.win32.isAbsolute('\\\\server\\file'), true);
        assert.strictEqual(path.win32.isAbsolute('\\\\server'), true);
        assert.strictEqual(path.win32.isAbsolute('\\\\'), true);
        assert.strictEqual(path.win32.isAbsolute('c'), false);
        assert.strictEqual(path.win32.isAbsolute('c:'), false);
        assert.strictEqual(path.win32.isAbsolute('c:\\'), true);
        assert.strictEqual(path.win32.isAbsolute('c:/'), true);
        assert.strictEqual(path.win32.isAbsolute('c://'), true);
        assert.strictEqual(path.win32.isAbsolute('C:/Users/'), true);
        assert.strictEqual(path.win32.isAbsolute('C:\\Users\\'), true);
        assert.strictEqual(path.win32.isAbsolute('C:cwd/another'), false);
        assert.strictEqual(path.win32.isAbsolute('C:cwd\\another'), false);
        assert.strictEqual(path.win32.isAbsolute('directory/directory'), false);
        assert.strictEqual(path.win32.isAbsolute('directory\\directory'), false);
        assert.strictEqual(path.posix.isAbsolute('/home/foo'), true);
        assert.strictEqual(path.posix.isAbsolute('/home/foo/..'), true);
        assert.strictEqual(path.posix.isAbsolute('bar/'), false);
        assert.strictEqual(path.posix.isAbsolute('./baz'), false);
        // Tests from VSCode:
        // Absolute Paths
        [
            'C:/',
            'C:\\',
            'C:/foo',
            'C:\\foo',
            'z:/foo/bar.txt',
            'z:\\foo\\bar.txt',
            '\\\\localhost\\c$\\foo',
            '/',
            '/foo'
        ].forEach(absolutePath => {
            assert.ok(path.win32.isAbsolute(absolutePath), absolutePath);
        });
        [
            '/',
            '/foo',
            '/foo/bar.txt'
        ].forEach(absolutePath => {
            assert.ok(path.posix.isAbsolute(absolutePath), absolutePath);
        });
        // Relative Paths
        [
            '',
            'foo',
            'foo/bar',
            './foo',
            'http://foo.com/bar'
        ].forEach(nonAbsolutePath => {
            assert.ok(!path.win32.isAbsolute(nonAbsolutePath), nonAbsolutePath);
        });
        [
            '',
            'foo',
            'foo/bar',
            './foo',
            'http://foo.com/bar',
            'z:/foo/bar.txt',
        ].forEach(nonAbsolutePath => {
            assert.ok(!path.posix.isAbsolute(nonAbsolutePath), nonAbsolutePath);
        });
    });
    test('path', () => {
        // path.sep tests
        // windows
        assert.strictEqual(path.win32.sep, '\\');
        // posix
        assert.strictEqual(path.posix.sep, '/');
        // path.delimiter tests
        // windows
        assert.strictEqual(path.win32.delimiter, ';');
        // posix
        assert.strictEqual(path.posix.delimiter, ':');
        // if (isWindows) {
        // 	assert.strictEqual(path, path.win32);
        // } else {
        // 	assert.strictEqual(path, path.posix);
        // }
    });
    // test('perf', () => {
    // 	const folderNames = [
    // 		'abc',
    // 		'Users',
    // 		'reallylongfoldername',
    // 		's',
    // 		'reallyreallyreallylongfoldername',
    // 		'home'
    // 	];
    // 	const basePaths = [
    // 		'C:',
    // 		'',
    // 	];
    // 	const separators = [
    // 		'\\',
    // 		'/'
    // 	];
    // 	function randomInt(ciel: number): number {
    // 		return Math.floor(Math.random() * ciel);
    // 	}
    // 	let pathsToNormalize = [];
    // 	let pathsToJoin = [];
    // 	let i;
    // 	for (i = 0; i < 1000000; i++) {
    // 		const basePath = basePaths[randomInt(basePaths.length)];
    // 		let lengthOfPath = randomInt(10) + 2;
    // 		let pathToNormalize = basePath + separators[randomInt(separators.length)];
    // 		while (lengthOfPath-- > 0) {
    // 			pathToNormalize = pathToNormalize + folderNames[randomInt(folderNames.length)] + separators[randomInt(separators.length)];
    // 		}
    // 		pathsToNormalize.push(pathToNormalize);
    // 		let pathToJoin = '';
    // 		lengthOfPath = randomInt(10) + 2;
    // 		while (lengthOfPath-- > 0) {
    // 			pathToJoin = pathToJoin + folderNames[randomInt(folderNames.length)] + separators[randomInt(separators.length)];
    // 		}
    // 		pathsToJoin.push(pathToJoin + '.ts');
    // 	}
    // 	let newTime = 0;
    // 	let j;
    // 	for(j = 0; j < pathsToJoin.length; j++) {
    // 		const path1 = pathsToNormalize[j];
    // 		const path2 = pathsToNormalize[j];
    // 		const newStart = performance.now();
    // 		path.join(path1, path2);
    // 		newTime += performance.now() - newStart;
    // 	}
    // 	assert.ok(false, `Time: ${newTime}ms.`);
    // });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9wYXRoLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcseUZBQXlGO0FBQ3pGLDRGQUE0RjtBQUU1RixzREFBc0Q7QUFDdEQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSw0RUFBNEU7QUFDNUUscUVBQXFFO0FBQ3JFLHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLHlEQUF5RDtBQUN6RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsMkVBQTJFO0FBQzNFLHdFQUF3RTtBQUN4RSw0RUFBNEU7QUFDNUUseUNBQXlDO0FBRXpDLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssSUFBSSxNQUFNLHNCQUFzQixDQUFDO0FBQzdDLE9BQU8sRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUQsT0FBTyxLQUFLLE9BQU8sTUFBTSx5QkFBeUIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUM7SUFDbEMsdUNBQXVDLEVBQUUsQ0FBQztJQUMxQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRTtRQUNqQixNQUFNLFFBQVEsR0FBRyxFQUFjLENBQUM7UUFDaEMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBRTFCLE1BQU0sU0FBUyxHQUFRO1lBQ3RCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFD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Y0FBYyxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsV0FBVyxDQUFD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QUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0s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