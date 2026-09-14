/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageSelection, ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AUX_WINDOW_GROUP, IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { OpenMultiDiffEditorLayoutDebugAction } from '../../browser/actions.js';

suite('MultiDiffEditor Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function getLayoutDebugTargetGroup(isSessionsWindow: boolean): Promise<PreferredGroup | undefined> {
		const onWillDispose = disposables.add(new Emitter<void>());
		let isDisposed = false;
		const model = disposables.add(new class extends mock<ITextModel>() {
			override readonly uri = URI.from({ scheme: Schemas.inMemory, path: '/layout-debug.jsonl' });
			override readonly onWillDispose = onWillDispose.event;

			override isDisposed(): boolean {
				return isDisposed;
			}

			override dispose(): void {
				if (!isDisposed) {
					isDisposed = true;
					onWillDispose.fire();
				}
			}
		}());
		const activeEditorPane = {
			getLayoutDebugState() {
				return constObservable({});
			}
		};
		let targetGroup: PreferredGroup | undefined;
		const editorService = {
			activeEditorPane,
			openEditor: async (...args: unknown[]) => {
				targetGroup = args[1] as PreferredGroup;
				return activeEditorPane;
			},
		};
		const modelService = new class extends mock<IModelService>() {
			override createModel(..._args: Parameters<IModelService['createModel']>): ITextModel {
				return model;
			}
		}();
		const languageService = new class extends mock<ILanguageService>() {
			override createById(): ILanguageSelection {
				return { languageId: 'jsonl', onDidChange: Event.None };
			}
		}();
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = isSessionsWindow;
		}();
		const accessor = {
			get: (service: unknown) => {
				if (service === IEditorService) {
					return editorService;
				}
				if (service === IModelService) {
					return modelService;
				}
				if (service === ILanguageService) {
					return languageService;
				}
				if (service === IWorkbenchEnvironmentService) {
					return environmentService;
				}
				throw new Error('Unexpected service');
			},
		} as ServicesAccessor;

		await new OpenMultiDiffEditorLayoutDebugAction().run(accessor);
		model.dispose();
		return targetGroup;
	}

	test('opens layout debug in an auxiliary window from the Agents Window', async () => {
		assert.deepStrictEqual({
			workbench: await getLayoutDebugTargetGroup(false),
			agentsWindow: await getLayoutDebugTargetGroup(true),
		}, {
			workbench: SIDE_GROUP,
			agentsWindow: AUX_WINDOW_GROUP,
		});
	});
});
