/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as uuid from '../../../../../base/common/uuid.js';
import { OS } from '../../../../../base/common/platform.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsEditorModel } from '../../browser/keybindingsEditorModel.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('KeybindingsEditorModel', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let testObject;
    let extensions = [];
    setup(() => {
        extensions = [];
        instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IKeybindingService, {});
        instantiationService.stub(IExtensionService, {
            whenInstalledExtensionsRegistered: () => Promise.resolve(true),
            get extensions() { return extensions; }
        });
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OS));
        disposables.add(CommandsRegistry.registerCommand('command_without_keybinding', () => { }));
    });
    test('fetch returns default keybindings', async () => {
        const expected = prepareKeybindingService(aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }));
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns distinct keybindings', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = prepareKeybindingService(aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ } }));
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, [expected[0]]);
    });
    test('fetch returns default keybindings at the top', async () => {
        const expected = prepareKeybindingService(aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }));
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch('').slice(0, 2), true);
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns default keybindings sorted by command id', async () => {
        const keybindings = prepareKeybindingService(aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 1 /* KeyCode.Backspace */ } }));
        const expected = [keybindings[2], keybindings[0], keybindings[1]];
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns user keybinding first if default and user has same id', async () => {
        const sameId = 'b' + uuid.generateUuid();
        const keybindings = prepareKeybindingService(aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ }, isDefault: false }));
        const expected = [keybindings[1], keybindings[0]];
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns keybinding with titles first', async () => {
        const keybindings = prepareKeybindingService(aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'd' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }));
        registerCommandWithTitle(keybindings[1].command, 'B Title');
        registerCommandWithTitle(keybindings[3].command, 'A Title');
        const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];
        instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindings);
        instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindings);
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns keybinding with user first if title and id matches', async () => {
        const sameId = 'b' + uuid.generateUuid();
        const keybindings = prepareKeybindingService(aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, isDefault: false }));
        registerCommandWithTitle(keybindings[1].command, 'Same Title');
        const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch(''));
        assertKeybindingItems(actuals, expected);
    });
    test('fetch returns default keybindings sorted by precedence', async () => {
        const expected = prepareKeybindingService(aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, secondChord: { keyCode: 9 /* KeyCode.Escape */ } }), aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 1 /* KeyCode.Backspace */ } }));
        await testObject.resolve(new Map());
        const actuals = asResolvedKeybindingItems(testObject.fetch('', true));
        assertKeybindingItems(actuals, expected);
    });
    test('convert keybinding without title to entry', async () => {
        const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2' });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('')[0];
        assert.strictEqual(actual.keybindingItem.command, expected.command);
        assert.strictEqual(actual.keybindingItem.commandLabel, '');
        assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
        assert.strictEqual(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding.getAriaLabel());
        assert.strictEqual(actual.keybindingItem.when, expected.when.serialize());
    });
    test('convert keybinding with title to entry', async () => {
        const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2' });
        prepareKeybindingService(expected);
        registerCommandWithTitle(expected.command, 'Some Title');
        await testObject.resolve(new Map());
        const actual = testObject.fetch('')[0];
        assert.strictEqual(actual.keybindingItem.command, expected.command);
        assert.strictEqual(actual.keybindingItem.commandLabel, 'Some Title');
        assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
        assert.strictEqual(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding.getAriaLabel());
        assert.strictEqual(actual.keybindingItem.when, expected.when.serialize());
    });
    test('convert without title and binding to entry', async () => {
        disposables.add(CommandsRegistry.registerCommand('command_without_keybinding', () => { }));
        prepareKeybindingService();
        await testObject.resolve(new Map());
        const actual = testObject.fetch('').filter(element => element.keybindingItem.command === 'command_without_keybinding')[0];
        assert.strictEqual(actual.keybindingItem.command, 'command_without_keybinding');
        assert.strictEqual(actual.keybindingItem.commandLabel, '');
        assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
        assert.strictEqual(actual.keybindingItem.keybinding, undefined);
        assert.strictEqual(actual.keybindingItem.when, '');
    });
    test('convert with title and without binding to entry', async () => {
        const id = 'a' + uuid.generateUuid();
        registerCommandWithTitle(id, 'some title');
        prepareKeybindingService();
        await testObject.resolve(new Map());
        const actual = testObject.fetch('').filter(element => element.keybindingItem.command === id)[0];
        assert.strictEqual(actual.keybindingItem.command, id);
        assert.strictEqual(actual.keybindingItem.commandLabel, 'some title');
        assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
        assert.strictEqual(actual.keybindingItem.keybinding, undefined);
        assert.strictEqual(actual.keybindingItem.when, '');
    });
    test('filter by command id', async () => {
        const id = 'workbench.action.view.size.' + uuid.generateUuid();
        registerCommandWithTitle(id, 'some title');
        prepareKeybindingService();
        await testObject.resolve(new Map());
        const actual = testObject.fetch('workbench action view size').filter(element => element.keybindingItem.command === id)[0];
        assert.ok(actual);
    });
    test('filter by command title', async () => {
        const id = 'a' + uuid.generateUuid();
        registerCommandWithTitle(id, 'Increase view size');
        prepareKeybindingService();
        await testObject.resolve(new Map());
        const actual = testObject.fetch('increase size').filter(element => element.keybindingItem.command === id)[0];
        assert.ok(actual);
    });
    test('filter by system source', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2' });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('system').filter(element => element.keybindingItem.command === command)[0];
        assert.ok(actual);
    });
    test('filter by user source', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2', isDefault: false });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('user').filter(element => element.keybindingItem.command === command)[0];
        assert.ok(actual);
    });
    test('filter by default source with "@source: " prefix', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2', isDefault: true });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('@source: default').filter(element => element.keybindingItem.command === command)[0];
        assert.ok(actual);
    });
    test('filter by user source with "@source: " prefix', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2', isDefault: false });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('@source: user').filter(element => element.keybindingItem.command === command)[0];
        assert.ok(actual);
    });
    test('filter by command prefix with different commands', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2', isDefault: true });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: uuid.generateUuid(), firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: true }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch(`@command:${command}`);
        assert.strictEqual(actual.length, 1);
        assert.deepStrictEqual(actual[0].keybindingItem.command, command);
    });
    test('filter by command prefix with same commands', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'context1 && context2', isDefault: true });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: true }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch(`@command:${command}`);
        assert.strictEqual(actual.length, 2);
        assert.deepStrictEqual(actual[0].keybindingItem.command, command);
        assert.deepStrictEqual(actual[1].keybindingItem.command, command);
    });
    test('filter by when context', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('when context').filter(element => element.keybindingItem.command === command)[0];
        assert.ok(actual);
    });
    test('filter by cmd key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected);
        await testObject.resolve(new Map());
        const actual = testObject.fetch('cmd').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by meta key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('meta').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by command key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('command').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by windows key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 1 /* OperatingSystem.Windows */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('windows').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by alt key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('alt').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { altKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by option key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('option').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { altKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by ctrl key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('ctrl').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by control key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('control').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by shift key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('shift').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by arrow', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 17 /* KeyCode.RightArrow */, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('arrow').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by modifier and key', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 17 /* KeyCode.RightArrow */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 17 /* KeyCode.RightArrow */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('alt right').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { altKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by key and modifier', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 17 /* KeyCode.RightArrow */, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 17 /* KeyCode.RightArrow */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('right alt').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(0, actual.length);
    });
    test('filter by modifiers and key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('alt cmd esc').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { altKey: true, metaKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by modifiers in random order and key', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by first part', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 20 /* KeyCode.Delete */ }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter matches in chord part', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 20 /* KeyCode.Delete */ }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('cmd del').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, { keyCode: true });
    });
    test('filter matches first part and in chord part', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 20 /* KeyCode.Delete */ }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 16 /* KeyCode.UpArrow */ }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('cmd shift esc del').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, { keyCode: true });
    });
    test('filter exact matches', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"ctrl c"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter exact matches with first and chord part', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"shift meta escape ctrl c"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, { ctrlKey: true, keyCode: true });
    });
    test('filter exact matches with first and chord part no results', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 20 /* KeyCode.Delete */, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 16 /* KeyCode.UpArrow */ }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"cmd shift esc del"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(0, actual.length);
    });
    test('filter matches with + separator', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"control+c"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter by keybinding prefix', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('@keybinding:control+c').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter matches with + separator in first and chord parts', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"shift+meta+escape ctrl+c"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, { keyCode: true, ctrlKey: true });
    });
    test('filter by keybinding prefix with chord', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('@keybinding:"shift+meta+escape ctrl+c"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, { keyCode: true, ctrlKey: true });
    });
    test('filter exact matches with space #32993', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 10 /* KeyCode.Space */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 1 /* KeyCode.Backspace */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"ctrl+space"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
    });
    test('filter exact matches with user settings label', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 18 /* KeyCode.DownArrow */ } });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'down', firstChord: { keyCode: 9 /* KeyCode.Escape */ } }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"down"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { keyCode: true });
    });
    test('filter exact matches also return chords', async () => {
        const command = 'a' + uuid.generateUuid();
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 41 /* KeyCode.KeyK */, modifiers: { ctrlKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: 33 /* KeyCode.KeyC */, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('"control+k"').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
        assert.deepStrictEqual(actual[0].keybindingMatches.chordPart, {});
    });
    test('filter modifiers are not matched when not completely matched (prefix)', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const term = `alt.${uuid.generateUuid()}`;
        const command = `command.${term}`;
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch(term);
        assert.strictEqual(1, actual.length);
        assert.strictEqual(command, actual[0].keybindingItem.command);
        assert.strictEqual(1, actual[0].commandIdMatches?.length);
    });
    test('filter modifiers are not matched when not completely matched (includes)', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const term = `abcaltdef.${uuid.generateUuid()}`;
        const command = `command.${term}`;
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */ }, isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch(term);
        assert.strictEqual(1, actual.length);
        assert.strictEqual(command, actual[0].keybindingItem.command);
        assert.strictEqual(1, actual[0].commandIdMatches?.length);
    });
    test('filter modifiers are matched with complete term', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command = `command.${uuid.generateUuid()}`;
        const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, isDefault: false });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: 9 /* KeyCode.Escape */ }, isDefault: false }));
        await testObject.resolve(new Map());
        const actual = testObject.fetch('alt').filter(element => element.keybindingItem.command === command);
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingMatches.firstPart, { altKey: true });
    });
    test('filter by extension', async () => {
        testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, 2 /* OperatingSystem.Macintosh */));
        const command1 = `command.${uuid.generateUuid()}`;
        const command2 = `command.${uuid.generateUuid()}`;
        extensions.push({ identifier: new ExtensionIdentifier('foo'), displayName: 'foo bar' }, { identifier: new ExtensionIdentifier('bar'), displayName: 'bar foo' });
        disposables.add(MenuRegistry.addCommand({ id: command2, title: 'title', category: 'category', source: { id: extensions[1].identifier.value, title: extensions[1].displayName } }));
        const expected = aResolvedKeybindingItem({ command: command1, firstChord: { keyCode: 9 /* KeyCode.Escape */, modifiers: { altKey: true } }, isDefault: true, extensionId: extensions[0].identifier.value });
        prepareKeybindingService(expected, aResolvedKeybindingItem({ command: command2, isDefault: true }));
        await testObject.resolve(new Map());
        let actual = testObject.fetch('@ext:foo');
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingItem.command, command1);
        actual = testObject.fetch('@ext:"bar foo"');
        assert.strictEqual(1, actual.length);
        assert.deepStrictEqual(actual[0].keybindingItem.command, command2);
    });
    function prepareKeybindingService(...keybindingItems) {
        instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindingItems);
        instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindingItems);
        return keybindingItems;
    }
    function registerCommandWithTitle(command, title) {
        disposables.add(registerAction2(class extends Action2 {
            constructor() {
                super({
                    id: command,
                    title: { value: title, original: title },
                    f1: true
                });
            }
            async run() { }
        }));
    }
    function assertKeybindingItems(actual, expected) {
        assert.strictEqual(actual.length, expected.length);
        for (let i = 0; i < actual.length; i++) {
            assertKeybindingItem(actual[i], expected[i]);
        }
    }
    function assertKeybindingItem(actual, expected) {
        assert.strictEqual(actual.command, expected.command);
        if (actual.when) {
            assert.ok(!!expected.when);
            assert.strictEqual(actual.when.serialize(), expected.when.serialize());
        }
        else {
            assert.ok(!expected.when);
        }
        assert.strictEqual(actual.isDefault, expected.isDefault);
        if (actual.resolvedKeybinding) {
            assert.ok(!!expected.resolvedKeybinding);
            assert.strictEqual(actual.resolvedKeybinding.getLabel(), expected.resolvedKeybinding.getLabel());
        }
        else {
            assert.ok(!expected.resolvedKeybinding);
        }
    }
    function aResolvedKeybindingItem({ command, when, isDefault, firstChord, secondChord, extensionId }) {
        const aSimpleKeybinding = function (chord) {
            const { ctrlKey, shiftKey, altKey, metaKey } = chord.modifiers || { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
            return new KeyCodeChord(ctrlKey, shiftKey, altKey, metaKey, chord.keyCode);
        };
        const chords = [];
        if (firstChord) {
            chords.push(aSimpleKeybinding(firstChord));
            if (secondChord) {
                chords.push(aSimpleKeybinding(secondChord));
            }
        }
        const keybinding = chords.length > 0 ? new USLayoutResolvedKeybinding(chords, OS) : undefined;
        return new ResolvedKeybindingItem(keybinding, command || 'some command', null, when ? ContextKeyExpr.deserialize(when) : undefined, isDefault === undefined ? true : isDefault, extensionId ?? null, false);
    }
    function asResolvedKeybindingItems(keybindingEntries, keepUnassigned = false) {
        if (!keepUnassigned) {
            keybindingEntries = keybindingEntries.filter(keybindingEntry => !!keybindingEntry.keybindingItem.keybinding);
        }
        return keybindingEntries.map(entry => entry.keybindingItem.keybindingItem);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFZGl0b3JNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ByZWZlcmVuY2VzL3Rlc3QvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvck1vZGVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxJQUFJLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEVBQUUsRUFBbUIsTUFBTSx3Q0FBd0MsQ0FBQztBQUU3RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBRXJILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBRXpILE9BQU8sRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSx5REFBeUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMs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