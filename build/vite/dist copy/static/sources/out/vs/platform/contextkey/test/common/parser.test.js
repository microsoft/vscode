/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Parser } from '../../common/contextkey.js';
function parseToStr(input) {
    const parser = new Parser();
    const prints = [];
    const print = (...ss) => { ss.forEach(s => prints.push(s)); };
    const expr = parser.parse(input);
    if (expr === undefined) {
        if (parser.lexingErrors.length > 0) {
            print('Lexing errors:', '\n\n');
            parser.lexingErrors.forEach(lexingError => print(`Unexpected token '${lexingError.lexeme}' at offset ${lexingError.offset}. ${lexingError.additionalInfo}`, '\n'));
        }
        if (parser.parsingErrors.length > 0) {
            if (parser.lexingErrors.length > 0) {
                print('\n --- \n');
            }
            print('Parsing errors:', '\n\n');
            parser.parsingErrors.forEach(parsingError => print(`Unexpected '${parsingError.lexeme}' at offset ${parsingError.offset}.`, '\n'));
        }
    }
    else {
        print(expr.serialize());
    }
    return prints.join('');
}
suite('Context Key Parser', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test(' foo', () => {
        const input = ' foo';
        assert.deepStrictEqual(parseToStr(input), 'foo');
    });
    test('!foo', () => {
        const input = '!foo';
        assert.deepStrictEqual(parseToStr(input), '!foo');
    });
    test('foo =~ /bar/', () => {
        const input = 'foo =~ /bar/';
        assert.deepStrictEqual(parseToStr(input), 'foo =~ /bar/');
    });
    test(`foo || (foo =~ /bar/ && baz)`, () => {
        const input = `foo || (foo =~ /bar/ && baz)`;
        assert.deepStrictEqual(parseToStr(input), 'foo || baz && foo =~ /bar/');
    });
    test('foo || (foo =~ /bar/ || baz)', () => {
        const input = 'foo || (foo =~ /bar/ || baz)';
        assert.deepStrictEqual(parseToStr(input), 'baz || foo || foo =~ /bar/');
    });
    test(`(foo || bar) && (jee || jar)`, () => {
        const input = `(foo || bar) && (jee || jar)`;
        assert.deepStrictEqual(parseToStr(input), 'bar && jar || bar && jee || foo && jar || foo && jee');
    });
    test('foo && foo =~ /zee/i', () => {
        const input = 'foo && foo =~ /zee/i';
        assert.deepStrictEqual(parseToStr(input), 'foo && foo =~ /zee/i');
    });
    test('foo.bar==enabled', () => {
        const input = 'foo.bar==enabled';
        assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
    });
    test(`foo.bar == 'enabled'`, () => {
        const input = `foo.bar == 'enabled'`;
        assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
    });
    test('foo.bar:zed==completed - equality with no space', () => {
        const input = 'foo.bar:zed==completed';
        assert.deepStrictEqual(parseToStr(input), `foo.bar:zed == 'completed'`);
    });
    test('a && b || c', () => {
        const input = 'a && b || c';
        assert.deepStrictEqual(parseToStr(input), 'c || a && b');
    });
    test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
        const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
        assert.deepStrictEqual(parseToStr(input), 'baz.jar && fee.bee<K-loo+1> && fooBar');
    });
    test('foo.barBaz<C-r> < 2', () => {
        const input = 'foo.barBaz<C-r> < 2';
        assert.deepStrictEqual(parseToStr(input), `foo.barBaz<C-r> < 2`);
    });
    test('foo.bar >= -1', () => {
        const input = 'foo.bar >= -1';
        assert.deepStrictEqual(parseToStr(input), 'foo.bar >= -1');
    });
    test(`key contains &nbsp: view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`, () => {
        const input = `view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`;
        assert.deepStrictEqual(parseToStr(input), `vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders'`);
    });
    test('foo.bar <= -1', () => {
        const input = 'foo.bar <= -1';
        assert.deepStrictEqual(parseToStr(input), `foo.bar <= -1`);
    });
    test('!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet', () => {
        const input = '!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet';
        assert.deepStrictEqual(parseToStr(input), 'cmake:enableFullFeatureSet && !cmake:hideBuildCommand');
    });
    test('!(foo && bar)', () => {
        const input = '!(foo && bar)';
        assert.deepStrictEqual(parseToStr(input), '!bar || !foo');
    });
    test('!(foo && bar || boar) || deer', () => {
        const input = '!(foo && bar || boar) || deer';
        assert.deepStrictEqual(parseToStr(input), 'deer || !bar && !boar || !boar && !foo');
    });
    test(`!(!foo)`, () => {
        const input = `!(!foo)`;
        assert.deepStrictEqual(parseToStr(input), 'foo');
    });
    suite('controversial', () => {
        /*
            new parser KEEPS old one's behavior:

            old parser output: { key: 'debugState', op: '==', value: '"stopped"' }
            new parser output: { key: 'debugState', op: '==', value: '"stopped"' }

            TODO@ulugbekna: we should consider breaking old parser's behavior, and not take double quotes as part of the `value` because that's not what user expects.
        */
        test(`debugState == "stopped"`, () => {
            const input = `debugState == "stopped"`;
            assert.deepStrictEqual(parseToStr(input), `debugState == '"stopped"'`);
        });
        /*
            new parser BREAKS old one's behavior:

            old parser output: { key: 'viewItem', op: '==', value: 'VSCode WorkSpace' }
            new parser output: { key: 'viewItem', op: '==', value: 'VSCode' }

            TODO@ulugbekna: since this's breaking, we can have hacky code that tries detecting such cases and replicate old parser's behavior.
        */
        test(` viewItem == VSCode WorkSpace`, () => {
            const input = ` viewItem == VSCode WorkSpace`;
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected 'WorkSpace' at offset 20.\n`);
        });
    });
    suite('regex', () => {
        test(`resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`, () => {
            const input = `resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`;
            assert.deepStrictEqual(parseToStr(input), 'resource =~ /\\/foo\\/(barr|door\\/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(\\/.*)*$/');
        });
        test(`resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`, () => {
            const input = `resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`;
            assert.deepStrictEqual(parseToStr(input), 'resource =~ /((\\/scratch\\/(?!update)(.*)\\/)|((\\/src\\/).*\\/)).*$/');
        });
        test(`resourcePath =~ /\.md(\.yml|\.txt)*$/giym`, () => {
            const input = `resourcePath =~ /\.md(\.yml|\.txt)*$/giym`;
            assert.deepStrictEqual(parseToStr(input), 'resourcePath =~ /.md(.yml|.txt)*$/im');
        });
    });
    suite('error handling', () => {
        test(`/foo`, () => {
            const input = `/foo`;
            assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token '/foo' at offset 0. Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.\n\n --- \nParsing errors:\n\nUnexpected '/foo' at offset 0.\n`);
        });
        test(`!b == 'true'`, () => {
            const input = `!b == 'true'`;
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '==' at offset 3.\n`);
        });
        test('!foo &&  in bar', () => {
            const input = '!foo &&  in bar';
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected 'in' at offset 9.\n`);
        });
        test('vim<c-r> == 1 && vim<2<=3', () => {
            const input = 'vim<c-r> == 1 && vim<2<=3';
            assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token '=' at offset 23. Did you mean == or =~?\n\n --- \nParsing errors:\n\nUnexpected '=' at offset 23.\n`); // FIXME
        });
        test(`foo && 'bar`, () => {
            const input = `foo && 'bar`;
            assert.deepStrictEqual(parseToStr(input), `Lexing errors:\n\nUnexpected token ''bar' at offset 7. Did you forget to open or close the quote?\n\n --- \nParsing errors:\n\nUnexpected ''bar' at offset 7.\n`);
        });
        test(`config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`, () => {
            const input = `config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`;
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '&&' at offset 15.\n`);
        });
        test(`!foo == 'test'`, () => {
            const input = `!foo == 'test'`;
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '==' at offset 5.\n`);
        });
        test(`!!foo`, function () {
            const input = `!!foo`;
            assert.deepStrictEqual(parseToStr(input), `Parsing errors:\n\nUnexpected '!' at offset 1.\n`);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9jb250ZXh0a2V5L3Rlc3QvY29tbW9uL3BhcnNlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFcEQsU0FBUyxVQUFVLENBQUMsS0FBYTtJQUNoQyxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO0lBRTVCLE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztJQUU1QixNQUFNLEtBQUssR0FBRyxDQUFDLEdBQUcsRUFBWSxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXhFLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakMsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDeEIsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEMsTUFBTSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMscUJBQXFCLFdBQVcsQ0FBQyxNQUFNLGVBQWUsV0FBVyxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsY0FBYyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMs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