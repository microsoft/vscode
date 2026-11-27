/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { getIconsStyleSheet } from '../../../../../../../platform/theme/browser/iconsStyleSheet.js';
import '../../../../../../../base/browser/ui/codicons/codiconStyles.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatAutoModeResolutionContentPart } from '../../../../browser/widget/chatContentParts/chatAutoModeResolutionContentPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { IChatAutoModeResolutionPart } from '../../../../common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import '../../../../browser/widget/media/chat.css';
import '../../../../browser/widget/chatContentParts/media/chatThinkingContent.css';

suite('ChatAutoModeResolutionContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a model router\'s routing line shows the router icon while routing and once it picked; Auto\'s line does not', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IHoverService, NullHoverService);
		const host = mainWindow.document.body.appendChild($('.interactive-session'));
		disposables.add(toDisposable(() => host.remove()));
		const context = upcastPartial<IChatContentPartRenderContext>({ element: upcastPartial<IChatResponseViewModel>({ isComplete: false }), contentIndex: 0, content: [] });

		const render = (part: Omit<IChatAutoModeResolutionPart, 'kind'>) => {
			const contentPart = disposables.add(instantiationService.createInstance(ChatAutoModeResolutionContentPart, { kind: 'autoModeResolution', ...part }, context));
			host.appendChild(contentPart.domNode);
			const icon = contentPart.domNode.querySelector<HTMLElement>('.chat-used-context-label .monaco-icon-button > .codicon:first-child')!;
			return { icon: [...icon.classList].find(c => c.startsWith('codicon-')), visible: mainWindow.getComputedStyle(icon).display !== 'none', ariaHidden: icon.getAttribute('aria-hidden') };
		};

		assert.deepStrictEqual({
			routerRouting: render({ router: 'Daily Driver' }),
			routerPicked: render({ router: 'Daily Driver', routeName: 'quick', resolved: { id: 'haiku', name: 'Claude Haiku 5.5' }, effort: 'low' }),
			auto: render({ resolved: { id: 'haiku', name: 'Claude Haiku 5.5' } }),
		}, {
			routerRouting: { icon: 'codicon-chat-model-router', visible: true, ariaHidden: 'true' },
			routerPicked: { icon: 'codicon-chat-model-router', visible: true, ariaHidden: 'true' },
			auto: { icon: 'codicon-check-compact', visible: false, ariaHidden: null },
		});
	});

	test('a wrapped routing title keeps the router icon on its first line', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IHoverService, NullHoverService);
		const host = mainWindow.document.body.appendChild($('.interactive-session'));
		disposables.add(toDisposable(() => host.remove()));
		// The router icon is a registered icon, so its glyph comes from the icons stylesheet.
		host.appendChild($('style')).textContent = disposables.add(getIconsStyleSheet(undefined)).getCSS().toString();
		const value = host.appendChild($('.interactive-item-container.interactive-response')).appendChild($('.value'));
		value.style.width = '120px';
		const context = upcastPartial<IChatContentPartRenderContext>({ element: upcastPartial<IChatResponseViewModel>({ isComplete: true }), contentIndex: 0, content: [] });
		const part = disposables.add(instantiationService.createInstance(ChatAutoModeResolutionContentPart, {
			kind: 'autoModeResolution', router: 'Daily Driver', routeName: 'quick', resolved: { id: 'haiku', name: 'Claude Haiku 5.5' }, effort: 'low',
		}, context));
		value.appendChild(part.domNode);

		const icon = part.domNode.querySelector<HTMLElement>('.monaco-icon-button > .codicon:first-child')!.getBoundingClientRect();
		const label = part.domNode.querySelector<HTMLElement>('.monaco-button-mdlabel')!;
		const labelBox = label.getBoundingClientRect();
		const lineHeight = parseFloat(mainWindow.getComputedStyle(label).lineHeight);
		assert.deepStrictEqual({
			wraps: labelBox.height > lineHeight * 1.5,
			iconOnFirstLine: Math.abs(icon.top - labelBox.top) < 1 && Math.abs(icon.height - lineHeight) < 1,
		}, { wraps: true, iconOnFirstLine: true });
	});
});
