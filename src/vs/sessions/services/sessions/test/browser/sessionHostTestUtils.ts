/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ActiveSessionHost, ISessionHost, ISessionHostService, SessionHostKind } from '../../browser/sessionHost.js';
import { SessionHostService } from '../../browser/sessionHostService.js';
import { IActiveSession } from '../../common/sessionsManagement.js';

/**
 * Stubs the main window host and the host lookups on `instantiationService`, for tests of UI that hosts sessions, such
 * as session views and composers, which nest their hosts in the one they are created in.
 */
export function stubSessionHosts(instantiationService: TestInstantiationService, store: Pick<DisposableStore, 'add'>, options?: { readonly session?: IObservable<IActiveSession | undefined>; readonly editorGroupsService?: IEditorGroupsService }): { readonly mainHost: ISessionHost; readonly sessionHostService: SessionHostService } {
	const mainHost = new ActiveSessionHost({
		kind: SessionHostKind.MainWindow,
		parent: undefined,
		session: options?.session ?? constObservable(undefined),
		contextKeyService: upcastPartial<IContextKeyService>({}),
		windowId: constObservable(mainWindow.vscodeWindowId),
	});
	const sessionHostService = store.add(new SessionHostService(mainHost, options?.editorGroupsService ?? upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
	instantiationService.stub(ISessionHost, mainHost);
	instantiationService.stub(ISessionHostService, sessionHostService);
	return { mainHost, sessionHostService };
}
