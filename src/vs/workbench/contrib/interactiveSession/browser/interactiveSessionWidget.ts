/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { ITreeElement } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/interactiveSession';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { foreground } from 'vs/platform/theme/common/colorRegistry';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { InteractiveListItemRenderer, InteractiveSessionAccessibilityProvider, InteractiveSessionListDelegate, InteractiveTreeItem } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionInputOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionViewModel, IInteractiveSessionViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const $ = dom.$;

export const CONTEXT_IN_INTERACTIVE_INPUT = new RawContextKey<boolean>('inInteractiveInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the interactive input, false otherwise.") });
export const CONTEXT_IN_INTERACTIVE_SESSION = new RawContextKey<boolean>('inInteractiveSession', false, { type: 'boolean', description: localize('inInteractiveSession', "True when focus is in the interactive session widget, false otherwise.") });

function revealLastElement(list: WorkbenchObjectTree<any>) {
	list.scrollTop = list.scrollHeight - list.renderHeight;
}

export class InteractiveSessionWidget extends Disposable {
	private static readonly widgetsByInputUri = new Map<string, InteractiveSessionWidget>();
	static getViewByInputUri(inputUri: URI): InteractiveSessionWidget | undefined {
		return InteractiveSessionWidget.widgetsByInputUri.get(inputUri.toString());
	}

	private static _counter = 0;
	private readonly inputUri = URI.parse(`interactiveSessionInput:input-${InteractiveSessionWidget._counter++}`);

	private tree!: WorkbenchObjectTree<InteractiveTreeItem>;
	private renderer!: InteractiveListItemRenderer;
	private inputEditor!: CodeEditorWidget;
	private inputOptions!: InteractiveSessionInputOptions;
	private inputModel: ITextModel | undefined;
	private listContainer!: HTMLElement;
	private container!: HTMLElement;
	private welcomeViewContainer!: HTMLElement;
	private welcomeViewDisposables = this._register(new DisposableStore());
	private bodyDimension: dom.Dimension | undefined;
	private visible = false;

	private previousTreeScrollHeight: number = 0;

	private viewModel: IInteractiveSessionViewModel | undefined;
	private viewModelDisposables = new DisposableStore();

	constructor(
		private readonly providerId: string,
		private readonly viewId: string | undefined,
		private readonly listBackgroundColorDelegate: () => string,
		private readonly inputEditorBackgroundColorDelegate: () => string,
		private readonly resultEditorBackgroundColorDelegate: () => string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService
	) {
		super();
		CONTEXT_IN_INTERACTIVE_SESSION.bindTo(contextKeyService).set(true);

		InteractiveSessionWidget.widgetsByInputUri.set(this.inputUri.toString(), this);
		this.initializeSessionModel(true);
	}

	render(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.interactive-session'));
		this.listContainer = dom.append(this.container, $(`.interactive-list`));

		this.inputOptions = this._register(this.instantiationService.createInstance(InteractiveSessionInputOptions, this.viewId, this.inputEditorBackgroundColorDelegate, this.resultEditorBackgroundColorDelegate));
		this.renderWelcomeView(this.container);
		this.createList(this.listContainer);
		this.createInput(this.container);

		this._register(this.inputOptions.onDidChange(() => this.onDidStyleChange()));
		this.onDidStyleChange();

		// Do initial render
		if (this.viewModel) {
			this.onDidChangeItems();
		}
	}

	focusInput(): void {
		this.inputEditor.focus();
	}

	private onDidChangeItems() {
		if (this.tree && this.visible && this.viewModel) {
			const items = this.viewModel.getItems();
			const treeItems = items.map(item => {
				return <ITreeElement<InteractiveTreeItem>>{
					element: item,
					collapsed: false,
					collapsible: false
				};
			});

			if (treeItems.length) {
				this.setWelcomeViewVisible(false);
				const lastItem = treeItems[treeItems.length - 1];
				this.tree.setChildren(null, treeItems, {
					diffIdentityProvider: {
						getId(element) {
							const isLastAndResponse = isResponseVM(element) && element === lastItem.element;
							return element.id + (isLastAndResponse ? '_last' : '');
						},
					}
				});
				revealLastElement(this.tree);
			}
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) {
			if (!this.inputModel) {
				this.inputModel = this.modelService.getModel(this.inputUri) || this.modelService.createModel('', null, this.inputUri, true);
			}
			this.setModeAsync();
			this.inputEditor.setModel(this.inputModel);

			// Not sure why this is needed- the view is being rendered before it's visible, and then the list content doesn't show up
			this.onDidChangeItems();
		}
	}

	private onDidStyleChange(): void {
		this.container.style.setProperty('--vscode-interactive-result-editor-background-color', this.inputOptions.configuration.resultEditor.backgroundColor?.toString() ?? '');
	}

	private setModeAsync(): void {
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.inputModel!.setLanguage('markdown');
		});
	}

	private async renderWelcomeView(container: HTMLElement): Promise<void> {
		if (this.welcomeViewContainer) {
			dom.clearNode(this.welcomeViewContainer);
		} else {
			this.welcomeViewContainer = dom.append(container, $('.interactive-session-welcome-view'));
		}

		this.welcomeViewDisposables.clear();
		const suggestions = await this.interactiveSessionService.provideSuggestions(this.providerId, CancellationToken.None);
		const suggElements = suggestions?.map(sugg => {
			const button = this.welcomeViewDisposables.add(new Button(this.welcomeViewContainer, defaultButtonStyles));
			button.label = `"${sugg}"`;
			this.welcomeViewDisposables.add(button.onDidClick(() => this.acceptInput(sugg)));
			return button;
		});
		if (suggElements && suggElements.length > 0) {
			this.setWelcomeViewVisible(true);
		} else {
			this.setWelcomeViewVisible(false);
		}
	}

	private setWelcomeViewVisible(visible: boolean): void {
		if (visible) {
			dom.show(this.welcomeViewContainer);
			dom.hide(this.listContainer);
		} else {
			dom.hide(this.welcomeViewContainer);
			dom.show(this.listContainer);
		}
	}

	private createList(listContainer: HTMLElement): void {
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
		const delegate = scopedInstantiationService.createInstance(InteractiveSessionListDelegate);
		this.renderer = scopedInstantiationService.createInstance(InteractiveListItemRenderer, this.inputOptions, { getListLength: () => this.tree.getNode(null).visibleChildrenCount });
		this.tree = <WorkbenchObjectTree<InteractiveTreeItem>>scopedInstantiationService.createInstance(
			WorkbenchObjectTree,
			'InteractiveSession',
			listContainer,
			delegate,
			[this.renderer],
			{
				identityProvider: { getId: (e: InteractiveTreeItem) => e.id },
				supportDynamicHeights: false,
				hideTwistiesOfChildlessElements: true,
				accessibilityProvider: new InteractiveSessionAccessibilityProvider(),
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: InteractiveTreeItem) => isRequestVM(e) ? e.model.message : e.response.value },
				setRowLineHeight: false,
				overrideStyles: {
					listFocusBackground: this.listBackgroundColorDelegate(),
					listInactiveFocusBackground: this.listBackgroundColorDelegate(),
					listActiveSelectionBackground: this.listBackgroundColorDelegate(),
					listFocusAndSelectionBackground: this.listBackgroundColorDelegate(),
					listInactiveSelectionBackground: this.listBackgroundColorDelegate(),
					listHoverBackground: this.listBackgroundColorDelegate(),
					listBackground: this.listBackgroundColorDelegate(),
					listFocusForeground: foreground,
					listHoverForeground: foreground,
					listInactiveFocusForeground: foreground,
					listInactiveSelectionForeground: foreground,
					listActiveSelectionForeground: foreground,
					listFocusAndSelectionForeground: foreground,
				}
			});

		this._register(this.tree.onDidChangeContentHeight(() => {
			this.onDidChangeTreeContentHeight();
		}));
		this._register(this.renderer.onDidChangeItemHeight(e => {
			this.tree.updateElementHeight(e.element, e.height);
			this.onDidChangeTreeContentHeight();
		}));
		this._register(this.renderer.onDidSelectFollowup(followup => {
			this.acceptInput(followup);
		}));
	}

	private onDidChangeTreeContentHeight(): void {
		if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
			// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
			// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
			// const lastElementWasVisible = this.list.scrollTop + this.list.renderHeight >= this.previousTreeScrollHeight - 2;
			const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight;
			if (lastElementWasVisible) {
				setTimeout(() => {
					// Can't set scrollTop during this event listener, the list might overwrite the change
					revealLastElement(this.tree);
				}, 0);
			}
		}

		this.previousTreeScrollHeight = this.tree.scrollHeight;
	}

	private createInput(container: HTMLElement): void {
		const inputContainer = dom.append(container, $('.interactive-input-wrapper'));

		const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
		CONTEXT_IN_INTERACTIVE_INPUT.bindTo(inputScopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService]));

		const options = getSimpleEditorOptions();
		options.readOnly = false;
		options.ariaLabel = localize('interactiveSessionInput', "Interactive Session Input");
		options.fontFamily = DEFAULT_FONT_FAMILY;
		options.fontSize = 13;
		options.lineHeight = 20;
		options.padding = { top: 8, bottom: 7 };
		options.cursorWidth = 1;
		options.wrappingStrategy = 'advanced';

		this.inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, inputContainer, options, getSimpleCodeEditorWidgetOptions()));

		this._register(this.inputEditor.onDidChangeModelContent(() => {
			if (this.bodyDimension) {
				this.layout(this.bodyDimension.height, this.bodyDimension.width);
			}
		}));

		this._register(dom.addStandardDisposableListener(inputContainer, dom.EventType.FOCUS, () => inputContainer.classList.add('synthetic-focus')));
		this._register(dom.addStandardDisposableListener(inputContainer, dom.EventType.BLUR, () => inputContainer.classList.remove('synthetic-focus')));
	}

	private async initializeSessionModel(initial = false) {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const model = await this.interactiveSessionService.startSession(this.providerId, initial, CancellationToken.None);
		if (!model) {
			throw new Error('Failed to start session');
		}

		this.viewModel = new InteractiveSessionViewModel(model);
		this.viewModelDisposables.add(this.viewModel.onDidChange(() => this.onDidChangeItems()));
		this.viewModelDisposables.add(this.viewModel.onDidDispose(() => {
			this.viewModel = undefined;
			this.viewModelDisposables.clear();
			this.onDidChangeItems();
		}));

		if (this.tree) {
			this.onDidChangeItems();
		}
	}

	async acceptInput(query?: string): Promise<void> {
		if (!this.viewModel) {
			await this.initializeSessionModel();
		}

		if (this.viewModel) {
			const input = query ?? this.inputEditor.getValue();
			if (this.interactiveSessionService.sendRequest(this.viewModel.sessionId, input, CancellationToken.None)) {
				this.inputEditor.setValue('');
			}
		}
	}

	focusLastMessage(): void {
		if (!this.viewModel) {
			return;
		}

		const items = this.viewModel.getItems();
		const lastItem = items[items.length - 1];
		if (!lastItem) {
			return;
		}

		this.tree.setFocus([lastItem]);
		this.tree.domFocus();
	}

	clear(): void {
		if (this.viewModel) {
			this.interactiveSessionService.clearSession(this.viewModel.sessionId);
			this.focusInput();
			this.renderWelcomeView(this.container);
		}
	}

	layout(height: number, width: number): void {
		this.bodyDimension = new dom.Dimension(width, height);
		const inputHeight = Math.min(this.inputEditor.getContentHeight(), height);
		const inputWrapperPadding = 24;
		const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
		const listHeight = height - inputHeight - inputWrapperPadding;

		this.tree.layout(listHeight, width);
		this.tree.getHTMLElement().style.height = `${listHeight}px`;
		this.renderer.layout(width);
		if (lastElementVisible) {
			revealLastElement(this.tree);
		}

		this.welcomeViewContainer.style.height = `${height - inputHeight - inputWrapperPadding}px`;
		this.listContainer.style.height = `${height - inputHeight - inputWrapperPadding}px`;

		this.inputEditor.layout({ width: width - inputWrapperPadding, height: inputHeight });
	}
}
