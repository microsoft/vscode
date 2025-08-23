// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import { IFileSystem } from '../../../client/common/platform/types';
import { IPathUtils } from '../../../client/common/types';
import { EnvironmentVariablesService, parseEnvFile } from '../../../client/common/variables/environment';
import { getSearchPathEnvVarNames } from '../../../client/common/utils/exec';

use(chaiAsPromised.default);

type PathVar = 'Path' | 'PATH';
const PATHS = getSearchPathEnvVarNames();

suite('Environment Variables Service', () => {
    const filename = 'x/y/z/.env';
    const processEnvPath = getSearchPathEnvVarNames()[0];
    let pathUtils: TypeMoq.IMock<IPathUtils>;
    let fs: TypeMoq.IMock<IFileSystem>;
    let variablesService: EnvironmentVariablesService;
    setup(() => {
        pathUtils = TypeMoq.Mock.ofType<IPathUtils>(undefined, TypeMoq.MockBehavior.Strict);
        fs = TypeMoq.Mock.ofType<IFileSystem>(undefined, TypeMoq.MockBehavior.Strict);
        variablesService = new EnvironmentVariablesService(
            // This is the only place that the mocks are used.
            pathUtils.object,
            fs.object,
        );
    });
    function verifyAll() {
        pathUtils.verifyAll();
        fs.verifyAll();
    }
    function setFile(fileName: string, text: string) {
        fs.setup((f) => f.pathExists(fileName)) // Handle the specific file.
            .returns(() => Promise.resolve(true)); // The file exists.
        fs.setup((f) => f.readFile(fileName)) // Handle the specific file.
            .returns(() => Promise.resolve(text)); // Pretend to read from the file.
    }

    suite('parseFile()', () => {
        test('Custom variables should be undefined with no argument', async () => {
            const vars = await variablesService.parseFile(undefined);

            expect(vars).to.equal(undefined, 'Variables should be undefined');
            verifyAll();
        });

        test('Custom variables should be undefined with non-existent files', async () => {
            fs.setup((f) => f.pathExists(filename)) // Handle the specific file.
                .returns(() => Promise.resolve(false)); // The file is missing.

            const vars = await variablesService.parseFile(filename);

            expect(vars).to.equal(undefined, 'Variables should be undefined');
            verifyAll();
        });

        test('Custom variables should be undefined when folder name is passed instead of a file name', async () => {
            const dirname = 'x/y/z';
            fs.setup((f) => f.pathExists(dirname)) // Handle the specific "file".
                .returns(() => Promise.resolve(false)); // It isn't a "regular" file.

            const vars = await variablesService.parseFile(dirname);

            expect(vars).to.equal(undefined, 'Variables should be undefined');
            verifyAll();
        });

        test('Custom variables should be not undefined with a valid environment file', async () => {
            setFile(filename, '...');

            const vars = await variablesService.parseFile(filename);

            expect(vars).to.not.equal(undefined, 'Variables should be undefined');
            verifyAll();
        });

        test('Custom variables should be parsed from env file', async () => {
            // src/testMultiRootWkspc/workspace4/.env
            setFile(
                filename,
                `
X1234PYEXTUNITTESTVAR=1234
PYTHONPATH=../workspace5
                `,
            );

            const vars = await variablesService.parseFile(filename);

            expect(vars).to.not.equal(undefined, 'Variables is is undefiend');
            expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('X1234PYEXTUNITTESTVAR', '1234', 'X1234PYEXTUNITTESTVAR value is invalid');
            expect(vars).to.have.property('PYTHONPATH', '../workspace5', 'PYTHONPATH value is invalid');
            verifyAll();
        });

        test('PATH and PYTHONPATH from env file should be returned as is', async () => {
            const expectedPythonPath = '/usr/one/three:/usr/one/four';
            const expectedPath = '/usr/x:/usr/y';
            // src/testMultiRootWkspc/workspace4/.env
            setFile(
                filename,
                `
X=1
Y=2
PYTHONPATH=/usr/one/three:/usr/one/four
# Unix PATH variable
PATH=/usr/x:/usr/y
# Windows Path variable
Path=/usr/x:/usr/y
                `,
            );

            const vars = await variablesService.parseFile(filename);

            expect(vars).to.not.equal(undefined, 'Variables is is undefiend');
            expect(Object.keys(vars!)).lengthOf(5, 'Incorrect number of variables');
            expect(vars).to.have.property('X', '1', 'X value is invalid');
            expect(vars).to.have.property('Y', '2', 'Y value is invalid');
            expect(vars).to.have.property('PYTHONPATH', expectedPythonPath, 'PYTHONPATH value is invalid');
            expect(vars).to.have.property('PATH', expectedPath, 'PATH value is invalid');
            verifyAll();
        });

        test('Simple variable substitution is supported', async () => {
            // src/testMultiRootWkspc/workspace4/.env
            setFile(
                filename,

                '\
REPO=/home/user/git/foobar\n\
PYTHONPATH=${REPO}/foo:${REPO}/bar\n\
PYTHON=${BINDIR}/python3\n\
                ',
            );

            const vars = await variablesService.parseFile(filename, { BINDIR: '/usr/bin' });

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(3, 'Incorrect number of variables');
            expect(vars).to.have.property('REPO', '/home/user/git/foobar', 'value is invalid');
            expect(vars).to.have.property(
                'PYTHONPATH',
                '/home/user/git/foobar/foo:/home/user/git/foobar/bar',
                'value is invalid',
            );
            expect(vars).to.have.property('PYTHON', '/usr/bin/python3', 'value is invalid');
            verifyAll();
        });
    });

    PATHS.map((pathVariable) => {
        suite(`mergeVariables() (path var: ${pathVariable})`, () => {
            setup(() => {
                pathUtils
                    .setup((pu) => pu.getPathVariableName()) // This always gets called.
                    .returns(() => pathVariable as PathVar); // Pretend we're on a specific platform.
            });

            test('Ensure variables are merged', async () => {
                const vars1 = { ONE: '1', TWO: 'TWO' };
                const vars2 = { ONE: 'ONE', THREE: '3' };

                variablesService.mergeVariables(vars1, vars2);

                expect(Object.keys(vars1)).lengthOf(2, 'Source variables modified');
                expect(Object.keys(vars2)).lengthOf(3, 'Variables not merged');
                expect(vars2).to.have.property('ONE', 'ONE', 'Variable overwritten');
                expect(vars2).to.have.property('TWO', 'TWO', 'Incorrect value');
                expect(vars2).to.have.property('THREE', '3', 'Variable not merged');
                verifyAll();
            });

            test('Ensure path variabnles variables are not merged into target', async () => {
                const vars1 = { ONE: '1', TWO: 'TWO', PYTHONPATH: 'PYTHONPATH' };

                (vars1 as any)[pathVariable] = 'PATH';
                const vars2 = { ONE: 'ONE', THREE: '3' };

                variablesService.mergeVariables(vars1, vars2);

                expect(Object.keys(vars1)).lengthOf(4, 'Source variables modified');
                expect(Object.keys(vars2)).lengthOf(3, 'Variables not merged');
                expect(vars2).to.have.property('ONE', 'ONE', 'Variable overwritten');
                expect(vars2).to.have.property('TWO', 'TWO', 'Incorrect value');
                expect(vars2).to.have.property('THREE', '3', 'Variable not merged');
                verifyAll();
            });

            test('Ensure path variables in target are left untouched', async () => {
                const vars1 = { ONE: '1', TWO: 'TWO' };
                const vars2 = { ONE: 'ONE', THREE: '3', PYTHONPATH: 'PYTHONPATH' };

                (vars2 as any)[pathVariable] = 'PATH';

                variablesService.mergeVariables(vars1, vars2);

                expect(Object.keys(vars1)).lengthOf(2, 'Source variables modified');
                expect(Object.keys(vars2)).lengthOf(5, 'Variables not merged');
                expect(vars2).to.have.property('ONE', 'ONE', 'Variable overwritten');
                expect(vars2).to.have.property('TWO', 'TWO', 'Incorrect value');
                expect(vars2).to.have.property('THREE', '3', 'Variable not merged');
                expect(vars2).to.have.property('PYTHONPATH', 'PYTHONPATH', 'Incorrect value');
                expect(vars2).to.have.property(processEnvPath, 'PATH', 'Incorrect value');
                verifyAll();
            });

            test('Ensure path variables in target are overwritten', async () => {
                const source = { ONE: '1', TWO: 'TWO' };
                const target = { ONE: 'ONE', THREE: '3', PYTHONPATH: 'PYTHONPATH' };

                (target as any)[pathVariable] = 'PATH';

                variablesService.mergeVariables(source, target, { overwrite: true });

                expect(Object.keys(source)).lengthOf(2, 'Source variables modified');
                expect(Object.keys(target)).lengthOf(5, 'Variables not merged');
                expect(target).to.have.property('ONE', '1', 'Expected to be overwritten');
                expect(target).to.have.property('TWO', 'TWO', 'Incorrect value');
                expect(target).to.have.property('THREE', '3', 'Variable not merged');
                expect(target).to.have.property('PYTHONPATH', 'PYTHONPATH', 'Incorrect value');
                expect(target).to.have.property(processEnvPath, 'PATH', 'Incorrect value');
                verifyAll();
            });
        });
    });

    PATHS.map((pathVariable) => {
        suite(`appendPath() (path var: ${pathVariable})`, () => {
            setup(() => {
                pathUtils
                    .setup((pu) => pu.getPathVariableName()) // This always gets called.
                    .returns(() => pathVariable as PathVar); // Pretend we're on a specific platform.
            });

            test('Ensure appending PATH has no effect if an undefined value or empty string is provided and PATH does not exist in vars object', async () => {
                const vars = { ONE: '1' };

                variablesService.appendPath(vars);
                expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');

                variablesService.appendPath(vars, '');
                expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');

                variablesService.appendPath(vars, ' ', '');
                expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');

                verifyAll();
            });

            test(`Ensure appending PATH has no effect if an empty string is provided and path does not exist in vars object (${pathVariable})`, async () => {
                const vars = { ONE: '1' };

                (vars as any)[pathVariable] = 'PATH';

                variablesService.appendPath(vars);
                expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');
                expect(vars).to.have.property(processEnvPath, 'PATH', 'Incorrect value');

                variablesService.appendPath(vars, '');
                expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');
                expect(vars).to.have.property(processEnvPath, 'PATH', 'Incorrect value');

                variablesService.appendPath(vars, ' ', '');
                expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');
                expect(vars).to.have.property(processEnvPath, 'PATH', 'Incorrect value');

                verifyAll();
            });

            test(`Ensure PATH is appeneded (${pathVariable})`, async () => {
                const vars = { ONE: '1' };

                (vars as any)[pathVariable] = 'PATH';
                const pathToAppend = `/usr/one${path.delimiter}/usr/three`;

                variablesService.appendPath(vars, pathToAppend);

                expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('ONE', '1', 'Incorrect value');
                expect(vars).to.have.property(
                    processEnvPath,
                    `PATH${path.delimiter}${pathToAppend}`,
                    'Incorrect value',
                );
                verifyAll();
            });
        });
    });

    suite('appendPythonPath()', () => {
        test('Ensure appending PYTHONPATH has no effect if an undefined value or empty string is provided and PYTHONPATH does not exist in vars object', async () => {
            const vars = { ONE: '1' };

            variablesService.appendPythonPath(vars);
            expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');

            variablesService.appendPythonPath(vars, '');
            expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');

            variablesService.appendPythonPath(vars, ' ', '');
            expect(Object.keys(vars)).lengthOf(1, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');

            verifyAll();
        });

        test('Ensure appending PYTHONPATH has no effect if an empty string is provided and PYTHONPATH does not exist in vars object', async () => {
            const vars = { ONE: '1', PYTHONPATH: 'PYTHONPATH' };

            variablesService.appendPythonPath(vars);
            expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');
            expect(vars).to.have.property('PYTHONPATH', 'PYTHONPATH', 'Incorrect value');

            variablesService.appendPythonPath(vars, '');
            expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');
            expect(vars).to.have.property('PYTHONPATH', 'PYTHONPATH', 'Incorrect value');

            variablesService.appendPythonPath(vars, ' ', '');
            expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');
            expect(vars).to.have.property('PYTHONPATH', 'PYTHONPATH', 'Incorrect value');

            verifyAll();
        });

        test('Ensure appending PYTHONPATH has no effect if an empty string is provided and PYTHONPATH does not exist in vars object', async () => {
            const vars = { ONE: '1', PYTHONPATH: 'PYTHONPATH' };
            const pathToAppend = `/usr/one${path.delimiter}/usr/three`;

            variablesService.appendPythonPath(vars, pathToAppend);

            expect(Object.keys(vars)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('ONE', '1', 'Incorrect value');
            expect(vars).to.have.property(
                'PYTHONPATH',
                `PYTHONPATH${path.delimiter}${pathToAppend}`,
                'Incorrect value',
            );
            verifyAll();
        });
    });
});

suite('Parsing Environment Variables Files', () => {
    suite('parseEnvFile()', () => {
        test('Custom variables should be parsed from env file', () => {
            const vars = parseEnvFile(`
X1234PYEXTUNITTESTVAR=1234
PYTHONPATH=../workspace5
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('X1234PYEXTUNITTESTVAR', '1234', 'X1234PYEXTUNITTESTVAR value is invalid');
            expect(vars).to.have.property('PYTHONPATH', '../workspace5', 'PYTHONPATH value is invalid');
        });

        test('PATH and PYTHONPATH from env file should be returned as is', () => {
            const vars = parseEnvFile(`
X=1
Y=2
PYTHONPATH=/usr/one/three:/usr/one/four
# Unix PATH variable
PATH=/usr/x:/usr/y
# Windows Path variable
Path=/usr/x:/usr/y
            `);

            const expectedPythonPath = '/usr/one/three:/usr/one/four';
            const expectedPath = '/usr/x:/usr/y';
            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(5, 'Incorrect number of variables');
            expect(vars).to.have.property('X', '1', 'X value is invalid');
            expect(vars).to.have.property('Y', '2', 'Y value is invalid');
            expect(vars).to.have.property('PYTHONPATH', expectedPythonPath, 'PYTHONPATH value is invalid');
            expect(vars).to.have.property('PATH', expectedPath, 'PATH value is invalid');
        });

        test('Variable names must be alpha + alnum/underscore', () => {
            const vars = parseEnvFile(`
SPAM=1234
ham=5678
Eggs=9012
1bogus2=...
bogus 3=...
bogus.4=...
bogus-5=...
bogus~6=...
VAR1=3456
VAR_2=7890
_VAR_3=1234
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(6, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
            expect(vars).to.have.property('ham', '5678', 'value is invalid');
            expect(vars).to.have.property('Eggs', '9012', 'value is invalid');
            expect(vars).to.have.property('VAR1', '3456', 'value is invalid');
            expect(vars).to.have.property('VAR_2', '7890', 'value is invalid');
            expect(vars).to.have.property('_VAR_3', '1234', 'value is invalid');
        });

        test('Empty values become empty string', () => {
            const vars = parseEnvFile(`
SPAM=
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(1, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '', 'value is invalid');
        });

        test('Outer quotation marks are removed and cause newline substitution', () => {
            const vars = parseEnvFile(`
SPAM=12\\n34
HAM='56\\n78'
EGGS="90\\n12"
FOO='"34\\n56"'
BAR="'78\\n90'"
BAZ="\"AB\\nCD"
VAR1="EF\\nGH
VAR2=IJ\\nKL"
VAR3='MN'OP'
VAR4="QR"ST"
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(10, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '12\\n34', 'value is invalid');
            expect(vars).to.have.property('HAM', '56\n78', 'value is invalid');
            expect(vars).to.have.property('EGGS', '90\n12', 'value is invalid');
            expect(vars).to.have.property('FOO', '"34\n56"', 'value is invalid');
            expect(vars).to.have.property('BAR', "'78\n90'", 'value is invalid');
            expect(vars).to.have.property('BAZ', '"AB\nCD', 'value is invalid');
            expect(vars).to.have.property('VAR1', '"EF\\nGH', 'value is invalid');
            expect(vars).to.have.property('VAR2', 'IJ\\nKL"', 'value is invalid');

            // TODO: Should the outer marks be left?
            expect(vars).to.have.property('VAR3', "MN'OP", 'value is invalid');
            expect(vars).to.have.property('VAR4', 'QR"ST', 'value is invalid');
        });

        test('Whitespace is ignored', () => {
            const vars = parseEnvFile(`
SPAM=1234
HAM =5678
EGGS= 9012
FOO = 3456
  BAR=7890
  BAZ = ABCD
VAR1=EFGH  ...
VAR2=IJKL
VAR3='  MNOP  '
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(9, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
            expect(vars).to.have.property('HAM', '5678', 'value is invalid');
            expect(vars).to.have.property('EGGS', '9012', 'value is invalid');
            expect(vars).to.have.property('FOO', '3456', 'value is invalid');
            expect(vars).to.have.property('BAR', '7890', 'value is invalid');
            expect(vars).to.have.property('BAZ', 'ABCD', 'value is invalid');
            expect(vars).to.have.property('VAR1', 'EFGH  ...', 'value is invalid');
            expect(vars).to.have.property('VAR2', 'IJKL', 'value is invalid');
            expect(vars).to.have.property('VAR3', '  MNOP  ', 'value is invalid');
        });

        test('Blank lines are ignored', () => {
            const vars = parseEnvFile(`

SPAM=1234

HAM=5678


            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
            expect(vars).to.have.property('HAM', '5678', 'value is invalid');
        });

        test('Comments are ignored', () => {
            const vars = parseEnvFile(`
# step 1
SPAM=1234
  # step 2
HAM=5678
#step 3
EGGS=9012  # ...
#  done
            `);

            expect(vars).to.not.equal(undefined, 'Variables is undefiend');
            expect(Object.keys(vars!)).lengthOf(3, 'Incorrect number of variables');
            expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
            expect(vars).to.have.property('HAM', '5678', 'value is invalid');
            expect(vars).to.have.property('EGGS', '9012  # ...', 'value is invalid');
        });

        suite('variable substitution', () => {
            test('Basic substitution syntax', () => {
                const vars = parseEnvFile(
                    '\
REPO=/home/user/git/foobar \n\
PYTHONPATH=${REPO}/foo:${REPO}/bar \n\
                ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('REPO', '/home/user/git/foobar', 'value is invalid');
                expect(vars).to.have.property(
                    'PYTHONPATH',
                    '/home/user/git/foobar/foo:/home/user/git/foobar/bar',
                    'value is invalid',
                );
            });

            test('Example from docs', () => {
                const vars = parseEnvFile(
                    '\
VAR1=abc \n\
VAR2_A="${VAR1}\\ndef" \n\
VAR2_B="${VAR1}\\n"def \n\
                ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefined');
                expect(Object.keys(vars!)).lengthOf(3, 'Incorrect number of variables');
                expect(vars).to.have.property('VAR1', 'abc', 'value is invalid');
                expect(vars).to.have.property('VAR2_A', 'abc\ndef', 'value is invalid');
                expect(vars).to.have.property('VAR2_B', '"abc\\n"def', 'value is invalid');
            });

            test('Curly braces are required for substitution', () => {
                const vars = parseEnvFile('\
SPAM=1234 \n\
EGGS=$SPAM \n\
                ');

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
                expect(vars).to.have.property('EGGS', '$SPAM', 'value is invalid');
            });

            test('Nested substitution is not supported', () => {
                const vars = parseEnvFile(
                    '\
SPAM=EGGS \n\
EGGS=??? \n\
HAM1="-- ${${SPAM}} --"\n\
abcEGGSxyz=!!! \n\
HAM2="-- ${abc${SPAM}xyz} --"\n\
HAM3="-- ${${SPAM} --"\n\
HAM4="-- ${${SPAM}} ${EGGS} --"\n\
                    ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(7, 'Incorrect number of variables');
                expect(vars).to.have.property('SPAM', 'EGGS', 'value is invalid');
                expect(vars).to.have.property('EGGS', '???', 'value is invalid');
                expect(vars).to.have.property('HAM1', '-- ${${SPAM}} --', 'value is invalid');
                expect(vars).to.have.property('abcEGGSxyz', '!!!', 'value is invalid');
                expect(vars).to.have.property('HAM2', '-- ${abc${SPAM}xyz} --', 'value is invalid');
                expect(vars).to.have.property('HAM3', '-- ${${SPAM} --', 'value is invalid');
                expect(vars).to.have.property('HAM4', '-- ${${SPAM}} ${EGGS} --', 'value is invalid');
            });

            test('Other bad substitution syntax', () => {
                const vars = parseEnvFile(
                    '\
SPAM=EGGS \n\
EGGS=??? \n\
HAM1=${} \n\
HAM2=${ \n\
HAM3=${SPAM+EGGS} \n\
HAM4=$SPAM \n\
                ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(6, 'Incorrect number of variables');
                expect(vars).to.have.property('SPAM', 'EGGS', 'value is invalid');
                expect(vars).to.have.property('EGGS', '???', 'value is invalid');
                expect(vars).to.have.property('HAM1', '${}', 'value is invalid');
                expect(vars).to.have.property('HAM2', '${', 'value is invalid');
                expect(vars).to.have.property('HAM3', '${SPAM+EGGS}', 'value is invalid');
                expect(vars).to.have.property('HAM4', '$SPAM', 'value is invalid');
            });

            test('Recursive substitution is allowed', () => {
                const vars = parseEnvFile(
                    '\
REPO=/home/user/git/foobar \n\
PYTHONPATH=${REPO}/foo \n\
PYTHONPATH=${PYTHONPATH}:${REPO}/bar \n\
                ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(2, 'Incorrect number of variables');
                expect(vars).to.have.property('REPO', '/home/user/git/foobar', 'value is invalid');
                expect(vars).to.have.property(
                    'PYTHONPATH',
                    '/home/user/git/foobar/foo:/home/user/git/foobar/bar',
                    'value is invalid',
                );
            });

            test('"$" may be escaped', () => {
                const vars = parseEnvFile(
                    '\
SPAM=1234 \n\
EGGS=\\${SPAM}/foo:\\${SPAM}/bar \n\
HAM=$ ... $$ \n\
FOO=foo\\$bar \n\
                ',
                );

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(4, 'Incorrect number of variables');
                expect(vars).to.have.property('SPAM', '1234', 'value is invalid');
                expect(vars).to.have.property('EGGS', '${SPAM}/foo:${SPAM}/bar', 'value is invalid');
                expect(vars).to.have.property('HAM', '$ ... $$', 'value is invalid');
                expect(vars).to.have.property('FOO', 'foo$bar', 'value is invalid');
            });

            test('base substitution variables', () => {
                const vars = parseEnvFile('\
PYTHONPATH=${REPO}/foo:${REPO}/bar \n\
                ', {
                    REPO: '/home/user/git/foobar',
                });

                expect(vars).to.not.equal(undefined, 'Variables is undefiend');
                expect(Object.keys(vars!)).lengthOf(1, 'Incorrect number of variables');
                expect(vars).to.have.property(
                    'PYTHONPATH',
                    '/home/user/git/foobar/foo:/home/user/git/foobar/bar',
                    'value is invalid',
                );
            });
        });
    });
});
