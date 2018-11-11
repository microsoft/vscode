/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Handler } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as modes from 'vs/editor/common/modes';
import { createTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService, NullStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ParameterHintsModel } from '../parameterHintsWidget';

const mockFile = URI.parse('test:somefile.ttt');
const mockFileSelector = { scheme: 'test' };


const emptySigHelpResult = {
	signatures: [{
		label: 'none',
		parameters: []
	}],
	activeParameter: 0,
	activeSignature: 0
};
suite('ParameterHintsModel', () => {
	let disposables: IDisposable[] = [];

	setup(function () {
		disposables = dispose(disposables);
	});

	function createMockEditor(fileContents: string) {
		const textModel = TextModel.createFromString(fileContents, undefined, undefined, mockFile);
		const editor = createTestCodeEditor({
			model: textModel,
			serviceCollection: new ServiceCollection(
				[ITelemetryService, NullTelemetryService],
				[IStorageService, NullStorageService]
			)
		});
		disposables.push(textModel);
		disposables.push(editor);
		return editor;
	}

	test('Provider should get trigger character on type', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor));

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
				assert.strictEqual(context.triggerCharacter, triggerChar);
				done();
				return undefined;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should be retriggered if already active', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					// Retrigger
					editor.trigger('keyboard', Handler.Type, { text: triggerChar });
				} else {
					assert.strictEqual(invokeCount, 2);
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.ok(context.isRetrigger);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					done();
				}
				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should not be retriggered if previous help is canceled first', (done) => {
		const triggerChar = '(';

		const editor = createMockEditor('');
		const hintModel = new ParameterHintsModel(editor);
		disposables.push(hintModel);

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);

					// Cancel and retrigger
					hintModel.cancel();
					editor.trigger('keyboard', Handler.Type, { text: triggerChar });
				} else {
					assert.strictEqual(invokeCount, 2);
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);
					done();
				}
				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});

	test('Provider should get last trigger character when triggered multiple times and only be invoked once', (done) => {
		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b', 'c'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				++invokeCount;
				assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
				assert.ok(context.isRetrigger);
				assert.strictEqual(context.triggerCharacter, 'c');

				// Give some time to allow for later triggers
				setTimeout(() => {
					assert.strictEqual(invokeCount, 1);

					done();
				}, 50);
				return undefined;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: 'a' });
		editor.trigger('keyboard', Handler.Type, { text: 'b' });
		editor.trigger('keyboard', Handler.Type, { text: 'c' });
	});

	test('Provider should be retriggered if already active', (done) => {
		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = ['a', 'b'];
			signatureHelpRetriggerCharacters = [];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, 'a');

					// retrigger after delay for widget to show up
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: 'b' }), 50);
				} else if (invokeCount === 2) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.ok(context.isRetrigger);
					assert.strictEqual(context.triggerCharacter, 'b');
					done();
				} else {
					assert.fail('Unexpected invoke');
				}

				return emptySigHelpResult;
			}
		}));

		editor.trigger('keyboard', Handler.Type, { text: 'a' });
	});

	test('Should cancel existing request when new request comes in', () => {
		const editor = createMockEditor('abc def');
		const hintsModel = new ParameterHintsModel(editor);

		let didRequestCancellationOf = -1;
		let invokeCount = 0;
		const longRunningProvider = new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [];
			signatureHelpRetriggerCharacters = [];


			provideSignatureHelp(_model: ITextModel, _position: Position, token: CancellationToken): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				const count = invokeCount++;
				token.onCancellationRequested(() => { didRequestCancellationOf = count; });

				// retrigger on first request
				if (count === 0) {
					hintsModel.trigger({ triggerReason: modes.SignatureHelpTriggerReason.Invoke }, 0);
				}

				return new Promise<modes.SignatureHelp>(resolve => {
					setTimeout(() => {
						resolve({
							signatures: [{
								label: '' + count,
								parameters: []
							}],
							activeParameter: 0,
							activeSignature: 0
						});
					}, 100);
				});
			}
		};

		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, longRunningProvider));

		hintsModel.trigger({ triggerReason: modes.SignatureHelpTriggerReason.Invoke }, 0);
		assert.strictEqual(-1, didRequestCancellationOf);

		return new Promise((resolve, reject) =>
			hintsModel.onHint(e => {
				try {
					assert.strictEqual(0, didRequestCancellationOf);
					assert.strictEqual('1', e.hints.signatures[0].label);
					resolve();
				} catch (e) {
					reject(e);
				}
			}));
	});

	test('Provider should be retriggered by retrigger character', (done) => {
		const triggerChar = 'a';
		const retriggerChar = 'b';

		const editor = createMockEditor('');
		disposables.push(new ParameterHintsModel(editor, 5));

		let invokeCount = 0;
		disposables.push(modes.SignatureHelpProviderRegistry.register(mockFileSelector, new class implements modes.SignatureHelpProvider {
			signatureHelpTriggerCharacters = [triggerChar];
			signatureHelpRetriggerCharacters = [retriggerChar];

			provideSignatureHelp(_model: ITextModel, _position: Position, _token: CancellationToken, context: modes.SignatureHelpContext): modes.SignatureHelp | Thenable<modes.SignatureHelp> {
				++invokeCount;
				if (invokeCount === 1) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.strictEqual(context.triggerCharacter, triggerChar);

					// retrigger after delay for widget to show up
					setTimeout(() => editor.trigger('keyboard', Handler.Type, { text: retriggerChar }), 50);
				} else if (invokeCount === 2) {
					assert.strictEqual(context.triggerReason, modes.SignatureHelpTriggerReason.TriggerCharacter);
					assert.ok(context.isRetrigger);
					assert.strictEqual(context.triggerCharacter, retriggerChar);
					done();
				} else {
					assert.fail('Unexpected invoke');
				}

				return emptySigHelpResult;
			}
		}));

		// This should not trigger anything
		editor.trigger('keyboard', Handler.Type, { text: retriggerChar });

		// But a trigger character should
		editor.trigger('keyboard', Handler.Type, { text: triggerChar });
	});
});
