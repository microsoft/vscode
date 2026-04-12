/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { promiseWithResolvers } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import * as languages from '../../../../common/languages.js';
import { ParameterHintsModel } from '../../browser/parameterHintsModel.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };
const emptySigHelp = {
    signatures: [{
            label: 'none',
            parameters: []
        }],
    activeParameter: 0,
    activeSignature: 0
};
const emptySigHelpResult = {
    value: emptySigHelp,
    dispose: () => { }
};
suite('ParameterHintsModel', () => {
    const disposables = new DisposableStore();
    let registry;
    setup(() => {
        disposables.clear();
        registry = new LanguageFeatureRegistry();
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function createMockEditor(fileContents) {
        const textModel = disposables.add(createTextModel(fileContents, undefined, undefined, mockFile));
        const editor = disposables.add(createTestCodeEditor(textModel, {
            serviceCollection: new ServiceCollection([ITelemetryService, NullTelemetryService], [IStorageService, disposables.add(new InMemoryStorageService())])
        }));
        return editor;
    }
    function getNextHint(model) {
        return new Promise(resolve => {
            const sub = disposables.add(model.onChangedHints(e => {
                sub.dispose();
                return resolve(e ? { value: e, dispose: () => { } } : undefined);
            }));
        });
    }
    test('Provider should get trigger character on type', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const triggerChar = '(';
        const editor = createMockEditor('');
        disposables.add(new ParameterHintsModel(editor, registry));
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                assert.strictEqual(context.triggerCharacter, triggerChar);
                done();
                return undefined;
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
            await donePromise;
        });
    });
    test('Provider should be retriggered if already active', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const triggerChar = '(';
        const editor = createMockEditor('');
        disposables.add(new ParameterHintsModel(editor, registry));
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                ++invokeCount;
                try {
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerChar);
                        assert.strictEqual(context.isRetrigger, false);
                        assert.strictEqual(context.activeSignatureHelp, undefined);
                        // Retrigger
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar }), 0);
                    }
                    else {
                        assert.strictEqual(invokeCount, 2);
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.isRetrigger, true);
                        assert.strictEqual(context.triggerCharacter, triggerChar);
                        assert.strictEqual(context.activeSignatureHelp, emptySigHelp);
                        done();
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
            await donePromise;
        });
    });
    test('Provider should not be retriggered if previous help is canceled first', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const triggerChar = '(';
        const editor = createMockEditor('');
        const hintModel = disposables.add(new ParameterHintsModel(editor, registry));
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerChar);
                        assert.strictEqual(context.isRetrigger, false);
                        assert.strictEqual(context.activeSignatureHelp, undefined);
                        // Cancel and retrigger
                        hintModel.cancel();
                        editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
                    }
                    else {
                        assert.strictEqual(invokeCount, 2);
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerChar);
                        assert.strictEqual(context.isRetrigger, true);
                        assert.strictEqual(context.activeSignatureHelp, undefined);
                        done();
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
            return donePromise;
        });
    });
    test('Provider should get last trigger character when triggered multiple times and only be invoked once', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const editor = createMockEditor('');
        disposables.add(new ParameterHintsModel(editor, registry, 5));
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = ['a', 'b', 'c'];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                    assert.strictEqual(context.isRetrigger, false);
                    assert.strictEqual(context.triggerCharacter, 'c');
                    // Give some time to allow for later triggers
                    setTimeout(() => {
                        assert.strictEqual(invokeCount, 1);
                        done();
                    }, 50);
                    return undefined;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'a' });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'b' });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'c' });
            await donePromise;
        });
    });
    test('Provider should be retriggered if already active', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const editor = createMockEditor('');
        disposables.add(new ParameterHintsModel(editor, registry, 5));
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = ['a', 'b'];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, 'a');
                        // retrigger after delay for widget to show up
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'b' }), 50);
                    }
                    else if (invokeCount === 2) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.ok(context.isRetrigger);
                        assert.strictEqual(context.triggerCharacter, 'b');
                        done();
                    }
                    else {
                        assert.fail('Unexpected invoke');
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'a' });
            return donePromise;
        });
    });
    test('Should cancel existing request when new request comes in', async () => {
        const editor = createMockEditor('abc def');
        const hintsModel = disposables.add(new ParameterHintsModel(editor, registry));
        let didRequestCancellationOf = -1;
        let invokeCount = 0;
        const longRunningProvider = new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, token) {
                try {
                    const count = invokeCount++;
                    disposables.add(token.onCancellationRequested(() => { didRequestCancellationOf = count; }));
                    // retrigger on first request
                    if (count === 0) {
                        hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
                    }
                    return new Promise(resolve => {
                        setTimeout(() => {
                            resolve({
                                value: {
                                    signatures: [{
                                            label: '' + count,
                                            parameters: []
                                        }],
                                    activeParameter: 0,
                                    activeSignature: 0
                                },
                                dispose: () => { }
                            });
                        }, 100);
                    });
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        };
        disposables.add(registry.register(mockFileSelector, longRunningProvider));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
            assert.strictEqual(-1, didRequestCancellationOf);
            return new Promise((resolve, reject) => disposables.add(hintsModel.onChangedHints(newParamterHints => {
                try {
                    assert.strictEqual(0, didRequestCancellationOf);
                    assert.strictEqual('1', newParamterHints.signatures[0].label);
                    resolve();
                }
                catch (e) {
                    reject(e);
                }
            })));
        });
    });
    test('Provider should be retriggered by retrigger character', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const triggerChar = 'a';
        const retriggerChar = 'b';
        const editor = createMockEditor('');
        disposables.add(new ParameterHintsModel(editor, registry, 5));
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [retriggerChar];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerChar);
                        // retrigger after delay for widget to show up
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: retriggerChar }), 50);
                    }
                    else if (invokeCount === 2) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.ok(context.isRetrigger);
                        assert.strictEqual(context.triggerCharacter, retriggerChar);
                        done();
                    }
                    else {
                        assert.fail('Unexpected invoke');
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            // This should not trigger anything
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: retriggerChar });
            // But a trigger character should
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
            return donePromise;
        });
    });
    test('should use first result from multiple providers', async () => {
        const triggerChar = 'a';
        const firstProviderId = 'firstProvider';
        const secondProviderId = 'secondProvider';
        const paramterLabel = 'parameter';
        const editor = createMockEditor('');
        const model = disposables.add(new ParameterHintsModel(editor, registry, 5));
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [];
            }
            async provideSignatureHelp(_model, _position, _token, context) {
                try {
                    if (!context.isRetrigger) {
                        // retrigger after delay for widget to show up
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar }), 50);
                        return {
                            value: {
                                activeParameter: 0,
                                activeSignature: 0,
                                signatures: [{
                                        label: firstProviderId,
                                        parameters: [
                                            { label: paramterLabel }
                                        ]
                                    }]
                            },
                            dispose: () => { }
                        };
                    }
                    return undefined;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerChar];
                this.signatureHelpRetriggerCharacters = [];
            }
            async provideSignatureHelp(_model, _position, _token, context) {
                if (context.isRetrigger) {
                    return {
                        value: {
                            activeParameter: 0,
                            activeSignature: context.activeSignatureHelp ? context.activeSignatureHelp.activeSignature + 1 : 0,
                            signatures: [{
                                    label: secondProviderId,
                                    parameters: context.activeSignatureHelp ? context.activeSignatureHelp.signatures[0].parameters : []
                                }]
                        },
                        dispose: () => { }
                    };
                }
                return undefined;
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerChar });
            const firstHint = (await getNextHint(model)).value;
            assert.strictEqual(firstHint.signatures[0].label, firstProviderId);
            assert.strictEqual(firstHint.activeSignature, 0);
            assert.strictEqual(firstHint.signatures[0].parameters[0].label, paramterLabel);
            const secondHint = (await getNextHint(model)).value;
            assert.strictEqual(secondHint.signatures[0].label, secondProviderId);
            assert.strictEqual(secondHint.activeSignature, 1);
            assert.strictEqual(secondHint.signatures[0].parameters[0].label, paramterLabel);
        });
    });
    test('Quick typing should use the first trigger character', async () => {
        const editor = createMockEditor('');
        const model = disposables.add(new ParameterHintsModel(editor, registry, 50));
        const triggerCharacter = 'a';
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerCharacter];
                this.signatureHelpRetriggerCharacters = [];
            }
            provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerCharacter);
                    }
                    else {
                        assert.fail('Unexpected invoke');
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerCharacter });
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: 'x' });
            await getNextHint(model);
        });
    });
    test('Retrigger while a pending resolve is still going on should preserve last active signature #96702', async () => {
        const { promise: donePromise, resolve: done } = promiseWithResolvers();
        const editor = createMockEditor('');
        const model = disposables.add(new ParameterHintsModel(editor, registry, 50));
        const triggerCharacter = 'a';
        const retriggerCharacter = 'b';
        let invokeCount = 0;
        disposables.add(registry.register(mockFileSelector, new class {
            constructor() {
                this.signatureHelpTriggerCharacters = [triggerCharacter];
                this.signatureHelpRetriggerCharacters = [retriggerCharacter];
            }
            async provideSignatureHelp(_model, _position, _token, context) {
                try {
                    ++invokeCount;
                    if (invokeCount === 1) {
                        assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
                        assert.strictEqual(context.triggerCharacter, triggerCharacter);
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: retriggerCharacter }), 50);
                    }
                    else if (invokeCount === 2) {
                        // Trigger again while we wait for resolve to take place
                        setTimeout(() => editor.trigger('keyboard', "type" /* Handler.Type */, { text: retriggerCharacter }), 50);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    else if (invokeCount === 3) {
                        // Make sure that in a retrigger during a pending resolve, we still have the old active signature.
                        assert.strictEqual(context.activeSignatureHelp, emptySigHelp);
                        done();
                    }
                    else {
                        assert.fail('Unexpected invoke');
                    }
                    return emptySigHelpResult;
                }
                catch (err) {
                    console.error(err);
                    done(err);
                    throw err;
                }
            }
        }));
        await runWithFakedTimers({ useFakeTimers: true }, async () => {
            editor.trigger('keyboard', "type" /* Handler.Type */, { text: triggerCharacter });
            await getNextHint(model);
            await getNextHint(model);
            await donePromise;
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyYW1ldGVySGludHNNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvcGFyYW1ldGVySGludHMvdGVzdC9icm93c2VyL3BhcmFtZXRlckhpbnRzTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUduRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4RixPQUFPLEtBQUssU0FBUyxNQUFNLGlDQUFpQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbEcsTUFBTSxR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