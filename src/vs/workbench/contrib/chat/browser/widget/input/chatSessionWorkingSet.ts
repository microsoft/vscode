/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { getChatFileChangeLineCounts, renderChangesSummaryFileList } from '../chatContentParts/chatChangesSummaryPart.js';

export class ChatSessionWorkingSet extends Disposable {
	readonly domNode = dom.$('.chat-editing-session-container.chat-session-working-set');
	readonly onDidFocus: Event<void>;

	constructor(
		diffs: IObservable<readonly IEditSessionEntryDiff[]>,
		collapsed: ISettableObservable<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		ChatContextKeys.inChatSessionWorkingSet.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		this.onDidFocus = this._register(dom.trackFocus(this.domNode)).onDidFocus;

		const overview = dom.append(this.domNode, dom.$('.chat-editing-session-overview'));
		const title = dom.append(overview, dom.$('.working-set-title'));
		const button = this._register(new ButtonWithIcon(title, { secondary: true, supportIcons: true }));
		const counts = dom.append(button.element, dom.$('.working-set-line-counts', { 'aria-hidden': 'true' }));
		const addedLabel = dom.append(counts, dom.$('.working-set-lines-added'));
		const removedLabel = dom.append(counts, dom.$('.working-set-lines-removed'));
		const listContainer = dom.append(this.domNode, dom.$('.chat-editing-session-list'));

		this._register(renderChangesSummaryFileList(listContainer, diffs, scopedInstantiationService, editorService, configurationService, {
			alwaysOpenInDiffEditor: true,
			ariaLabel: localize('chat.sessionWorkingSet.list', "Session changes"),
		}));
		this._register(button.onDidClick(() => collapsed.set(!collapsed.get(), undefined)));
		this._register(autorun(reader => {
			const isCollapsed = collapsed.read(reader);
			button.icon = isCollapsed ? Codicon.chevronRightCompact : Codicon.chevronDownCompact;
			button.element.setAttribute('aria-expanded', String(!isCollapsed));
			if (isCollapsed && dom.isAncestorOfActiveElement(listContainer)) {
				button.focus();
			}
			listContainer.classList.toggle('collapsed', isCollapsed);
		}));
		this._register(autorun(reader => {
			const changes = diffs.read(reader);
			const label = changes.length === 1
				? localize('chat.sessionWorkingSet.oneFile', "1 file changed")
				: localize('chat.sessionWorkingSet.manyFiles', "{0} files changed", changes.length);
			const added = changes.reduce((total, diff) => total + diff.added, 0);
			const removed = changes.reduce((total, diff) => total + diff.removed, 0);
			button.label = label;
			button.element.setAttribute('aria-label', localize('chat.sessionWorkingSet.summary', "Session changes, {0}, {1}", label, getChatFileChangeLineCounts(added, removed)));
			addedLabel.textContent = `+${added}`;
			removedLabel.textContent = `-${removed}`;
		}));
	}
}
