/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promiseWithResolvers } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../common/core/position.js';
import { Handler } from '../../../../common/editorCommon.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import * as languages from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { ParameterHintsModel } from '../../browser/parameterHintsModel.js';
import { createTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';

const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };


const emptySigHelp: languages.SignatureHelp = {
	signatures: [{
		label: 'none',
		parameters: []
	}],
	activeParameter: 0,
	activeSignature: 0
};

const emptySigHelpResult: languages.SignatureHelpResult = {
	value: emptySigHelp,
	dispose: () => { }
};

suite('ParameterHintsModel', () => {
	const disposables = new DisposableStore();
	let registry: LanguageFeatureRegistry<languages.SignatureHelpProvider>;

	setup(() => {
		disposables.clear();
		registry = new LanguageFeatureRegistry<languages.SignatureHelpProvider>();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockEditor(fileContents: string) {
		const textModel = disposables.add(createTextModel(fileContents, undefined, undefined, mockFile));
		const editor = disposables.add(createTestCodeEditor(textModel, {
			serviceCollection: new ServiceCollection(
				[ITelemetryService, NullTelemetryService],
				[IStorageService, disposables.add(new InMemoryStorageService())]
			)
		}));
		return editor;
	}

	function getNextHint(model: ParameterHintsModel) {
		return new Promise<languages.SignatureHelpResult | undefined>(resolve => {
			const sub = disposables.add(model.onChangedHints(e => {
				sub.dispose();
				return resolve(e ? { value: e, dispose: () => { } } : undefined);
			}));
		});
	}

	test('Provider should get trigger character on type', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.add(new ParameterHintsModel(editor, registry));

		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext) {
				assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
				assert.strictEqual(context.triggerCharacter, triggerChar);
				done();
				return undefined;
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			editor.trigger('keyboard', Handler.Type, { text: triggerChar });
			await donePromise;
		});
	});

	test('Provider should be retriggered if already active', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.add(new ParameterHintsModel(editor, registry));

		let invokeCount = 0;
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				++invokeCount;
				try {
					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerChar);
						assert.strictEqual(context.isRetrigger, false);
						assert.strictEqual(context.activeSignatureHelp, undefined);

						// Retrigger
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: triggerChar }), 0);
					} else {
						assert.strictEqual(invokeCount, 2);
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.isRetrigger, true);
						assert.strictEqual(context.triggerCharacter, triggerChar);
						assert.strictEqual(context.activeSignatureHelp, emptySigHelp);

						done();
					}
					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			editor.trigger('keyboard', Handler.Type, { text: triggerChar });
			await donePromise;
		});
	});

	test('Provider should not be retriggered if previous help is canceled first', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const triggerChar = '(';

		const editor = createMockEditor('');
		const hintModel = disposables.add(new ParameterHintsModel(editor, registry));

		let invokeCount = 0;
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				try {
					++invokeCount;
					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerChar);
						assert.strictEqual(context.isRetrigger, false);
						assert.strictEqual(context.activeSignatureHelp, undefined);

						// Cancel and retrigger
						hintModel.cancel();
						editor.trigger('keyboard', Handler.Type, { text: triggerChar });
					} else {
						assert.strictEqual(invokeCount, 2);
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerChar);
						assert.strictEqual(context.isRetrigger, true);
						assert.strictEqual(context.activeSignatureHelp, undefined);
						done();
					}
					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, () => {
			editor.trigger('keyboard', Handler.Type, { text: triggerChar });
			return donePromise;
		});
	});

	test('Provider should get last trigger character when triggered multiple times and only be invoked once', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const editor = createMockEditor('');
		disposables.add(new ParameterHintsModel(editor, registry, 5));

		let invokeCount = 0;
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b', 'c'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext) {
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
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			editor.trigger('keyboard', Handler.Type, { text: 'a' });
			editor.trigger('keyboard', Handler.Type, { text: 'b' });
			editor.trigger('keyboard', Handler.Type, { text: 'c' });

			await donePromise;
		});
	});

	test('Provider should be retriggered if already active', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const editor = createMockEditor('');
		disposables.add(new ParameterHintsModel(editor, registry, 5));

		let invokeCount = 0;

		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				try {
					++invokeCount;
					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, 'a');

						// retrigger after delay for widget to show up
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: 'b' }), 50);
					} else if (invokeCount === 2) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.ok(context.isRetrigger);
						assert.strictEqual(context.triggerCharacter, 'b');
						done();
					} else {
						assert.fail('Unexpected invoke');
					}

					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, () => {
			editor.trigger('keyboard', Handler.Type, { text: 'a' });
			return donePromise;
		});
	});

	test('Should cancel existing request when new request comes in', async () => {

		const editor = createMockEditor('abc def');
		const hintsModel = disposables.add(new ParameterHintsModel(editor, registry));

		let didRequestCancellationOf = -1;
		let invokeCount = 0;
		const longRunningProvider = new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [];
			signatureHelpRetriggerCharacters = [];


			provideSignatureHelp(_model: ITextModel, _position: Position, token: CancellationToken): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				try {
					const count = invokeCount++;
					disposables.add(token.onCancellationRequested(() => { didRequestCancellationOf = count; }));

					// retrigger on first request
					if (count === 0) {
						hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
					}

					return new Promise<languages.SignatureHelpResult>(resolve => {
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
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		};

		disposables.add(registry.register(mockFileSelector, longRunningProvider));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {

			hintsModel.trigger({ triggerKind: languages.SignatureHelpTriggerKind.Invoke }, 0);
			assert.strictEqual(-1, didRequestCancellationOf);

			return new Promise<void>((resolve, reject) =>
				disposables.add(hintsModel.onChangedHints(newParamterHints => {
					try {
						assert.strictEqual(0, didRequestCancellationOf);
						assert.strictEqual('1', newParamterHints!.signatures[0].label);
						resolve();
					} catch (e) {
						reject(e);
					}
				})));
		});
	});

	test('Provider should be retriggered by retrigger character', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const triggerChar = 'a';
		const retriggerChar = 'b';

		const editor = createMockEditor('');
		disposables.add(new ParameterHintsModel(editor, registry, 5));

		let invokeCount = 0;
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [retriggerChar];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				try {
					++invokeCount;
					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerChar);

						// retrigger after delay for widget to show up
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: retriggerChar }), 50);
					} else if (invokeCount === 2) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.ok(context.isRetrigger);
						assert.strictEqual(context.triggerCharacter, retriggerChar);
						done();
					} else {
						assert.fail('Unexpected invoke');
					}

					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			// This should not trigger anything
			editor.trigger('keyboard', Handler.Type, { text: retriggerChar });

			// But a trigger character should
			editor.trigger('keyboard', Handler.Type, { text: triggerChar });

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

		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			async provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): Promise<languages.SignatureHelpResult | undefined> {
				try {
					if (!context.isRetrigger) {
						// retrigger after delay for widget to show up
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: triggerChar }), 50);

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
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			async provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): Promise<languages.SignatureHelpResult | undefined> {
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
			editor.trigger('keyboard', Handler.Type, { text: triggerChar });

			const firstHint = (await getNextHint(model))!.value;
			assert.strictEqual(firstHint.signatures[0].label, firstProviderId);
			assert.strictEqual(firstHint.activeSignature, 0);
			assert.strictEqual(firstHint.signatures[0].parameters[0].label, paramterLabel);

			const secondHint = (await getNextHint(model))!.value;
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
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerCharacter];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): languages.SignatureHelpResult | Promise<languages.SignatureHelpResult> {
				try {
					++invokeCount;

					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerCharacter);
					} else {
						assert.fail('Unexpected invoke');
					}

					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			editor.trigger('keyboard', Handler.Type, { text: triggerCharacter });
			editor.trigger('keyboard', Handler.Type, { text: 'x' });

			await getNextHint(model);
		});
	});

	test('Retrigger while a pending resolve is still going on should preserve last active signature #96702', async () => {
		const { promise: donePromise, resolve: done } = promiseWithResolvers<void>();

		const editor = createMockEditor('');
		const model = disposables.add(new ParameterHintsModel(editor, registry, 50));

		const triggerCharacter = 'a';
		const retriggerCharacter = 'b';

		let invokeCount = 0;
		disposables.add(registry.register(mockFileSelector, new class implements languages.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerCharacter];
			signatureHelpRetriggerCharacters = [retriggerCharacter];

			async provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: languages.SignatureHelpContext): Promise<languages.SignatureHelpResult> {
				try {
					++invokeCount;

					if (invokeCount === 1) {
						assert.strictEqual(context.triggerKind, languages.SignatureHelpTriggerKind.TriggerCharacter);
						assert.strictEqual(context.triggerCharacter, triggerCharacter);
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: retriggerCharacter }), 50);
					} else if (invokeCount === 2) {
						// Trigger again while we wait for resolve to take place
						setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: retriggerCharacter }), 50);
						await new Promise(resolve => setTimeout(resolve, 1000));
					} else if (invokeCount === 3) {
						// Make sure that in a retrigger during a pending resolve, we still have the old active signature.
						assert.strictEqual(context.activeSignatureHelp, emptySigHelp);
						done();
					} else {
						assert.fail('Unexpected invoke');
					}

					return emptySigHelpResult;
				} catch (err) {
					console.error(err);
					done(err);
					throw err;
				}
			}
		}));

		await runWithFakedTimers({ useFakeTimers: true }, async () => {

			editor.trigger('keyboard', Handler.Type, { text: triggerCharacter });

			await getNextHint(model);
			await getNextHint(model);

			await donePromise;
		});
	});
});
