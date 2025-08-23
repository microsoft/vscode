// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TestFilter } from '../../common/types';
import { getPositionalArguments, filterArguments } from '../common/argumentsHelper';

const OptionsWithArguments = [
    '-c',
    '-k',
    '-m',
    '-o',
    '-p',
    '-r',
    '-W',
    '-n', // -n is a pytest-xdist option
    '--assert',
    '--basetemp',
    '--cache-show',
    '--capture',
    '--code-highlight',
    '--color',
    '--confcutdir',
    '--cov',
    '--cov-config',
    '--cov-fail-under',
    '--cov-report',
    '--deselect',
    '--dist',
    '--doctest-glob',
    '--doctest-report',
    '--durations',
    '--durations-min',
    '--ignore',
    '--ignore-glob',
    '--import-mode',
    '--junit-prefix',
    '--junit-xml',
    '--last-failed-no-failures',
    '--lfnf',
    '--log-auto-indent',
    '--log-cli-date-format',
    '--log-cli-format',
    '--log-cli-level',
    '--log-date-format',
    '--log-file',
    '--log-file-date-format',
    '--log-file-format',
    '--log-file-level',
    '--log-format',
    '--log-level',
    '--maxfail',
    '--override-ini',
    '--pastebin',
    '--pdbcls',
    '--pythonwarnings',
    '--result-log',
    '--rootdir',
    '--show-capture',
    '--tb',
    '--verbosity',
    '--max-slave-restart',
    '--numprocesses',
    '--rsyncdir',
    '--rsyncignore',
    '--tx',
];

const OptionsWithoutArguments = [
    '--cache-clear',
    '--collect-in-virtualenv',
    '--collect-only',
    '--co',
    '--continue-on-collection-errors',
    '--cov-append',
    '--cov-branch',
    '--debug',
    '--disable-pytest-warnings',
    '--disable-warnings',
    '--doctest-continue-on-failure',
    '--doctest-ignore-import-errors',
    '--doctest-modules',
    '--exitfirst',
    '--failed-first',
    '--ff',
    '--fixtures',
    '--fixtures-per-test',
    '--force-sugar',
    '--full-trace',
    '--funcargs',
    '--help',
    '--keep-duplicates',
    '--last-failed',
    '--lf',
    '--markers',
    '--new-first',
    '--nf',
    '--no-cov',
    '--no-cov-on-fail',
    '--no-header',
    '--no-print-logs',
    '--no-summary',
    '--noconftest',
    '--old-summary',
    '--pdb',
    '--pyargs',
    '-PyTest, Unittest-pyargs',
    '--quiet',
    '--runxfail',
    '--setup-only',
    '--setup-plan',
    '--setup-show',
    '--showlocals',
    '--stepwise',
    '--sw',
    '--stepwise-skip',
    '--strict',
    '--strict-config',
    '--strict-markers',
    '--trace-config',
    '--verbose',
    '--version',
    '-V',
    '-h',
    '-l',
    '-q',
    '-s',
    '-v',
    '-x',
    '--boxed',
    '--forked',
    '--looponfail',
    '--trace',
    '--tx',
    '-d',
];

export function removePositionalFoldersAndFiles(args: string[]): string[] {
    return pytestFilterArguments(args, TestFilter.removeTests);
}

function pytestFilterArguments(args: string[], argumentToRemoveOrFilter: string[] | TestFilter): string[] {
    const optionsWithoutArgsToRemove: string[] = [];
    const optionsWithArgsToRemove: string[] = [];
    // Positional arguments in pytest are test directories and files.
    // So if we want to run a specific test, then remove positional args.
    let removePositionalArgs = false;
    if (Array.isArray(argumentToRemoveOrFilter)) {
        argumentToRemoveOrFilter.forEach((item) => {
            if (OptionsWithArguments.indexOf(item) >= 0) {
                optionsWithArgsToRemove.push(item);
            }
            if (OptionsWithoutArguments.indexOf(item) >= 0) {
                optionsWithoutArgsToRemove.push(item);
            }
        });
    } else {
        switch (argumentToRemoveOrFilter) {
            case TestFilter.removeTests: {
                optionsWithoutArgsToRemove.push(
                    ...['--lf', '--last-failed', '--ff', '--failed-first', '--nf', '--new-first'],
                );
                optionsWithArgsToRemove.push(...['-k', '-m', '--lfnf', '--last-failed-no-failures']);
                removePositionalArgs = true;
                break;
            }
            case TestFilter.discovery: {
                optionsWithoutArgsToRemove.push(
                    ...[
                        '-x',
                        '--exitfirst',
                        '--fixtures',
                        '--funcargs',
                        '--fixtures-per-test',
                        '--pdb',
                        '--lf',
                        '--last-failed',
                        '--ff',
                        '--failed-first',
                        '--nf',
                        '--new-first',
                        '--cache-show',
                        '-v',
                        '--verbose',
                        '-q',
                        '-quiet',
                        '-l',
                        '--showlocals',
                        '--no-print-logs',
                        '--debug',
                        '--setup-only',
                        '--setup-show',
                        '--setup-plan',
                        '--trace',
                    ],
                );
                optionsWithArgsToRemove.push(
                    ...[
                        '-m',
                        '--maxfail',
                        '--pdbcls',
                        '--capture',
                        '--lfnf',
                        '--last-failed-no-failures',
                        '--verbosity',
                        '-r',
                        '--tb',
                        '--show-capture',
                        '--durations',
                        '--junit-xml',
                        '--junit-prefix',
                        '--result-log',
                        '-W',
                        '--pythonwarnings',
                        '--log-*',
                    ],
                );
                removePositionalArgs = true;
                break;
            }
            case TestFilter.debugAll:
            case TestFilter.runAll: {
                optionsWithoutArgsToRemove.push(...['--collect-only', '--trace']);
                break;
            }
            case TestFilter.debugSpecific:
            case TestFilter.runSpecific: {
                optionsWithoutArgsToRemove.push(
                    ...[
                        '--collect-only',
                        '--lf',
                        '--last-failed',
                        '--ff',
                        '--failed-first',
                        '--nf',
                        '--new-first',
                        '--trace',
                    ],
                );
                optionsWithArgsToRemove.push(...['-k', '-m', '--lfnf', '--last-failed-no-failures']);
                removePositionalArgs = true;
                break;
            }
            default: {
                throw new Error(`Unsupported Filter '${argumentToRemoveOrFilter}'`);
            }
        }
    }

    let filteredArgs = args.slice();
    if (removePositionalArgs) {
        const positionalArgs = getPositionalArguments(filteredArgs, OptionsWithArguments, OptionsWithoutArguments);
        filteredArgs = filteredArgs.filter((item) => positionalArgs.indexOf(item) === -1);
    }
    return filterArguments(filteredArgs, optionsWithArgsToRemove, optionsWithoutArgsToRemove);
}
