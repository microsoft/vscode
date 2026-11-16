/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { ChatWidget } from '../../../chat/browser/widget/chatWidget.js';
import { IChatViewHost, IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { ChatViewHostService } from '../../../chat/browser/widgetHosts/viewPane/chatViewHostService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ChatViewPane } from '../../../chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { openPanelChatAndGetWidget } from '../../browser/openPanelChatAndGetWidget.js';

suite('openPanelChatAndGetWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The host service of a workbench whose Chat view shows `chatViewWidget`, where a chat editor opened before it exists. */
	function createService(chatViewWidget: ChatWidget) {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async (id: string, focus?: boolean) => { calls.push(`openView ${id} focus=${focus}`); return upcastPartial<ChatViewPane>({ widget: chatViewWidget }); }) as IViewsService['openView'],
		}));
		instantiationService.stub(IViewDescriptorService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});
		instantiationService.stub(IProgressService, {});
		return { service: instantiationService.createInstance(ChatViewHostService) as IChatViewHostService, calls };
	}

	test('returns the Chat view\'s widget, not a chat editor opened before it', async () => {
		const chatViewWidget = upcastPartial<ChatWidget>({ viewContext: { viewId: ChatViewId } });
		const { service, calls } = createService(chatViewWidget);
		assert.deepStrictEqual({ widget: await openPanelChatAndGetWidget(service) === chatViewWidget, calls }, { widget: true, calls: [`openView ${ChatViewId} focus=true`] });
	});

	test('returns what a host that replaces the Chat view shows, also none, asking it to wait for its widget', async () => {
		const { service, calls } = createService(upcastPartial<ChatWidget>({}));
		const registration = service.registerHost(upcastPartial<IChatViewHost>({
			reveal: async (preserveFocus, options) => { calls.push(`reveal preserveFocus=${preserveFocus} waitForWidget=${options?.waitForWidget}`); return undefined; },
		}));
		const widget = await openPanelChatAndGetWidget(service);
		registration.dispose();
		assert.deepStrictEqual({ widget, calls }, { widget: undefined, calls: ['reveal preserveFocus=false waitForWidget=true'] });
	});
});
