/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickDiffService } from '../../../contrib/scm/common/quickDiff.js';
import { ISCMProvider, ISCMRepository, ISCMService, ISCMViewService } from '../../../contrib/scm/common/scm.js';
import { MainThreadSCM } from '../../browser/mainThreadSCM.js';
import { ExtHostSCMShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadSCM', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const inputBox = (id: string) => URI.from({ scheme: 'vscode-scm', path: `${id}/scm/input` });
	const resolvedInputBox = () => ({ object: { textEditorModel: {} as ITextModel } as IResolvedTextEditorModel, dispose() { } });

	/**
	 * A main thread whose source control `C` registers late, because its input box model resolves late.
	 */
	function createMainThread() {
		const events: string[] = [];
		const scmService = new class extends mock<ISCMService>() {
			override registerSCMProvider(provider: ISCMProvider): ISCMRepository {
				events.push(`add ${provider.label}`);
				return new class extends mock<ISCMRepository>() {
					override readonly provider = provider;
					override readonly input = new class extends mock<ISCMRepository['input']>() {
						override readonly value = '';
						override readonly onDidChange = Event.None;
					}();
					override dispose(): void {
						events.push(`remove ${provider.label}`);
						provider.dispose();
					}
				}();
			}
		}();
		const scmViewService = new class extends mock<ISCMViewService>() {
			override readonly onDidFocusRepository = Event.None;
			override readonly focusedRepository = undefined;
		}();

		const lateInputBox = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		const textModelService = new class extends mock<ITextModelService>() {
			override registerTextModelContentProvider() { return Disposable.None; }
			override createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				return resource.path.includes('/C/') ? lateInputBox.p : Promise.resolve(resolvedInputBox());
			}
		}();

		const mainThread = new MainThreadSCM(
			SingleProxyRPCProtocol(new class extends mock<ExtHostSCMShape>() { }),
			scmService,
			scmViewService,
			new class extends mock<ILanguageService>() { }(),
			new class extends mock<IModelService>() { }(),
			textModelService,
			new class extends mock<IQuickDiffService>() { }(),
			new class extends mock<IUriIdentityService>() { }(),
			new class extends mock<IWorkspaceContextService>() { }()
		);
		disposables.add({ dispose: () => mainThread.dispose() });

		return { mainThread, events, lateInputBox };
	}

	test('removes a source control after the source controls registered before it, so that replacing one never leaves none', async () => {
		const { mainThread, events, lateInputBox } = createMainThread();
		await mainThread.$registerSourceControl(0, undefined, 'git', 'A', undefined, undefined, inputBox('/A'));

		// Replace A by C, whose registration waits for its input box model
		const registerC = mainThread.$registerSourceControl(1, undefined, 'git', 'C', undefined, undefined, inputBox('/C/'));
		const unregisterA = mainThread.$unregisterSourceControl(0);
		lateInputBox.complete(resolvedInputBox());
		await Promise.all([registerC, unregisterA]);

		assert.deepStrictEqual(events, ['add A', 'add C', 'remove A']);
	});
});
