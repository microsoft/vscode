/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Action } from '../../../../../../base/common/actions.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { parseNativeComponents } from '../../../common/nativeComponents/nativeComponentsParser.js';
import { describeNativeComponents } from '../../../common/nativeComponents/nativeComponentsText.js';
import { IDisposableReference } from './chatCollections.js';
import { EditorPool } from './chatContentCodePools.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatNativeComponentsPart, IChatNativeComponentsRenderer } from './chatNativeComponents.js';
import { renderNativeComponents } from './chatNativeComponentsRenderer.js';
import { IChatOutputPartStateCache, IOutputPartState } from './chatOutputPartStateCache.js';
import { CodeBlockPart, ICodeBlockData } from './codeBlockPart.js';

/**
 * The disclosures that the user expanded in a block, by the block's cached view state. They are
 * kept in memory only: they outlive the part when its row is recycled, but not a reload, and are
 * dropped together with the view state.
 */
const expandedDisclosures = new WeakMap<IOutputPartState, { readonly source: string; readonly indexes: Set<number> }>();
const noDisclosures: ReadonlySet<number> = new Set();

/**
 * Shows a native components block of a response as a visual, with its source one context menu
 * action away. A block that does not validate shows its source and the reason instead.
 */
export class ChatNativeComponentsPart extends Disposable implements IChatNativeComponentsPart {

	readonly element = dom.$('.chat-native-components');

	private readonly source: IDisposableReference<CodeBlockPart>;
	private readonly visualContainer = dom.$('.chat-native-components-visual');
	private readonly sourceContainer = dom.$('.chat-native-components-source');
	private readonly sourceAction: Action;
	private readonly disclosures: readonly HTMLDetailsElement[];
	private readonly stateKey: string;

	constructor(
		private readonly data: ICodeBlockData,
		private readonly fenceInfo: string,
		context: IChatContentPartRenderContext,
		editorPool: EditorPool,
		private readonly onDidChangeHeight: () => void,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatOutputPartStateCache private readonly stateCache: IChatOutputPartStateCache,
	) {
		super();
		// Find searches the source, as it does for any code block, and reveals it on a match.
		this.element.setAttribute('data-chat-find-ignore', '');
		this.stateKey = `nativeComponents/${data.chatSessionResource.toString()}/${data.element.id}/${data.codeBlockIndex}`;
		this.source = this._register(editorPool.get(CodeBlockPart.poolKey(data.element.id, data.codeBlockIndex)));
		this.source.object.render({ ...data, languageId: 'xml' }, context.currentWidth.get());
		this.sourceAction = this._register(new Action('chat.nativeComponents.source', localize('chat.nativeComponents.source', "Show Source"), undefined, true, async () => {
			this.showSource(!this.sourceAction.checked);
			this.focus();
		}));

		const result = parseNativeComponents(data.text, fenceInfo);
		if (result.error) {
			this.disclosures = [];
			this.sourceAction.enabled = false;
			dom.append(this.element, dom.$('.chat-native-components-notice')).textContent = result.error.line === undefined
				? localize('chat.nativeComponents.invalid', "This block could not be shown as a visual, so its source is shown instead. {0}", result.error.message)
				: localize('chat.nativeComponents.invalidLine', "This block could not be shown as a visual, so its source is shown instead. Line {0}: {1}", result.error.line, result.error.message);
		} else {
			const visual = renderNativeComponents(result.document);
			this.disclosures = visual.disclosures;
			this.visualContainer.appendChild(visual.element);
			this.registerVisualListeners();
		}

		this.element.append(this.visualContainer, this.sourceContainer);
		this.sourceContainer.appendChild(this.source.object.element);
		this.applyViewState();
	}

	get uri() {
		return this.source.object.uri;
	}

	get isFocused(): boolean {
		return dom.isAncestorOfActiveElement(this.element);
	}

	hasSameContent(text: string, fenceInfo: string): boolean {
		return this.data.text === text && this.fenceInfo === fenceInfo;
	}

	layout(width: number): void {
		this.source.object.layout(width);
	}

	onDidRemount(): void {
		// Another part of the same block may have changed the view state in the meantime.
		const changed = this.applyViewState();
		this.source.object.onDidRemount();
		if (changed) {
			this.onDidChangeHeight();
		}
	}

	focus(): void {
		if (this.sourceContainer.hidden) {
			this.element.focus();
		} else {
			this.source.object.focus();
		}
	}

	reveal(): boolean {
		if (!this.sourceContainer.hidden) {
			return false;
		}
		this.showSource(true);
		return true;
	}

	/** Makes the visual a labelled tab stop that offers its context menu and remembers its disclosures. */
	private registerVisualListeners(): void {
		this.element.tabIndex = 0;
		this.element.setAttribute('role', 'group');
		this.element.setAttribute('aria-label', localize('chat.nativeComponents.label', "Visual for code block {0}", this.data.codeBlockIndex + 1));
		this._register(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, event => {
			event.preventDefault();
			event.stopPropagation();
			this.showContextMenu(new StandardMouseEvent(dom.getWindow(this.element), event));
		}, true));
		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyMod.Shift | KeyCode.F10) || keyboardEvent.equals(KeyCode.ContextMenu)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this.showContextMenu();
			}
		}, true));
		this.disclosures.forEach((details, index) => {
			// Chat binds Enter to Edit Request wherever no text input has focus, which takes the key before
			// the browser toggles a native disclosure. The summary therefore handles Enter itself, like a
			// button. Nothing is bound to Space inside a response, so the browser toggles it on Space.
			this._register(dom.addDisposableListener(details, dom.EventType.KEY_DOWN, event => {
				if (event.target === details.firstElementChild && new StandardKeyboardEvent(event).equals(KeyCode.Enter)) {
					dom.EventHelper.stop(event, true);
					details.open = !details.open;
				}
			}));
			this._register(dom.addDisposableListener(details, 'toggle', () => {
				if (details.open !== this.readViewState().expanded.has(index)) {
					this.writeViewState((_state, expanded) => {
						if (details.open) {
							expanded.add(index);
						} else {
							expanded.delete(index);
						}
					});
					this.onDidChangeHeight();
				}
			}));
		});
	}

	private showContextMenu(anchor?: StandardMouseEvent): void {
		// While the source is shown, its editor's own menu is offered along with the action.
		const editor = this.sourceContainer.hidden ? undefined : this.source.object.editor;
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor ?? this.element,
			getActions: () => [this.sourceAction],
			menuId: editor?.contextMenuId,
			contextKeyService: editor?.contextKeyService,
			menuActionOptions: { arg: editor?.getModel()?.uri },
			onHide: cancelled => {
				if (cancelled) {
					this.focus();
				}
			},
		});
	}

	private showSource(show: boolean): void {
		this.writeViewState(state => { state.showingSource = show; });
		this.applyViewState();
		if (show) {
			this.source.object.onDidRemount();
		}
		this.onDidChangeHeight();
	}

	/** Shows what the remembered view state asks for. Returns whether that changed anything. */
	private applyViewState(): boolean {
		const state = this.readViewState();
		const showSource = state.showingSource || !this.sourceAction.enabled;
		let changed = this.sourceContainer.hidden === showSource;
		this.sourceContainer.hidden = !showSource;
		this.visualContainer.hidden = showSource;
		this.sourceAction.checked = showSource;
		this.disclosures.forEach((details, index) => {
			const open = state.expanded.has(index);
			changed ||= details.open !== open;
			details.open = open;
		});
		return changed;
	}

	private readViewState(): { readonly showingSource: boolean; readonly expanded: ReadonlySet<number> } {
		const state = this.stateCache.get(this.stateKey);
		const expanded = state && expandedDisclosures.get(state);
		return {
			showingSource: !!state?.showingSource,
			expanded: expanded?.source === this.data.text ? expanded.indexes : noDisclosures,
		};
	}

	/** Remembers a change of the view state. A block only occupies the cache once the user has changed how it is shown. */
	private writeViewState(update: (state: IOutputPartState, expanded: Set<number>) => void): void {
		const state = this.stateCache.get(this.stateKey) ?? { height: 0 };
		let expanded = expandedDisclosures.get(state);
		if (expanded?.source !== this.data.text) {
			expanded = { source: this.data.text, indexes: new Set() };
			expandedDisclosures.set(state, expanded);
		}
		update(state, expanded.indexes);
		this.stateCache.set(this.stateKey, state);
	}
}

/** Renders native components blocks. Contributed by the entries whose chat surfaces show them. */
export const chatNativeComponentsRenderer: IChatNativeComponentsRenderer = {
	createPart: (instantiationService, data, fenceInfo, context, editorPool, onDidChangeHeight) => instantiationService.createInstance(ChatNativeComponentsPart, data, fenceInfo, context, editorPool, onDidChangeHeight),
	describe: (source, fenceInfo) => {
		const { document } = parseNativeComponents(source, fenceInfo);
		return document && describeNativeComponents(document);
	},
};
