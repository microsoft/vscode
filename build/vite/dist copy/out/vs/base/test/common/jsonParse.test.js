/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { parse, stripComments } from '../../common/jsonc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('JSON Parse', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Line comment', () => {
        const content = [
            '{',
            '  "prop": 10 // a comment',
            '}',
        ].join('\n');
        const expected = [
            '{',
            '  "prop": 10 ',
            '}',
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Line comment - EOF', () => {
        const content = [
            '{',
            '}',
            '// a comment'
        ].join('\n');
        const expected = [
            '{',
            '}',
            ''
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Line comment - \\r\\n', () => {
        const content = [
            '{',
            '  "prop": 10 // a comment',
            '}',
        ].join('\r\n');
        const expected = [
            '{',
            '  "prop": 10 ',
            '}',
        ].join('\r\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Line comment - EOF - \\r\\n', () => {
        const content = [
            '{',
            '}',
            '// a comment'
        ].join('\r\n');
        const expected = [
            '{',
            '}',
            ''
        ].join('\r\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Block comment - single line', () => {
        const content = [
            '{',
            '  /* before */"prop": 10/* after */',
            '}',
        ].join('\n');
        const expected = [
            '{',
            '  "prop": 10',
            '}',
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Block comment - multi line', () => {
        const content = [
            '{',
            '  /**',
            '   * Some comment',
            '   */',
            '  "prop": 10',
            '}',
        ].join('\n');
        const expected = [
            '{',
            '  ',
            '  "prop": 10',
            '}',
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Block comment - shortest match', () => {
        const content = '/* abc */ */';
        const expected = ' */';
        assert.strictEqual(stripComments(content), expected);
    });
    test('No strings - double quote', () => {
        const content = [
            '{',
            '  "/* */": 10',
            '}'
        ].join('\n');
        const expected = [
            '{',
            '  "/* */": 10',
            '}'
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('No strings - single quote', () => {
        const content = [
            '{',
            `  '/* */': 10`,
            '}'
        ].join('\n');
        const expected = [
            '{',
            `  '/* */': 10`,
            '}'
        ].join('\n');
        assert.strictEqual(stripComments(content), expected);
    });
    test('Trailing comma in object', () => {
        const content = [
            '{',
            `  "a": 10,`,
            '}'
        ].join('\n');
        const expected = [
            '{',
            `  "a": 10`,
            '}'
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Trailing comma in array', () => {
        const content = [
            `[ "a", "b", "c", ]`
        ].join('\n');
        const expected = [
            `[ "a", "b", "c" ]`
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Trailing comma', () => {
        const content = [
            '{',
            '  "propA": 10, // a comment',
            '  "propB": false, // a trailing comma',
            '}',
        ].join('\n');
        const expected = [
            '{',
            '  "propA": 10,',
            '  "propB": false',
            '}',
        ].join('\n');
        assert.deepEqual(parse(content), JSON.parse(expected));
    });
    test('Trailing comma - EOF', () => {
        const content = `
// This configuration file allows you to pass permanent command line arguments to VS Code.
// Only a subset of arguments is currently supported to reduce the likelihood of breaking
// the installation.
//
// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT
//
// NOTE: Changing this file requires a restart of VS Code.
{
	// Use software rendering instead of hardware accelerated rendering.
	// This can help in cases where you see rendering issues in VS Code.
	// "disable-hardware-acceleration": true,
	// Allows to disable crash reporting.
	// Should restart the app if the value is changed.
	"enable-crash-reporter": true,
	// Unique id used for correlating crash reports sent from this instance.
	// Do not edit this value.
	"crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
	"locale": "en",
	// "log-level": "trace"
}
`;
        assert.deepEqual(parse(content), {
            'enable-crash-reporter': true,
            'crash-reporter-id': 'aaaaab31-7453-4506-97d0-93411b2c21c7',
            'locale': 'en'
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblBhcnNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2pzb25QYXJzZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzdELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUVyRSxLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtJQUN4Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1FBQ3pCLE1BQU0sT0FBTyxHQUFXO1lBQ3ZCLEdBQUc7WUFDSCwyQkFBMkI7WUFDM0IsR0FBRztTQUNILENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2IsTUFBTSxRQUFRLEdBQUc7WUFDaEIsR0FBRztZQUNILGVBQWU7WUFDZixHQUFHO1NBQ0gsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDYixNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDeEQsQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQy9CLE1BQU0sT0FBTyxHQUFXO1lBQ3ZCLEdBQUc7WUFDSCxHQUFHO1lBQ0gsY0FBYztTQUNkLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2IsTUFBTSxRQUFRLEdBQUc7WUFDaEIsR0FBRztZQUNILEdBQUc7WUFDSCxFQUFFO1NBQ0YsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENB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