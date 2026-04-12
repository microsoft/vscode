/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { decodeKeybinding, createSimpleKeybinding } from '../../../../base/common/keybindings.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ContextKeyExpr } from '../../../contextkey/common/contextkey.js';
import { KeybindingResolver } from '../../common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../common/usLayoutResolvedKeybinding.js';
import { createUSLayoutResolvedKeybinding } from './keybindingsTestUtils.js';
function createContext(ctx) {
    return {
        getValue: (key) => {
            return ctx[key];
        }
    };
}
suite('KeybindingResolver', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function kbItem(keybinding, command, commandArgs, when, isDefault) {
        const resolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
        return new ResolvedKeybindingItem(resolvedKeybinding, command, commandArgs, when, isDefault, null, false);
    }
    function getDispatchStr(chord) {
        return USLayoutResolvedKeybinding.getDispatchStr(chord);
    }
    test('resolve key', () => {
        const keybinding = 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 56 /* KeyCode.KeyZ */;
        const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
        const contextRules = ContextKeyExpr.equals('bar', 'baz');
        const keybindingItem = kbItem(keybinding, 'yes', null, contextRules, true);
        assert.strictEqual(contextRules.evaluate(createContext({ bar: 'baz' })), true);
        assert.strictEqual(contextRules.evaluate(createContext({ bar: 'bz' })), false);
        const resolver = new KeybindingResolver([keybindingItem], [], () => { });
        const r1 = resolver.resolve(createContext({ bar: 'baz' }), [], getDispatchStr(runtimeKeybinding));
        assert.ok(r1.kind === 2 /* ResultKind.KbFound */);
        assert.strictEqual(r1.commandId, 'yes');
        const r2 = resolver.resolve(createContext({ bar: 'bz' }), [], getDispatchStr(runtimeKeybinding));
        assert.strictEqual(r2.kind, 0 /* ResultKind.NoMatchingKb */);
    });
    test('resolve key with arguments', () => {
        const commandArgs = { text: 'no' };
        const keybinding = 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 56 /* KeyCode.KeyZ */;
        const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
        const contextRules = ContextKeyExpr.equals('bar', 'baz');
        const keybindingItem = kbItem(keybinding, 'yes', commandArgs, contextRules, true);
        const resolver = new KeybindingResolver([keybindingItem], [], () => { });
        const r = resolver.resolve(createContext({ bar: 'baz' }), [], getDispatchStr(runtimeKeybinding));
        assert.ok(r.kind === 2 /* ResultKind.KbFound */);
        assert.strictEqual(r.commandArgs, commandArgs);
    });
    suite('handle keybinding removals', () => {
        test('simple 1', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true)
            ];
            const overrides = [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), false),
            ]);
        });
        test('simple 2', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(33 /* KeyCode.KeyC */, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true),
                kbItem(33 /* KeyCode.KeyC */, 'yes3', null, ContextKeyExpr.equals('3', 'c'), false),
            ]);
        });
        test('removal with not matching when', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-yes1', null, ContextKeyExpr.equals('1', 'b'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('removal with not matching keybinding', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(32 /* KeyCode.KeyB */, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('removal with matching keybinding and when', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('removal with unspecified keybinding', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(0, '-yes1', null, ContextKeyExpr.equals('1', 'a'), false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('removal with unspecified when', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-yes1', null, undefined, false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('removal with unspecified when and unspecified keybinding', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(0, '-yes1', null, undefined, false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('issue #138997 - removal in default list', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'yes1', null, undefined, true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, undefined, true),
                kbItem(0, '-yes1', null, undefined, false)
            ];
            const overrides = [];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, undefined, true)
            ]);
        });
        test('issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, '^yes1', null, ContextKeyExpr.equals('1', 'a'), true),
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-yes1', null, undefined, false)
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(32 /* KeyCode.KeyB */, 'yes2', null, ContextKeyExpr.equals('2', 'b'), true)
            ]);
        });
        test('issue #140884 Unable to reassign F1 as keybinding for Show All Commands', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, undefined, true),
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-command1', null, undefined, false),
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, undefined, false),
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, undefined, false)
            ]);
        });
        test('issue #141638: Keyboard Shortcuts: Change When Expression might actually remove keybinding in Insiders', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, undefined, true),
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, ContextKeyExpr.equals('a', '1'), false),
                kbItem(31 /* KeyCode.KeyA */, '-command1', null, undefined, false),
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, ContextKeyExpr.equals('a', '1'), false)
            ]);
        });
        test('issue #157751: Auto-quoting of context keys prevents removal of keybindings via UI', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != workbench.editor.notebook && editorLangId in julia.supportedLanguageIds`), true),
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-command1', null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != 'workbench.editor.notebook' && editorLangId in 'julia.supportedLanguageIds'`), false),
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, []);
        });
        test('issue #160604: Remove keybindings with when clause does not work', () => {
            const defaults = [
                kbItem(31 /* KeyCode.KeyA */, 'command1', null, undefined, true),
            ];
            const overrides = [
                kbItem(31 /* KeyCode.KeyA */, '-command1', null, ContextKeyExpr.true(), false),
            ];
            const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
            assert.deepStrictEqual(actual, []);
        });
        test('contextIsEntirelyIncluded', () => {
            const toContextKeyExpression = (expr) => {
                if (typeof expr === 'string' || !expr) {
                    return ContextKeyExpr.deserialize(expr);
                }
                return expr;
            };
            const assertIsIncluded = (a, b) => {
                assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), true);
            };
            const assertIsNotIncluded = (a, b) => {
                assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), false);
            };
            assertIsIncluded(null, null);
            assertIsIncluded(null, ContextKeyExpr.true());
            assertIsIncluded(ContextKeyExpr.true(), null);
            assertIsIncluded(ContextKeyExpr.true(), ContextKeyExpr.true());
            assertIsIncluded('key1', null);
            assertIsIncluded('key1', '');
            assertIsIncluded('key1', 'key1');
            assertIsIncluded('key1', ContextKeyExpr.true());
            assertIsIncluded('!key1', '');
            assertIsIncluded('!key1', '!key1');
            assertIsIncluded('key2', '');
            assertIsIncluded('key2', 'key2');
            assertIsIncluded('key1 && key1 && key2 && key2', 'key2');
            assertIsIncluded('key1 && key2', 'key2');
            assertIsIncluded('key1 && key2', 'key1');
            assertIsIncluded('key1 && key2', '');
            assertIsIncluded('key1', 'key1 || key2');
            assertIsIncluded('key1 || !key1', 'key2 || !key2');
            assertIsIncluded('key1', 'key1 || key2 && key3');
            assertIsNotIncluded('key1', '!key1');
            assertIsNotIncluded('!key1', 'key1');
            assertIsNotIncluded('key1 && key2', 'key3');
            assertIsNotIncluded('key1 && key2', 'key4');
            assertIsNotIncluded('key1', 'key2');
            assertIsNotIncluded('key1 || key2', 'key2');
            assertIsNotIncluded('', 'key2');
            assertIsNotIncluded(null, 'key2');
        });
    });
    suite('resolve command', () => {
        function _kbItem(keybinding, command, when) {
            return kbItem(keybinding, command, null, when, true);
        }
        const items = [
            // This one will never match because its "when" is always overwritten by another one
            _kbItem(54 /* KeyCode.KeyX */, 'first', ContextKeyExpr.and(ContextKeyExpr.equals('key1', true), ContextKeyExpr.notEquals('key2', false))),
            // This one always overwrites first
            _kbItem(54 /* KeyCode.KeyX */, 'second', ContextKeyExpr.equals('key2', true)),
            // This one is a secondary mapping for `second`
            _kbItem(56 /* KeyCode.KeyZ */, 'second', undefined),
            // This one sometimes overwrites first
            _kbItem(54 /* KeyCode.KeyX */, 'third', ContextKeyExpr.equals('key3', true)),
            // This one is always overwritten by another one
            _kbItem(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 'fourth', ContextKeyExpr.equals('key4', true)),
            // This one overwrites with a chord the previous one
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 56 /* KeyCode.KeyZ */), 'fifth', undefined),
            // This one has no keybinding
            _kbItem(0, 'sixth', undefined),
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 51 /* KeyCode.KeyU */), 'seventh', undefined),
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */), 'seventh', undefined),
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 51 /* KeyCode.KeyU */), 'uncomment lines', undefined),
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */), // cmd+k cmd+c
            'comment lines', undefined),
            _kbItem(KeyChord(2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */), // cmd+g cmd+c
            'unreachablechord', undefined),
            _kbItem(2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, // cmd+g
            'eleven', undefined),
            _kbItem([2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 31 /* KeyCode.KeyA */, 32 /* KeyCode.KeyB */], // cmd+k a b
            'long multi chord', undefined),
            _kbItem([2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */], // cmd+b cmd+c
            'shadowed by long-multi-chord-2', undefined),
            _kbItem([2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */, 39 /* KeyCode.KeyI */], // cmd+b cmd+c i
            'long-multi-chord-2', undefined)
        ];
        const resolver = new KeybindingResolver(items, [], () => { });
        const testKbLookupByCommand = (commandId, expectedKeys) => {
            // Test lookup
            const lookupResult = resolver.lookupKeybindings(commandId);
            assert.strictEqual(lookupResult.length, expectedKeys.length, 'Length mismatch @ commandId ' + commandId);
            for (let i = 0, len = lookupResult.length; i < len; i++) {
                const expected = createUSLayoutResolvedKeybinding(expectedKeys[i], OS);
                assert.strictEqual(lookupResult[i].resolvedKeybinding.getUserSettingsLabel(), expected.getUserSettingsLabel(), 'value mismatch @ commandId ' + commandId);
            }
        };
        const testResolve = (ctx, _expectedKey, commandId) => {
            const expectedKeybinding = decodeKeybinding(_expectedKey, OS);
            const previousChord = [];
            for (let i = 0, len = expectedKeybinding.chords.length; i < len; i++) {
                const chord = getDispatchStr(expectedKeybinding.chords[i]);
                const result = resolver.resolve(ctx, previousChord, chord);
                if (i === len - 1) {
                    // if it's the final chord, then we should find a valid command,
                    // and there should not be a chord.
                    assert.ok(result.kind === 2 /* ResultKind.KbFound */, `Enters multi chord for ${commandId} at chord ${i}`);
                    assert.strictEqual(result.commandId, commandId, `Enters multi chord for ${commandId} at chord ${i}`);
                }
                else if (i > 0) {
                    // if this is an intermediate chord, we should not find a valid command,
                    // and there should be an open chord we continue.
                    assert.ok(result.kind === 1 /* ResultKind.MoreChordsNeeded */, `Continues multi chord for ${commandId} at chord ${i}`);
                }
                else {
                    // if it's not the final chord and not an intermediate, then we should not
                    // find a valid command, and we should enter a chord.
                    assert.ok(result.kind === 1 /* ResultKind.MoreChordsNeeded */, `Enters multi chord for ${commandId} at chord ${i}`);
                }
                previousChord.push(chord);
            }
        };
        test('resolve command - 1', () => {
            testKbLookupByCommand('first', []);
        });
        test('resolve command - 2', () => {
            testKbLookupByCommand('second', [56 /* KeyCode.KeyZ */, 54 /* KeyCode.KeyX */]);
            testResolve(createContext({ key2: true }), 54 /* KeyCode.KeyX */, 'second');
            testResolve(createContext({}), 56 /* KeyCode.KeyZ */, 'second');
        });
        test('resolve command - 3', () => {
            testKbLookupByCommand('third', [54 /* KeyCode.KeyX */]);
            testResolve(createContext({ key3: true }), 54 /* KeyCode.KeyX */, 'third');
        });
        test('resolve command - 4', () => {
            testKbLookupByCommand('fourth', []);
        });
        test('resolve command - 5', () => {
            testKbLookupByCommand('fifth', [KeyChord(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 56 /* KeyCode.KeyZ */)]);
            testResolve(createContext({}), KeyChord(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 56 /* KeyCode.KeyZ */), 'fifth');
        });
        test('resolve command - 6', () => {
            testKbLookupByCommand('seventh', [KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */)]);
            testResolve(createContext({}), KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */), 'seventh');
        });
        test('resolve command - 7', () => {
            testKbLookupByCommand('uncomment lines', [KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 51 /* KeyCode.KeyU */)]);
            testResolve(createContext({}), KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 51 /* KeyCode.KeyU */), 'uncomment lines');
        });
        test('resolve command - 8', () => {
            testKbLookupByCommand('comment lines', [KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */)]);
            testResolve(createContext({}), KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */), 'comment lines');
        });
        test('resolve command - 9', () => {
            testKbLookupByCommand('unreachablechord', []);
        });
        test('resolve command - 10', () => {
            testKbLookupByCommand('eleven', [2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */]);
            testResolve(createContext({}), 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, 'eleven');
        });
        test('resolve command - 11', () => {
            testKbLookupByCommand('sixth', []);
        });
        test('resolve command - 12', () => {
            testKbLookupByCommand('long multi chord', [[2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 31 /* KeyCode.KeyA */, 32 /* KeyCode.KeyB */]]);
            testResolve(createContext({}), [2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 31 /* KeyCode.KeyA */, 32 /* KeyCode.KeyB */], 'long multi chord');
        });
        const emptyContext = createContext({});
        test('KBs having common prefix - the one defined later is returned', () => {
            testResolve(emptyContext, [2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */, 39 /* KeyCode.KeyI */], 'long-multi-chord-2');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ1Jlc29sdmVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQWdCLE1BQU0sd0NBQXdDLENBQUM7QUFDaEgsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBa0MsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxRyxPQUFPLEVBQUUsa0JBQWtCLEVBQWMsTUFBTSxvQ0FBb0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUU3RSxTQUFTLGFBQWEsQ0FBQyxHQUFRO0lBQzlCLE9BQU87UUFDTixRQUFRLEVBQUUsQ0FBQyxHQUFXLEVBQUUsRUFBRTtZQUN6QixPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQixDQUFDO0tBQ0QsQ0FBQztBQUNILENBQUM7QUFFRCxLQUFLLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO0lBRWhDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxNQUFNLENBQUMsVUFBNkIsRUFBRSxPQUFlLEVBQUUsV0FBZ0IsRUFBRSxJQUFzQyxFQUFFLFNBQWtCO1FBQzNJLE1BQU0sa0JBQWtCLEdBQUcsZ0NBQWdDLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sSUFBSSxzQkFBc0IsQ0FDaEMsa0JBQWtCLEVBQ2xCLE9BQU8sRUFDUCxXQUFXLEVBQ1gsSUFBSSxFQUNKLFNBQVMsRUFDVCxJQUFJLEVBQ0osS0FBSyxDQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQsU0FBUyxjQUFjLENBQUMsS0FBbUI7UUFDMUMsT0FBTywwQkFBMEIsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFFLENBQUM7SUFDMUQsQ0FBQztJQUVELElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBQ3hCLE1BQU0sVUFBVSxHQUFHLG1EQUE2Qix3QkFBZSxDQUFDO1FBQ2hFLE1BQU0saUJBQWlCLEdBQUcsc0JBQXNCLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sWUFBWSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFM0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFL0UsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV6RSxNQUFNLEVBQUUsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQ2xHLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksK0JBQXVCLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEMsTUFBTSxFQUFFLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNqRyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLGtDQUEwQixDQUFDO0lBQ3RELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtRQUN2QyxNQUFNLFdBQVcsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQztRQUNuQyxNQUFNLFVBQVUsR0FBRyxtREFBNkIsd0JBQWUsQ0FBQztRQUNoRSxNQUFNLGlCQUFpQixHQUFHLHNCQUFzQixDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqRSxNQUFNLFlBQVksR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRWxGLE1BQU0sUUFBUSxHQUFHLElBQUksa0JBQWtCLENBQUMsQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFekUsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUNqRyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLCtCQUF1QixDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtRQUV4QyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtZQUNyQixNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUc7Z0JBQ2pCLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUM7YUFDMUUsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDOUIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQztnQkFDekUsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQzthQUMxRSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO1lBQ3JCLE1BQU0sUUFBUSxHQUFHO2dCQUNoQixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUN6RSxNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ3pFLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRztnQkFDakIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQzthQUMxRSxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO2dCQUM5QixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUN6RSxNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUN6RSxNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQzFFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtZQUMzQyxNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQztnQkFDekUsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUc7Z0JBQ2pCLE1BQU0sd0JBQWUsT0FBTyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUM7YUFDM0UsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDOUIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQztnQkFDekUsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxRQUFRLEdBQUc7Z0JBQ2hCLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7Z0JBQ3pFLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDekUsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHO2dCQUNqQixNQUFNLHdCQUFlLE9BQU8sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQzNFLENBQUM7WUFDRixNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUU7Z0JBQzlCLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7Z0JBQ3pFLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDekUsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1lBQ3RELE1BQU0sUUFBUSxHQUFHO2dCQUNoQixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUN6RSxNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ3pFLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRztnQkFDakIsTUFBTSx3QkFBZSxPQUFPLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQzthQUMzRSxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO2dCQUM5QixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ3pFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtZQUNoRCxNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQztnQkFDekUsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUc7Z0JBQ2pCLE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUM7YUFDaEUsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDOUIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDMUMsTUFBTSxRQUFRLEdBQUc7Z0JBQ2hCLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7Z0JBQ3pFLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDekUsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHO2dCQUNqQixNQUFNLHdCQUFlLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQzthQUNyRCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO2dCQUM5QixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ3pFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEdBQUcsRUFBRTtZQUNyRSxNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQztnQkFDekUsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUc7Z0JBQ2pCLE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO2FBQzFDLENBQUM7WUFDRixNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUU7Z0JBQzlCLE1BQU0sd0JBQWUsTUFBTSxFQUFFLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDekUsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1lBQ3BELE1BQU0sUUFBUSxHQUFHO2dCQUNoQixNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQztnQkFDbkQsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7Z0JBQ25ELE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO2FBQzFDLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBNkIsRUFBRSxDQUFDO1lBQy9DLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDOUIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7YUFDbkQsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsaUZBQWlGLEVBQUUsR0FBRyxFQUFFO1lBQzVGLE1BQU0sUUFBUSxHQUFHO2dCQUNoQixNQUFNLHdCQUFlLE9BQU8sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUMxRSxNQUFNLHdCQUFlLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDO2FBQ3pFLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRztnQkFDakIsTUFBTSx3QkFBZSxPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUM7YUFDckQsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUM5RSxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDOUIsTUFBTSx3QkFBZSxNQUFNLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQzthQUN6RSxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5RUFBeUUsRUFBRSxHQUFHLEVBQUU7WUFDcEYsTUFBTSxRQUFRLEdBQUc7Z0JBQ2hCLE1BQU0sd0JBQWUsVUFBVSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO2FBQ3ZELENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRztnQkFDakIsTUFBTSx3QkFBZSxXQUFXLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUM7Z0JBQ3pELE1BQU0sd0JBQWUsVUFBVSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO2FBQ3hELENBQUM7WUFDRixNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUU7Z0JBQzlCLE1BQU0sd0JBQWUsVUFBVSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDO2FBQ3hELENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdHQUF3RyxFQUFFLEdBQUcsRUFBRTtZQUNuSCxNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxVQUFVLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7YUFDdkQsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHO2dCQUNqQixNQUFNLHdCQUFlLFVBQVUsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDO2dCQUM5RSxNQUFNLHdCQUFlLFdBQVcsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQzthQUN6RCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFO2dCQUM5QixNQUFNLHdCQUFlLFVBQVUsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDO2FBQzlFLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9GQUFvRixFQUFFLEdBQUcsRUFBRTtZQUMvRixNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxVQUFVLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxXQUFXLENBQUMsNEdBQTRHLENBQUMsRUFBRSxJQUFJLENBQUM7YUFDdEwsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHO2dCQUNqQixNQUFNLHdCQUFlLFdBQVcsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLFdBQVcsQ0FBQyxnSEFBZ0gsQ0FBQyxFQUFFLEtBQUssQ0FBQzthQUM1TCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEdBQUcsRUFBRTtZQUM3RSxNQUFNLFFBQVEsR0FBRztnQkFDaEIsTUFBTSx3QkFBZSxVQUFVLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7YUFDdkQsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHO2dCQUNqQixNQUFNLHdCQUFlLFdBQVcsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssQ0FBQzthQUNyRSxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtZQUN0QyxNQUFNLHNCQUFzQixHQUFHLENBQUMsSUFBMEMsRUFBRSxFQUFFO2dCQUM3RSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUN2QyxPQUFPLGNBQWMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3pDLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDLENBQUM7WUFDRixNQUFNLGdCQUFnQixHQUFHLENBQUMsQ0FBdUMsRUFBRSxDQUF1QyxFQUFFLEVBQUU7Z0JBQzdHLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzSCxDQUFDLENBQUM7WUFDRixNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBdUMsRUFBRSxDQUF1QyxFQUFFLEVBQUU7Z0JBQ2hILE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1SCxDQUFDLENBQUM7WUFFRixnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDN0IsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzlDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM5QyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLEVBQUUsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDL0QsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQy9CLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM3QixnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5QixnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN6RCxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDekMsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3pDLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNyQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDekMsZ0JBQWdCLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ25ELGdCQUFnQixDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBRWpELG1CQUFtQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNyQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDckMsbUJBQW1CLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLG1CQUFtQixDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1QyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEMsbUJBQW1CLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7UUFFN0IsU0FBUyxPQUFPLENBQUMsVUFBNkIsRUFBRSxPQUFlLEVBQUUsSUFBc0M7WUFDdEcsT0FBTyxNQUFNLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRztZQUNiLG9GQUFvRjtZQUNwRixPQUFPLHdCQUVOLE9BQU8sRUFDUCxjQUFjLENBQUMsR0FBRyxDQUNqQixjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFDbkMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQ3ZDLENBQ0Q7WUFDRCxtQ0FBbUM7WUFDbkMsT0FBTyx3QkFFTixRQUFRLEVBQ1IsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQ25DO1lBQ0QsK0NBQStDO1lBQy9DLE9BQU8sd0JBRU4sUUFBUSxFQUNSLFNBQVMsQ0FDVDtZQUNELHNDQUFzQztZQUN0QyxPQUFPLHdCQUVOLE9BQU8sRUFDUCxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FDbkM7WUFDRCxnREFBZ0Q7WUFDaEQsT0FBTyxDQUNOLGlEQUE2QixFQUM3QixRQUFRLEVBQ1IsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQ25DO1lBQ0Qsb0RBQW9EO1lBQ3BELE9BQU8sQ0FDTixRQUFRLENBQUMsaURBQTZCLHdCQUFlLEVBQ3JELE9BQU8sRUFDUCxTQUFTLENBQ1Q7WUFDRCw2QkFBNkI7WUFDN0IsT0FBTyxDQUNOLENBQUMsRUFDRCxPQUFPLEVBQ1AsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLFFBQVEsQ0FBQyxpREFBNkIsRUFBRSxpREFBNkIsQ0FBQyxFQUN0RSxTQUFTLEVBQ1QsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLFFBQVEsQ0FBQyxpREFBNkIsRUFBRSxpREFBNkIsQ0FBQyxFQUN0RSxTQUFTLEVBQ1QsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLFFBQVEsQ0FBQyxpREFBNkIsRUFBRSxpREFBNkIsQ0FBQyxFQUN0RSxpQkFBaUIsRUFDakIsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLFFBQVEsQ0FBQyxpREFBNkIsRUFBRSxpREFBNkIsQ0FBQyxFQUFFLGNBQWM7WUFDdEYsZUFBZSxFQUNmLFNBQVMsQ0FDVDtZQUNELE9BQU8sQ0FDTixRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsRUFBRSxjQUFjO1lBQ3RGLGtCQUFrQixFQUNsQixTQUFTLENBQ1Q7WUFDRCxPQUFPLENBQ04saURBQTZCLEVBQUUsUUFBUTtZQUN2QyxRQUFRLEVBQ1IsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLENBQUMsaURBQTZCLCtDQUE2QixFQUFFLFlBQVk7WUFDekUsa0JBQWtCLEVBQ2xCLFNBQVMsQ0FDVDtZQUNELE9BQU8sQ0FDTixDQUFDLGlEQUE2QixFQUFFLGlEQUE2QixDQUFDLEVBQUUsY0FBYztZQUM5RSxnQ0FBZ0MsRUFDaEMsU0FBUyxDQUNUO1lBQ0QsT0FBTyxDQUNOLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLHdCQUFlLEVBQUUsZ0JBQWdCO1lBQzlGLG9CQUFvQixFQUNwQixTQUFTLENBQ1Q7U0FDRCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTlELE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxTQUFpQixFQUFFLFlBQW1DLEVBQUUsRUFBRTtZQUN4RixjQUFjO1lBQ2QsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxZQUFZLENBQUMsTUFBTSxFQUFFLDhCQUE4QixHQUFHLFNBQVMsQ0FBQyxDQUFDO1lBQ3pHLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDekQsTUFBTSxRQUFRLEdBQUcsZ0NBQWdDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBRSxDQUFDO2dCQUV4RSxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBbUIsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLDZCQUE2QixHQUFHLFNBQVMsQ0FBQyxDQUFDO1lBQzVKLENBQUM7UUFDRixDQUFDLENBQUM7UUFFRixNQUFNLFdBQVcsR0FBRyxDQUFDLEdBQWEsRUFBRSxZQUErQixFQUFFLFNBQWlCLEVBQUUsRUFBRTtZQUN6RixNQUFNLGtCQUFrQixHQUFHLGdCQUFnQixDQUFDLFlBQVksRUFBRSxFQUFFLENBQUUsQ0FBQztZQUUvRCxNQUFNLGFBQWEsR0FBYSxFQUFFLENBQUM7WUFFbkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUV0RSxNQUFNLEtBQUssR0FBRyxjQUFjLENBQWUsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXpFLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFFM0QsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNuQixnRUFBZ0U7b0JBQ2hFLG1DQUFtQztvQkFDbkMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSwrQkFBdUIsRUFBRSwwQkFBMEIsU0FBUyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ25HLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsMEJBQTBCLFNBQVMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN0RyxDQUFDO3FCQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUNsQix3RUFBd0U7b0JBQ3hFLGlEQUFpRDtvQkFDakQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSx3Q0FBZ0MsRUFBRSw2QkFBNkIsU0FBUyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hILENBQUM7cUJBQU0sQ0FBQztvQkFDUCwwRUFBMEU7b0JBQzFFLHFEQUFxRDtvQkFDckQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSx3Q0FBZ0MsRUFBRSwwQkFBMEIsU0FBUyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzdHLENBQUM7Z0JBQ0QsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMzQixDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtZQUNoQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1lBQ2hDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSw4Q0FBNEIsQ0FBQyxDQUFDO1lBQzlELFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMseUJBQWdCLFFBQVEsQ0FBQyxDQUFDO1lBQ25FLFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLHlCQUFnQixRQUFRLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDaEMscUJBQXFCLENBQUMsT0FBTyxFQUFFLHVCQUFjLENBQUMsQ0FBQztZQUMvQyxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLHlCQUFnQixPQUFPLENBQUMsQ0FBQztRQUNuRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDaEMscUJBQXFCLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtZQUNoQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUMsaURBQTZCLHdCQUFlLENBQUMsQ0FBQyxDQUFDO1lBQ3hGLFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLGlEQUE2Qix3QkFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtZQUNoQyxxQkFBcUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM0csV0FBVyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNuSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDaEMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkgsV0FBVyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtZQUNoQyxxQkFBcUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakgsV0FBVyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUMsaURBQTZCLEVBQUUsaURBQTZCLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN6SCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7WUFDaEMscUJBQXFCLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1lBQ2pDLHFCQUFxQixDQUFDLFFBQVEsRUFBRSxDQUFDLGlEQUE2QixDQUFDLENBQUMsQ0FBQztZQUNqRSxXQUFXLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxFQUFFLGlEQUE2QixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtZQUNqQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1lBQ2pDLHFCQUFxQixDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxpREFBNkIsK0NBQTZCLENBQUMsQ0FBQyxDQUFDO1lBQ3pHLFdBQVcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxpREFBNkIsK0NBQTZCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNqSCxDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUV2QyxJQUFJLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1lBQ3pFLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxpREFBNkIsRUFBRSxpREFBNkIsd0JBQWUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQy9ILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9