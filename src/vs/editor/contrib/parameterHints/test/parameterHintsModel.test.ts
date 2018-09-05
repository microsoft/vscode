/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { SignatureHelp, SignatureHelpProvider, SignatureHelpProviderRegistry } from 'vs/editor/common/modes';
import { TestCodeEditor, createTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService, NullStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ParameterHintsModel } from '../parameterHintsWidget';

function createMockEditor(model: TextModel): TestCodeEditor {
	return createTestCodeEditor({
		model: model,
		serviceCollection: new ServiceCollection(
			[ITelemetryService, NullTelemetryService],
			[IStorageService, NullStorageService]
		)
	});
}


suite('ParameterHintsModel', () => {
	let disposables: IDisposable[] = [];


	setup(function () {
		disposables = dispose(disposables);
	});

	test('Should cancel existing request when new request comes in', () => {
		const textModel = TextModel.createFromString('abc def', undefined, undefined, URI.parse('test:somefile.ttt'));
		disposables.push(textModel);

		const editor = createMockEditor(textModel);
		const hintsModel = new ParameterHintsModel(editor);

		let didRequestCancellationOf = -1;
		let invokeCount = 0;
		const longRunningProvider = new class implements SignatureHelpProvider {
			signatureHelpTriggerCharacters: string[] = [];

			provideSignatureHelp(model: ITextModel, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp> {
				const count = invokeCount++;
				token.onCancellationRequested(() => { didRequestCancellationOf = count; });

				// retrigger on first request
				if (count === 0) {
					hintsModel.trigger(0);
				}

				return new Promise<SignatureHelp>(resolve => {
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

		disposables.push(SignatureHelpProviderRegistry.register({ scheme: 'test' }, longRunningProvider));

		hintsModel.trigger(0);
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
});
