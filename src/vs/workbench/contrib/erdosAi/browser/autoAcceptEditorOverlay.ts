/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable, combinedDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { observableFromEvent, autorun } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { EditorGroupView } from '../../../browser/parts/editor/editorGroupView.js';
import { IFileChangeTracker } from '../../../services/erdosAi/common/fileChangeTracker.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConversationManager } from '../../../services/erdosAiConversation/common/conversationManager.js';
import { AutoAcceptFloatingBar } from './components/autoAcceptFloatingBar.js';
import { ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';
import React from 'react';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

class AutoAcceptOverlayController {
	private readonly _store = new DisposableStore();
	private readonly _domNode = document.createElement('div');
	private _reactRenderer: ErdosReactRenderer | undefined;

	constructor(
		container: HTMLElement,
		group: IEditorGroup,
		@IInstantiationService instaService: IInstantiationService,
		@IFileChangeTracker fileChangeTracker: IFileChangeTracker,
		@IEditorService editorService: IEditorService,
		@IConversationManager conversationManager: IConversationManager,
	) {
		this._domNode.classList.add('erdos-ai-auto-accept-editor-overlay');
		this._domNode.style.position = 'absolute';
		this._domNode.style.bottom = '20px';
		this._domNode.style.left = '50%';
		this._domNode.style.transform = 'translateX(-50%)';
		this._domNode.style.zIndex = '1000';
		this._domNode.style.pointerEvents = 'auto';
		this._domNode.style.maxWidth = '600px';

		// Create React renderer and render the AutoAcceptFloatingBar
		this._reactRenderer = new ErdosReactRenderer(this._domNode);
		this._store.add(this._reactRenderer);

		this._reactRenderer.render(
			React.createElement(AutoAcceptFloatingBar, {
				fileChangeTracker: fileChangeTracker,
				editorService: editorService,
				conversationManager: conversationManager
			})
		);

		this._store.add(toDisposable(() => this._domNode.remove()));

		const show = () => {
			if (!container.contains(this._domNode)) {
				container.appendChild(this._domNode);
			}
		};

		// Show by default
		show();
	}

	dispose(): void {
		this._store.dispose();
	}
}

export class AutoAcceptEditorOverlay implements IWorkbenchContribution {
	static readonly ID = 'erdosAi.autoAccept.editorOverlay';

	private readonly _store = new DisposableStore();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const editorGroups = observableFromEvent(
			this,
			Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
			() => editorGroupsService.groups
		);

		const overlayWidgets = new DisposableMap<IEditorGroup>();

		this._store.add(autorun((r: any) => {
			const toDelete = new Set(overlayWidgets.keys());
			const groups = editorGroups.read(r);

			for (const group of groups) {
				if (!(group instanceof EditorGroupView)) {
					continue;
				}

				toDelete.delete(group); // we keep the widget for this group!

				if (!overlayWidgets.has(group)) {
					const scopedInstaService = instantiationService.createChild(
						new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
					);

					const container = group.element;

					const ctrl = scopedInstaService.createInstance(AutoAcceptOverlayController, container, group);
					overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
				}
			}

			for (const group of toDelete) {
				overlayWidgets.deleteAndDispose(group);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
	}
}