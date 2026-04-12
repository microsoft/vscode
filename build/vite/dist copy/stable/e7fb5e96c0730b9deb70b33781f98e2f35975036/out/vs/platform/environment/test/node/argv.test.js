/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatOptions, parseArgs } from '../../node/argv.js';
import { addArg } from '../../node/argvHelper.js';
function o(description, type = 'string') {
    return {
        description, type
    };
}
function c(description, options) {
    return {
        description, type: 'subcommand', options
    };
}
suite('formatOptions', () => {
    test('Text should display small columns correctly', () => {
        assert.deepStrictEqual(formatOptions({
            'add': o('bar')
        }, 80), ['  --add        bar']);
        assert.deepStrictEqual(formatOptions({
            'add': o('bar'),
            'wait': o('ba'),
            'trace': o('b')
        }, 80), [
            '  --add        bar',
            '  --wait       ba',
            '  --trace      b'
        ]);
    });
    test('Text should wrap', () => {
        assert.deepStrictEqual(formatOptions({
            // eslint-disable-next-line local/code-no-any-casts
            'add': o('bar '.repeat(9))
        }, 40), [
            '  --add        bar bar bar bar bar bar',
            '               bar bar bar'
        ]);
    });
    test('Text should revert to the condensed view when the terminal is too narrow', () => {
        assert.deepStrictEqual(formatOptions({
            // eslint-disable-next-line local/code-no-any-casts
            'add': o('bar '.repeat(9))
        }, 30), [
            '  --add',
            '      bar bar bar bar bar bar bar bar bar '
        ]);
    });
    test('addArg', () => {
        assert.deepStrictEqual(addArg([], 'foo'), ['foo']);
        assert.deepStrictEqual(addArg([], 'foo', 'bar'), ['foo', 'bar']);
        assert.deepStrictEqual(addArg(['foo'], 'bar'), ['foo', 'bar']);
        assert.deepStrictEqual(addArg(['--wait'], 'bar'), ['--wait', 'bar']);
        assert.deepStrictEqual(addArg(['--wait', '--', '--foo'], 'bar'), ['--wait', 'bar', '--', '--foo']);
        assert.deepStrictEqual(addArg(['--', '--foo'], 'bar'), ['bar', '--', '--foo']);
    });
    test('subcommands', () => {
        assert.deepStrictEqual(formatOptions({
            'testcmd': c('A test command', { add: o('A test command option') })
        }, 30), [
            '  --testcmd',
            '      A test command'
        ]);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
suite('parseArgs', () => {
    function newErrorReporter(result = [], command = '') {
        const commandPrefix = command ? command + '-' : '';
        return {
            onDeprecatedOption: (deprecatedId) => result.push(`${commandPrefix}onDeprecatedOption ${deprecatedId}`),
            onUnknownOption: (id) => result.push(`${commandPrefix}onUnknownOption ${id}`),
            onEmptyValue: (id) => result.push(`${commandPrefix}onEmptyValue ${id}`),
            onMultipleValues: (id, usedValue) => result.push(`${commandPrefix}onMultipleValues ${id} ${usedValue}`),
            getSubcommandReporter: (c) => newErrorReporter(result, commandPrefix + c),
            result
        };
    }
    function assertParse(options, input, expected, expectedErrors) {
        const errorReporter = newErrorReporter();
        assert.deepStrictEqual(parseArgs(input, options, errorReporter), expected);
        assert.deepStrictEqual(errorReporter.result, expectedErrors);
    }
    test('subcommands', () => {
        const options1 = {
            'testcmd': c('A test command', {
                testArg: o('A test command option'),
                _: { type: 'string[]' }
            }),
            _: { type: 'string[]' }
        };
        assertParse(options1, ['testcmd', '--testArg=foo'], { testcmd: { testArg: 'foo', '_': [] }, '_': [] }, []);
        assertParse(options1, ['testcmd', '--testArg=foo', '--testX'], { testcmd: { testArg: 'foo', '_': [] }, '_': [] }, ['testcmd-onUnknownOption testX']);
        assertParse(options1, ['--testArg=foo', 'testcmd', '--testX'], { testcmd: { testArg: 'foo', '_': [] }, '_': [] }, ['testcmd-onUnknownOption testX']);
        assertParse(options1, ['--testArg=foo', 'testcmd'], { testcmd: { testArg: 'foo', '_': [] }, '_': [] }, []);
        assertParse(options1, ['--testArg', 'foo', 'testcmd'], { testcmd: { testArg: 'foo', '_': [] }, '_': [] }, []);
        const options2 = {
            'testcmd': c('A test command', {
                testArg: o('A test command option')
            }),
            testX: { type: 'boolean', global: true, description: '' },
            _: { type: 'string[]' }
        };
        assertParse(options2, ['testcmd', '--testArg=foo', '--testX'], { testcmd: { testArg: 'foo', testX: true, '_': [] }, '_': [] }, []);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJndi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZW52aXJvbm1lbnQvdGVzdC9ub2RlL2FyZ3YudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBMEMsU0FBUyxFQUFpQixNQUFNLG9CQUFvQixDQUFDO0FBQ3JILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVsRCxTQUFTLENBQUMsQ0FBQyxXQUFtQixFQUFFLE9BQTBDLFFBQVE7SUFDakYsT0FBTztRQUNOLFdBQVcsRUFBRSxJQUFJO0tBQ2pCLENBQUM7QUFDSCxDQUFDO0FBQ0QsU0FBUyxDQUFDLENBQUMsV0FBbUIsRUFBRSxPQUFnQztJQUMvRCxPQUFPO1FBQ04sV0FBVyxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsT0FBTztLQUN4QyxDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO0lBRTNCLElBQUksQ0FBQyw2Q0FBNkMsRUFBRSxHQUFHLEVBQUU7UUFDeEQsTUFBTSxDQUFDLGVBQWUsQ0FDckIsYUFBYSxDQUFDO1lBQ2IsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUM7U0FDZixFQUFFLEVBQUUsQ0FBQyxFQUNOLENBQUMsb0JBQW9CLENBQUMsQ0FDdEIsQ0FBQztRQUNGLE1BQU0sQ0FBQyxlQUFlLENBQ3JCLGFBQWEsQ0FBQztZQUNiLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ2YsTUFBTSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDZixPQUFPLEVBQUUsQ0FBQyxDQUFDLEdBQUcs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