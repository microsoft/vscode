/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { InlineCompletionsController } from '../../browser/controller/inlineCompletionsController.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { ITextModel } from '../../../../common/model.js';

suite('Inline Protected Files', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestController extends InlineCompletionsController {
		public testIsSuggestionAllowed(model: ITextModel): boolean {
			// @ts-ignore
			return this.isSuggestionAllowed(model);
		}
	}

	test('Inline suggestions disabled for protected files', () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('workspace.protectedFiles', {
			'**/.env': { suggest: false },
			'**/secret.txt': { suggest: false }
		});

		const contextKeyService = new MockContextKeyService();
		const instantiationService = new class extends mock<IInstantiationService>() {
			override invokeFunction(fn: any, ...args: any[]): any {
				return fn(new class extends mock<any>() {
					get(id: any): any {
						if (id === IConfigurationService) {
							return configService;
						}
						if (id === IContextKeyService) {
							return contextKeyService;
						}
						return undefined;
					}
				});
			}
		};

		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI): any {
				return { uri: URI.file('/workspace') };
			}
		} as any;

		const editor = new class extends mock<ICodeEditor>() {
			override getOption(id: any): any {
				return { value: true };
			}
			override getModel(): any {
				return { uri: URI.file('/workspace/test.ts') };
			}
			
			// Events
			override onDidChangeModel: any = () => ({ dispose: () => { } });
			override onDidChangeModelContent: any = () => ({ dispose: () => { } });
			override onDidBlurEditorText: any = () => ({ dispose: () => { } });
			override onDidFocusEditorText: any = () => ({ dispose: () => { } });
			override onDidChangeCursorPosition: any = () => ({ dispose: () => { } });
			override onMouseDown: any = () => ({ dispose: () => { } });
			override onDidChangeConfiguration: any = () => ({ dispose: () => { } });
		} as any;

		const controller = new TestController(
			editor,
			instantiationService,
			contextKeyService,
			configService,
			undefined as any, // commandService
			undefined as any, // debounceService
			undefined as any, // languageFeaturesService
			undefined as any, // accessibilitySignalService
			undefined as any, // keybindingService
			undefined as any, // accessibilityService
			workspaceContextService
		);

		const allowedEnv = controller.testIsSuggestionAllowed({ uri: URI.file('/workspace/.env') } as any);
		assert.strictEqual(allowedEnv, false, '.env should be blocked');

		const allowedSecret = controller.testIsSuggestionAllowed({ uri: URI.file('/workspace/src/secret.txt') } as any);
		assert.strictEqual(allowedSecret, false, 'secret.txt should be blocked');

		const allowedNormal = controller.testIsSuggestionAllowed({ uri: URI.file('/workspace/src/app.ts') } as any);
		assert.strictEqual(allowedNormal, true, 'normal files should be allowed');

		controller.dispose();
	});
});
