/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { DisposableStore, IReference, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../../nls.js';
import { IEditorOptions } from '../../../../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../../../browser/parts/editor/editorPane.js';
import { EditorInputCapabilities, IEditorOpenContext, IUntypedEditorInput } from '../../../../../../common/editor.js';
import { EditorInput } from '../../../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../../../services/editor/common/editorGroupsService.js';
import type { ChatMcpAppModel } from './chatMcpAppModel.js';

const chatMcpAppEditorIcon = registerIcon('chat-mcp-app-editor-icon', Codicon.mcp, localize('chatMcpAppEditorIcon', "Icon of the MCP App editor."));

/** Keeps an MCP App alive while it is displayed in an editor. */
export class ChatMcpAppEditorInput extends EditorInput {
	static readonly ID = 'workbench.editor.chatMcpApp';

	override readonly resource = URI.from({ scheme: 'chat-mcp-app', path: '/' + generateUuid() });
	private readonly _name: string;

	constructor(private readonly _reference: IReference<ChatMcpAppModel>) {
		super();
		this._register(_reference);
		this._name = this.model.appTitle ?? localize('chatMcpAppEditorName', "MCP App");
	}

	override get typeId(): string { return ChatMcpAppEditorInput.ID; }
	override get editorId(): string { return ChatMcpAppEditorInput.ID; }
	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }

	/** The shared model displayed by this editor. */
	get model(): ChatMcpAppModel { return this._reference.object; }

	override getName(): string { return this._name; }
	override getIcon(): ThemeIcon { return chatMcpAppEditorIcon; }

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof ChatMcpAppEditorInput && other.model === this.model;
	}
}

/** Displays an MCP App webview using the editor pane's fixed dimensions. */
export class ChatMcpAppEditor extends EditorPane {
	static readonly ID = ChatMcpAppEditorInput.ID;

	private _container: HTMLElement | undefined;
	private readonly _attachment = this._register(new MutableDisposable());

	// The app's overlay webview lives outside this pane's DOM, so focus is reported by the webview.
	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	override get onDidFocus(): Event<void> { return this._onDidFocusWebview.event; }
	private readonly _maxHeight = observableValue(this, 0);
	private readonly _currentWidth = observableValue(this, 0);

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(ChatMcpAppEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = dom.append(parent, dom.$('.chat-mcp-app-editor'));
		this._container.style.width = '100%';
		this._container.style.height = '100%';
	}

	override async setInput(input: ChatMcpAppEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || input.isDisposed() || this.input !== input || !this._container) {
			return;
		}
		const store = new DisposableStore();
		store.add(input.model.attach(this._container, {
			targetWindow: dom.getWindow(this._container),
			maxHeight: this._maxHeight,
			currentWidth: this._currentWidth,
			clippingContainer: this._container,
		}));
		store.add(input.model.onDidFocus(() => this._onDidFocusWebview.fire()));
		this._attachment.value = store;
	}

	override clearInput(): void {
		this._attachment.clear();
		super.clearInput();
	}

	override layout(dimension: dom.Dimension): void {
		transaction(tx => {
			this._maxHeight.set(dimension.height, tx);
			this._currentWidth.set(dimension.width, tx);
		});
		if (this.input instanceof ChatMcpAppEditorInput) {
			this.input.model.remount();
		}
	}

	override focus(): void {
		super.focus();
		if (this.input instanceof ChatMcpAppEditorInput) {
			this.input.model.focus();
		}
	}
}
