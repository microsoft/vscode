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

	test('applies the visibility changes of source controls in the order they were made, also while a source control registers', async () => {
		const providers = new Map<string, ISCMProvider>();
		const scmService = new class extends mock<ISCMService>() {
			override registerSCMProvider(provider: ISCMProvider): ISCMRepository {
				providers.set(provider.label, provider);
				return new class extends mock<ISCMRepository>() {
					override readonly provider = provider;
					override readonly input = new class extends mock<ISCMRepository['input']>() {
						override readonly value = '';
						override readonly onDidChange = Event.None;
					}();
					override dispose(): void { provider.dispose(); }
				}();
			}
		}();
		const scmViewService = new class extends mock<ISCMViewService>() {
			override readonly onDidFocusRepository = Event.None;
			override readonly focusedRepository = undefined;
		}();

		// The input box model of the source control `C` resolves late, which delays its registration
		const lateInputBox = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		const textModelService = new class extends mock<ITextModelService>() {
			override registerTextModelContentProvider() { return Disposable.None; }
			override createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				const reference = { object: { textEditorModel: {} as ITextModel } as IResolvedTextEditorModel, dispose() { } };
				return resource.path.includes('/C/') ? lateInputBox.p : Promise.resolve(reference);
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

		const inputBox = (id: string) => URI.from({ scheme: 'vscode-scm', path: `${id}/scm/input` });
		await mainThread.$registerSourceControl(0, undefined, 'git', 'A', undefined, undefined, false, inputBox('/A'));
		const registerC = mainThread.$registerSourceControl(1, undefined, 'git', 'C', undefined, undefined, true, inputBox('/C/'));

		// Show C and hide A, then show A again: the second change must not be undone by the first one
		const first = mainThread.$setSourceControlsHidden([[1, false], [0, true]]);
		const second = mainThread.$setSourceControlsHidden([[0, false]]);
		lateInputBox.complete({ object: { textEditorModel: {} as ITextModel } as IResolvedTextEditorModel, dispose() { } });
		await Promise.all([registerC, first, second]);

		assert.deepStrictEqual({ A: providers.get('A')!.isHidden.get(), C: providers.get('C')!.isHidden.get() }, { A: false, C: false });
	});
});
