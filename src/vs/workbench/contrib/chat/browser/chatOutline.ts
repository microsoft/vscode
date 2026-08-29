/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IconLabel, IIconLabelValueOptions } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IDataSource, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMatches, FuzzyScore } from '../../../../base/common/filters.js';
import { escapeIcons } from '../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IWorkbenchDataTreeOptions } from '../../../../platform/list/browser/listService.js';
import { IBreadcrumbsDataSource, IBreadcrumbsOutlineElement, IOutline, IOutlineComparator, IOutlineListConfig, IQuickPickDataSource, IQuickPickOutlineElement, OutlineChangeEvent, OutlineTarget } from '../../../services/outline/browser/outline.js';
import { ChatTreeItem, IChatWidget } from './chat.js';
import { IChatRequestViewModel, isRequestVM } from '../common/model/chatViewModel.js';
import { isChatFollowup } from '../common/chatService/chatService.js';
import { getExplicitFileOrImageAttachmentSummary } from '../common/attachments/chatVariableEntries.js';

/**
 * Derives the display label for a chat request. Reads the prompt text the same
 * way the chat list renders it (followup message, else the parsed request
 * parts) rather than relying on `messageText`, which some providers (e.g.
 * agent-host sessions) leave empty. When there is no prompt text, falls back to
 * an attachment summary (matching the chat list) and finally a numbered label.
 * Collapses whitespace so multi-line prompts render on a single row. Returns raw
 * text; callers that render into an icon-parsing surface (e.g. the quick pick)
 * must escape `$(...)` codicon markup themselves via `escapeIcons`.
 */
export function getChatRequestLabel(request: IChatRequestViewModel, index: number): string {
	const message = request.message;
	let raw: string;
	if (isChatFollowup(message)) {
		raw = message.message ?? '';
	} else {
		raw = message.text || (Array.isArray(message.parts) ? message.parts.map(part => part.text).join('') : '');
	}
	const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
	if (text.length > 0) {
		return text;
	}
	return getExplicitFileOrImageAttachmentSummary(request.variables) ?? localize('chatOutline.emptyRequest', "Request {0}", index + 1);
}

/**
 * A single navigable element in a chat outline. Each entry maps to a user
 * request (prompt) in the chat, acting as the top-level "symbol" the user can
 * jump to via Go to Symbol, the Outline pane, and Breadcrumbs.
 */
export class ChatOutlineEntry {

	constructor(
		readonly index: number,
		readonly element: IChatRequestViewModel,
	) { }

	get id(): string {
		return this.element.id;
	}

	get icon(): ThemeIcon {
		return Codicon.commentDiscussion;
	}

	get label(): string {
		return getChatRequestLabel(this.element, this.index);
	}
}

class ChatOutlineVirtualDelegate implements IListVirtualDelegate<ChatOutlineEntry> {
	getHeight(): number {
		return 22;
	}
	getTemplateId(): string {
		return ChatOutlineRenderer.templateId;
	}
}

interface IChatOutlineTemplate {
	readonly container: HTMLElement;
	readonly iconClass: HTMLElement;
	readonly iconLabel: IconLabel;
}

class ChatOutlineRenderer implements ITreeRenderer<ChatOutlineEntry, FuzzyScore, IChatOutlineTemplate> {

	static readonly templateId = 'ChatOutlineRenderer';
	readonly templateId = ChatOutlineRenderer.templateId;

	renderTemplate(container: HTMLElement): IChatOutlineTemplate {
		container.classList.add('chat-outline-element');
		const iconClass = document.createElement('div');
		container.append(iconClass);
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		return { container, iconClass, iconLabel };
	}

	renderElement(node: ITreeNode<ChatOutlineEntry, FuzzyScore>, _index: number, template: IChatOutlineTemplate): void {
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
		};
		template.iconClass.className = 'element-icon ' + ThemeIcon.asClassNameArray(node.element.icon).join(' ');
		template.iconLabel.setLabel(node.element.label, undefined, options);
	}

	disposeTemplate(template: IChatOutlineTemplate): void {
		template.iconLabel.dispose();
	}
}

class ChatOutlineAccessibility implements IListAccessibilityProvider<ChatOutlineEntry> {
	getAriaLabel(element: ChatOutlineEntry): string {
		return element.label;
	}
	getWidgetAriaLabel(): string {
		return localize('chatOutline', "Chat Outline");
	}
}

class ChatOutlineComparator implements IOutlineComparator<ChatOutlineEntry> {
	compareByPosition(a: ChatOutlineEntry, b: ChatOutlineEntry): number {
		return a.index - b.index;
	}
	compareByType(a: ChatOutlineEntry, b: ChatOutlineEntry): number {
		return a.index - b.index;
	}
	compareByName(a: ChatOutlineEntry, b: ChatOutlineEntry): number {
		return a.label.localeCompare(b.label);
	}
}

class ChatOutlineTreeDataSource implements IDataSource<ChatOutline, ChatOutlineEntry> {
	getChildren(element: ChatOutline | ChatOutlineEntry): Iterable<ChatOutlineEntry> {
		if (element instanceof ChatOutline) {
			return element.entries;
		}
		return [];
	}
}

class ChatOutlineQuickPickDataSource implements IQuickPickDataSource<ChatOutlineEntry> {
	constructor(private readonly _outline: ChatOutline) { }
	getQuickPickElements(): IQuickPickOutlineElement<ChatOutlineEntry>[] {
		return this._outline.entries.map(entry => ({
			element: entry,
			// Codicons cannot be passed via `iconClasses` in this quick pick (only
			// file icons can); embed the icon inline in the label instead and
			// escape only the request text so `$(...)` in it stays literal.
			label: `$(${entry.icon.id}) ${escapeIcons(entry.label)}`,
			ariaLabel: entry.label,
		}));
	}
}

class ChatOutlineBreadcrumbsDataSource implements IBreadcrumbsDataSource<ChatOutlineEntry> {
	constructor(private readonly _outline: ChatOutline) { }
	getBreadcrumbElements(): readonly IBreadcrumbsOutlineElement<ChatOutlineEntry>[] {
		const active = this._outline.activeElement;
		return active ? [{ element: active, label: active.label }] : [];
	}
}

export class ChatOutline implements IOutline<ChatOutlineEntry> {

	readonly outlineKind = 'chat';

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = this._disposables.add(new Emitter<OutlineChangeEvent>());
	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _entries: ChatOutlineEntry[] = [];
	readonly config: IOutlineListConfig<ChatOutlineEntry>;

	constructor(
		private readonly _widget: IChatWidget,
		target: OutlineTarget,
	) {
		this._recomputeEntries();

		this._disposables.add(this._widget.onDidChangeViewModel(() => {
			const changed = this._recomputeEntries();
			this._registerViewModelListener();
			if (changed) {
				this._onDidChange.fire({});
			}
		}));
		this._registerViewModelListener();

		const options: IWorkbenchDataTreeOptions<ChatOutlineEntry, FuzzyScore> = {
			collapseByDefault: target === OutlineTarget.Breadcrumbs,
			expandOnlyOnTwistieClick: true,
			multipleSelectionSupport: false,
			accessibilityProvider: new ChatOutlineAccessibility(),
			identityProvider: { getId: element => element.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: element => element.label },
		};

		this.config = {
			treeDataSource: new ChatOutlineTreeDataSource(),
			quickPickDataSource: new ChatOutlineQuickPickDataSource(this),
			breadcrumbsDataSource: new ChatOutlineBreadcrumbsDataSource(this),
			delegate: new ChatOutlineVirtualDelegate(),
			renderers: [new ChatOutlineRenderer()],
			comparator: new ChatOutlineComparator(),
			options,
		};
	}

	private readonly _viewModelDisposables = this._disposables.add(new DisposableStore());
	private _registerViewModelListener(): void {
		this._viewModelDisposables.clear();
		const viewModel = this._widget.viewModel;
		if (viewModel) {
			this._viewModelDisposables.add(viewModel.onDidChange(() => {
				// The view model fires on every response update (including each
				// streamed chunk). Request symbols don't change during streaming,
				// so only refresh the outline when the entries actually change.
				if (this._recomputeEntries()) {
					this._onDidChange.fire({});
				}
			}));
		}
	}

	private _entriesSignature = '';
	private _recomputeEntries(): boolean {
		const items = this._widget.viewModel?.getItems() ?? [];
		const entries: ChatOutlineEntry[] = [];
		let index = 0;
		for (const item of items) {
			if (isRequestVM(item)) {
				entries.push(new ChatOutlineEntry(index++, item));
			}
		}

		const signature = entries.map(entry => `${entry.id}\u0000${entry.label}`).join('\u0001');
		if (signature === this._entriesSignature) {
			return false;
		}

		this._entries = entries;
		this._entriesSignature = signature;
		return true;
	}

	get entries(): ChatOutlineEntry[] {
		return this._entries;
	}

	get uri(): URI | undefined {
		return this._widget.viewModel?.sessionResource;
	}

	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get activeElement(): ChatOutlineEntry | undefined {
		const focus = this._widget.getFocus();
		if (!focus) {
			return undefined;
		}
		return this._entries.find(entry => entry.element === focus);
	}

	reveal(entry: ChatOutlineEntry, _options: IEditorOptions, _sideBySide: boolean, _select: boolean): void {
		const item: ChatTreeItem = entry.element;
		this._widget.reveal(item);
		this._widget.focus(item);
	}

	preview(entry: ChatOutlineEntry): IDisposable {
		this._widget.reveal(entry.element);
		return Disposable.None;
	}

	captureViewState(): IDisposable {
		return Disposable.None;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

