/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ChatPetAchievementsWidget } from './chatPetAchievementsWidget.js';
import { ChatPetAchievementsEditorInput } from './chatPetAchievementsEditorInput.js';
import { IChatPetService } from './chatPetService.js';

export const ChatPetAchievementsContextKeys = {
	focused: new RawContextKey<boolean>('chatPetAchievementsFocused', false, localize('chatPet.achievements.context.focused', "Whether the chat pet Achievements modal is focused")),
};

export class ChatPetAchievementsEditor extends EditorPane {

	static readonly ID = 'workbench.editor.chatPetAchievements';

	private readonly editorDisposables = this._register(new DisposableStore());
	private readonly focusedContextKey: IContextKey<boolean>;
	private container: HTMLElement | undefined;
	private widget: ChatPetAchievementsWidget | undefined;
	private dimension: DOM.Dimension | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatPetService private readonly chatPetService: IChatPetService,
	) {
		super(ChatPetAchievementsEditor.ID, group, telemetryService, themeService, storageService);
		this.focusedContextKey = ChatPetAchievementsContextKeys.focused.bindTo(contextKeyService);
		this._register(toDisposable(() => this.focusedContextKey.reset()));
		this._register(autorun(reader => {
			if (!this.chatPetService.enabled.read(reader) && this.input) {
				void this.group.closeEditor(this.input);
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.editorDisposables.clear();
		this.container = DOM.append(parent, DOM.$('.chat-pet-achievements-editor'));
		const focusTracker = this.editorDisposables.add(DOM.trackFocus(this.container));
		this.editorDisposables.add(focusTracker.onDidFocus(() => this.focusedContextKey.set(true)));
		this.editorDisposables.add(focusTracker.onDidBlur(() => this.focusedContextKey.set(false)));
		this.widget = this.editorDisposables.add(this.instantiationService.createInstance(ChatPetAchievementsWidget, this.container, () => {
			if (this.input) {
				void this.group.closeEditor(this.input);
			}
		}));
	}

	override async setInput(input: ChatPetAchievementsEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!this.chatPetService.enabled.get()) {
			await this.group.closeEditor(input);
			return;
		}
		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

	override clearInput(): void {
		this.focusedContextKey.set(false);
		super.clearInput();
	}

	override layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
		this.widget?.layout(dimension);
	}

	override focus(): void {
		super.focus();
		this.widget?.focus();
	}
}
