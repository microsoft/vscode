/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { trackFocus } from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { IconLabel } from '../../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService, IContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatTodo, IChatTodoListService } from '../../../common/tools/chatTodoListService.js';

class TodoListDelegate implements IListVirtualDelegate<IChatTodo> {
	getHeight(element: IChatTodo): number {
		return 22;
	}

	getTemplateId(element: IChatTodo): string {
		return TodoListRenderer.TEMPLATE_ID;
	}
}

interface ITodoListTemplate {
	readonly templateDisposables: DisposableStore;
	readonly todoElement: HTMLElement;
	readonly statusIcon: HTMLElement;
	readonly iconLabel: IconLabel;
}

class TodoListRenderer implements IListRenderer<IChatTodo, ITodoListTemplate> {
	static TEMPLATE_ID = 'todoListRenderer';
	readonly templateId: string = TodoListRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITodoListTemplate {
		const templateDisposables = new DisposableStore();
		const todoElement = dom.append(container, dom.$('li.todo-item'));
		todoElement.setAttribute('role', 'listitem');

		const statusIcon = dom.append(todoElement, dom.$('.todo-status-icon.codicon'));
		statusIcon.setAttribute('aria-hidden', 'true');

		const todoContent = dom.append(todoElement, dom.$('.todo-content'));
		const iconLabel = templateDisposables.add(new IconLabel(todoContent, { supportIcons: false }));

		return { templateDisposables, todoElement, statusIcon, iconLabel };
	}

	renderElement(todo: IChatTodo, index: number, templateData: ITodoListTemplate): void {
		const { todoElement, statusIcon, iconLabel } = templateData;

		// Update status icon
		statusIcon.className = `todo-status-icon codicon ${this.getStatusIconClass(todo.status)}`;
		statusIcon.style.color = this.getStatusIconColor(todo.status);

		iconLabel.setLabel(todo.title);

		// Update aria-label
		const statusText = this.getStatusText(todo.status);
		const ariaLabel = localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
		todoElement.setAttribute('aria-label', ariaLabel);
	}

	disposeTemplate(templateData: ITodoListTemplate): void {
		templateData.templateDisposables.dispose();
	}

	private getStatusText(status: string): string {
		switch (status) {
			case 'completed':
				return localize('chat.todoList.status.completed', 'completed');
			case 'in-progress':
				return localize('chat.todoList.status.inProgress', 'in progress');
			case 'not-started':
			default:
				return localize('chat.todoList.status.notStarted', 'not started');
		}
	}

	private getStatusIconClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'codicon-pass';
			case 'in-progress':
				return 'codicon-record';
			case 'not-started':
			default:
				return 'codicon-circle-outline';
		}
	}

	private getStatusIconColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'var(--vscode-charts-green)';
			case 'in-progress':
				return 'var(--vscode-charts-blue)';
			case 'not-started':
			default:
				return 'var(--vscode-foreground)';
		}
	}
}

const collapsedTodoTitleFlipDuration = 450;
const collapsedTodoIconCompleteDuration = 350;
const collapsedTodoIconHoldDuration = 100;

interface ICollapsedTodoTitleContent {
	readonly key: string;
	readonly content: HTMLElement;
}

export class ChatTodoListWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private _isExpanded: boolean = false;
	private _userManuallyExpanded: boolean = false;
	private expandoButton!: Button;
	private expandIcon!: HTMLElement;
	private titleElement!: HTMLElement;
	private todoListContainer!: HTMLElement;
	private clearButtonContainer!: HTMLElement;
	private clearButton!: Button;
	private _currentSessionResource: URI | undefined;
	private _todoList: WorkbenchList<IChatTodo> | undefined;
	private _collapsedTitleKey: string | undefined;
	private readonly _collapsedTitleAnimation = this._register(new MutableDisposable<IDisposable>());

	private readonly _inChatTodoListContextKey: IContextKey<boolean>;

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this._inChatTodoListContextKey = ChatContextKeys.inChatTodoList.bindTo(contextKeyService);
		this.domNode = this.createChatTodoWidget();

		// Track focus state for context key
		const focusTracker = this._register(trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this._inChatTodoListContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this._inChatTodoListContextKey.set(false)));

		// Listen to context key changes to update clear button state when request state changes
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([ChatContextKeys.requestInProgress.key]))) {
				this.updateClearButtonState();
			}
		}));
	}

	public get height(): number {
		return this.domNode.style.display === 'none' ? 0 : this.domNode.offsetHeight;
	}

	private hideWidget(): void {
		this.domNode.style.display = 'none';
	}

	private getExpandedMaxHeight(): string {
		const currentListHeight = this._todoList?.getHTMLElement().style.height;
		const parsedHeight = currentListHeight ? Number.parseFloat(currentListHeight) : 0;
		return `${parsedHeight + 4}px`;
	}

	private setExpanded(expanded: boolean): void {
		this._isExpanded = expanded;
		this.expandoButton.element.setAttribute('aria-expanded', String(expanded));
		this.todoListContainer.classList.toggle('collapsed', !expanded);
		this.todoListContainer.setAttribute('aria-hidden', String(!expanded));
		this.todoListContainer.style.maxHeight = expanded ? this.getExpandedMaxHeight() : '0px';

		this.expandIcon.classList.toggle('codicon-chevron-down', expanded);
		this.expandIcon.classList.toggle('codicon-chevron-right', !expanded);
	}

	private createChatTodoWidget(): HTMLElement {
		const container = dom.$('.chat-todo-list-widget');
		container.style.display = 'none';

		const expandoContainer = dom.$('.todo-list-expand');
		this.expandoButton = this._register(new Button(expandoContainer, {
			supportIcons: true
		}));
		this.expandoButton.element.setAttribute('aria-expanded', String(this._isExpanded));
		this.expandoButton.element.setAttribute('aria-controls', 'todo-list-container');

		// Create title section to group icon and title
		const titleSection = dom.$('.todo-list-title-section');

		this.expandIcon = dom.$('.expand-icon.codicon');
		this.expandIcon.classList.add(this._isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');
		this.expandIcon.setAttribute('aria-hidden', 'true');

		this.titleElement = dom.$('.todo-list-title');
		this.titleElement.id = 'todo-list-title';
		this.titleElement.textContent = localize('chat.todoList.title', 'Todos');

		// Add clear button container to the expand element
		this.clearButtonContainer = dom.$('.todo-clear-button-container');
		this.createClearButton();

		titleSection.appendChild(this.expandIcon);
		titleSection.appendChild(this.titleElement);

		this.expandoButton.element.appendChild(titleSection);
		this.expandoButton.element.appendChild(this.clearButtonContainer);

		this.todoListContainer = dom.$('.todo-list-container');
		this.todoListContainer.id = 'todo-list-container';
		this.todoListContainer.setAttribute('role', 'list');
		this.todoListContainer.setAttribute('aria-labelledby', 'todo-list-title');
		this.todoListContainer.style.maxHeight = '0px';

		container.appendChild(expandoContainer);
		container.appendChild(this.todoListContainer);
		this.setExpanded(this._isExpanded);

		this._register(this.expandoButton.onDidClick(() => {
			this.toggleExpanded();
		}));

		return container;
	}

	private createClearButton(): void {
		this.clearButton = new Button(this.clearButtonContainer, {
			supportIcons: true,
			ariaLabel: localize('chat.todoList.clearButton', 'Clear all todos'),
		});
		this.clearButton.element.tabIndex = 0;
		this.clearButton.icon = Codicon.clearAll;
		this._register(this.clearButton);

		this._register(this.clearButton.onDidClick(() => {
			this.clearAllTodos();
		}));
	}

	public render(sessionResource: URI | undefined): void {
		if (!sessionResource) {
			this.hideWidget();
			return;
		}

		if (!isEqual(this._currentSessionResource, sessionResource)) {
			this._userManuallyExpanded = false;
			this._currentSessionResource = sessionResource;
			this.hideWidget();
		}

		this.updateTodoDisplay();
	}

	public clear(sessionResource: URI | undefined, force: boolean = false): void {
		if (!sessionResource || this.domNode.style.display === 'none') {
			return;
		}

		const currentTodos = this.chatTodoListService.getTodos(sessionResource);
		const shouldClear = force || (currentTodos.length > 0 && !currentTodos.some(todo => todo.status !== 'completed'));
		if (shouldClear) {
			this.clearAllTodos();
		}
	}

	public hasTodos(): boolean {
		return this.domNode.classList.contains('has-todos') && !!this._todoList && this._todoList.length > 0;
	}

	public hasFocus(): boolean {
		return dom.isAncestorOfActiveElement(this.todoListContainer);
	}

	public focus(): boolean {
		if (!this.hasTodos()) {
			return false;
		}

		if (!this._isExpanded) {
			this.toggleExpanded();
		}

		this._todoList?.domFocus();
		return this.hasFocus();
	}

	private updateTodoDisplay(): void {
		if (!this._currentSessionResource) {
			return;
		}

		const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
		const shouldShow = todoList.length > 0;

		if (!shouldShow) {
			this.domNode.classList.remove('has-todos');
			return;
		}

		this.domNode.classList.add('has-todos');
		this.renderTodoList(todoList);
		this.domNode.style.display = 'block';
	}

	private renderTodoList(todoList: IChatTodo[]): void {
		const allIncomplete = todoList.every(todo => todo.status === 'not-started');
		if (allIncomplete) {
			this._userManuallyExpanded = false;
		}

		// Create or update the WorkbenchList
		if (!this._todoList) {
			this._todoList = this._register(this.instantiationService.createInstance(
				WorkbenchList<IChatTodo>,
				'ChatTodoListRenderer',
				this.todoListContainer,
				new TodoListDelegate(),
				[new TodoListRenderer()],
				{
					alwaysConsumeMouseWheel: false,
					accessibilityProvider: {
						getAriaLabel: (todo: IChatTodo) => {
							const statusText = this.getStatusText(todo.status);
							return localize('chat.todoList.item', '{0}, {1}', todo.title, statusText);
						},
						getWidgetAriaLabel: () => localize('chatTodoList', 'Chat Todo List')
					}
				}
			));
		}

		// Update list contents
		const maxItemsShown = 6;
		const itemsShown = Math.min(todoList.length, maxItemsShown);
		const height = itemsShown * 22;
		this._todoList.layout(height);
		this._todoList.getHTMLElement().style.height = `${height}px`;
		this.todoListContainer.style.maxHeight = this._isExpanded ? this.getExpandedMaxHeight() : '0px';
		this._todoList.splice(0, this._todoList.length, todoList);

		const hasInProgressTask = todoList.some(todo => todo.status === 'in-progress');
		const hasCompletedTask = todoList.some(todo => todo.status === 'completed');

		// Update clear button state based on request progress
		this.updateClearButtonState();

		// Only auto-collapse if there are in-progress or completed tasks AND user hasn't manually expanded
		if ((hasInProgressTask || hasCompletedTask) && this._isExpanded && !this._userManuallyExpanded) {
			this.setExpanded(false);
			// Clear the key so the first collapsed title renders without animation.
			// The expanded title content in the DOM would cause a broken flip animation.
			this._collapsedTitleKey = undefined;
			this._collapsedTitleAnimation.clear();
		}

		this.updateTitleElement(this.titleElement, todoList);
	}

	private toggleExpanded(): void {
		this.setExpanded(!this._isExpanded);
		this._userManuallyExpanded = true;

		if (this._currentSessionResource) {
			const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
			this.updateTitleElement(this.titleElement, todoList);
		}
	}

	private clearAllTodos(): void {
		if (!this._currentSessionResource) {
			return;
		}

		this.chatTodoListService.setTodos(this._currentSessionResource, []);
		this.hideWidget();
	}

	private updateClearButtonState(): void {
		if (!this._currentSessionResource) {
			return;
		}

		const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
		const hasInProgressTask = todoList.some(todo => todo.status === 'in-progress');
		const isRequestInProgress = ChatContextKeys.requestInProgress.getValue(this.contextKeyService) ?? false;
		const shouldDisable = isRequestInProgress && hasInProgressTask;

		this.clearButton.enabled = !shouldDisable;

		// Update tooltip based on state
		if (shouldDisable) {
			this.clearButton.setTitle(localize('chat.todoList.clearButton.disabled', 'Cannot clear todos while a task is in progress'));
		} else {
			this.clearButton.setTitle(localize('chat.todoList.clearButton', 'Clear all todos'));
		}
	}

	private updateTitleElement(titleElement: HTMLElement, todoList: IChatTodo[]): void {
		const completedCount = todoList.filter(todo => todo.status === 'completed').length;
		const totalCount = todoList.length;
		const inProgressTodos = todoList.filter(todo => todo.status === 'in-progress');
		const firstInProgressTodo = inProgressTodos.length > 0 ? inProgressTodos[0] : undefined;
		const notStartedTodos = todoList.filter(todo => todo.status === 'not-started');
		const firstNotStartedTodo = notStartedTodos.length > 0 ? notStartedTodos[0] : undefined;
		const currentTaskNumber = inProgressTodos.length > 0 ? completedCount + 1 : Math.max(1, completedCount);

		const expandButtonLabel = this._isExpanded
			? localize('chat.todoList.collapseButton', 'Collapse Todos')
			: localize('chat.todoList.expandButton', 'Expand Todos');
		this.expandoButton.element.setAttribute('aria-label', expandButtonLabel);
		this.expandoButton.element.setAttribute('aria-expanded', this._isExpanded ? 'true' : 'false');

		if (this._isExpanded) {
			this._collapsedTitleAnimation.clear();
			this._collapsedTitleKey = undefined;

			const { content: titleText } = this.createTitleContent(totalCount > 0 ?
				localize('chat.todoList.titleWithCount', 'Todos ({0}/{1})', currentTaskNumber, totalCount) :
				localize('chat.todoList.title', 'Todos'));
			this.renderTitleContent(titleText);
		} else {
			let collapsedTitleContent: ICollapsedTodoTitleContent | undefined;

			// Show first in-progress todo, or if none, the first not-started todo
			const todoToShow = firstInProgressTodo || firstNotStartedTodo;
			if (todoToShow) {
				const { content } = this.createTitleContent(
					localize('chat.todoList.currentTask', '{0} ({1}/{2})', todoToShow.title, currentTaskNumber, totalCount),
					todoToShow === firstInProgressTodo
						? { codicon: 'codicon-record', color: 'var(--vscode-charts-blue)' }
						: { codicon: 'codicon-circle-outline', color: 'var(--vscode-foreground)' }
				);
				collapsedTitleContent = {
					key: `${todoToShow.status}:${todoToShow.title}:${currentTaskNumber}:${totalCount}`,
					content
				};
			}
			// Show "Done" when all tasks are completed
			else if (completedCount > 0 && completedCount === totalCount) {
				const { content } = this.createTitleContent(localize('chat.todoList.titleWithCount', 'Todos ({0}/{1})', totalCount, totalCount));
				collapsedTitleContent = {
					key: `done:${totalCount}`,
					content
				};
			}

			if (!collapsedTitleContent) {
				this._collapsedTitleAnimation.clear();
				this._collapsedTitleKey = undefined;
				dom.clearNode(titleElement);
				return;
			}

			const shouldAnimate = this.shouldAnimateCollapsedTitle(collapsedTitleContent.key);
			if (shouldAnimate) {
				this.animateCollapsedTitleContent(collapsedTitleContent);
			} else {
				this._collapsedTitleAnimation.clear();
				this._collapsedTitleKey = collapsedTitleContent.key;
				this.renderTitleContent(collapsedTitleContent.content);
			}
		}
	}

	private shouldAnimateCollapsedTitle(nextKey: string): boolean {
		if (!this._collapsedTitleKey || this._collapsedTitleKey === nextKey || this.domNode.style.display === 'none') {
			return false;
		}

		return !dom.getWindow(this.domNode).matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	private animateCollapsedTitleContent(nextContent: ICollapsedTodoTitleContent): void {
		const previousContent = this.settleCollapsedTitleContent();
		if (!previousContent) {
			this._collapsedTitleKey = nextContent.key;
			this.renderTitleContent(nextContent.content);
			return;
		}

		this._collapsedTitleAnimation.clear();

		const startFlip = () => {
			previousContent.classList.add('animating-out');
			nextContent.content.classList.add('animating-in');
			titleAppend(this.titleElement, nextContent.content);
			this._collapsedTitleKey = nextContent.key;

			this._collapsedTitleAnimation.value = disposableTimeout(() => {
				previousContent.remove();
				nextContent.content.classList.remove('animating-in');
			}, collapsedTodoTitleFlipDuration);
		};

		// If the outgoing content was an in-progress task, briefly show the
		// icon turning into a completed check before starting the flip
		const wasInProgress = this._collapsedTitleKey?.startsWith('in-progress:');
		const iconElement = previousContent.firstElementChild as HTMLElement | null;
		if (wasInProgress && iconElement) {
			iconElement.className = 'todo-list-title-content-icon codicon codicon-pass completing';
			iconElement.style.color = 'var(--vscode-charts-green)';

			// Show the checkmark animation, hold briefly so it's visible, then flip
			this._collapsedTitleAnimation.value = disposableTimeout(() => {
				startFlip();
			}, collapsedTodoIconCompleteDuration + collapsedTodoIconHoldDuration);
		} else {
			startFlip();
		}
	}

	private settleCollapsedTitleContent(): HTMLElement | undefined {
		// Only settle content that was rendered by the collapsed path
		if (this._isExpanded || !this._collapsedTitleKey) {
			return undefined;
		}

		const latestContent = this.titleElement.lastElementChild as HTMLElement | null;
		if (!latestContent || !latestContent.classList.contains('todo-list-title-content')) {
			return undefined;
		}

		dom.clearNode(this.titleElement);
		latestContent.classList.remove('animating-in', 'animating-out');
		titleAppend(this.titleElement, latestContent);
		return latestContent;
	}

	private renderTitleContent(content: HTMLElement): void {
		dom.clearNode(this.titleElement);
		titleAppend(this.titleElement, content);
	}

	private createTitleContent(text: string, icon?: { codicon: string; color: string }): { content: HTMLElement } {
		const content = dom.$('.todo-list-title-content');

		if (icon) {
			const iconElement = dom.append(content, dom.$(`.todo-list-title-content-icon.codicon.${icon.codicon}`));
			iconElement.style.color = icon.color;
			iconElement.setAttribute('aria-hidden', 'true');
		}

		const titleText = dom.append(content, dom.$('span.todo-list-title-content-text'));
		titleText.textContent = text;
		return { content };
	}

	private getStatusText(status: string): string {
		switch (status) {
			case 'completed':
				return localize('chat.todoList.status.completed', 'completed');
			case 'in-progress':
				return localize('chat.todoList.status.inProgress', 'in progress');
			case 'not-started':
			default:
				return localize('chat.todoList.status.notStarted', 'not started');
		}
	}
}

function titleAppend(container: HTMLElement, content: HTMLElement): void {
	container.appendChild(content);
}
