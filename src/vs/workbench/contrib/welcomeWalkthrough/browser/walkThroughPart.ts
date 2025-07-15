/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../common/walkThroughUtils.js';
import './media/walkThroughPart.css';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { EventType as TouchEventType, GestureEvent, Gesture } from '../../../../base/browser/touch.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import * as strings from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IDisposable, dispose, toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEditorMemento, IEditorOpenContext } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { WalkThroughInput } from './walkThroughInput.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { localize } from '../../../../nls.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { RawContextKey, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { isObject } from '../../../../base/common/types.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions as ICodeEditorOptions, EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { UILabelProvider } from '../../../../base/common/keybindingLabels.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { deepClone } from '../../../../base/common/objects.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { addDisposableListener, Dimension, isHTMLAnchorElement, isHTMLButtonElement, isHTMLElement, size } from '../../../../base/browser/dom.js';
import { safeInnerHtml } from '../../../../base/browser/domSanitize.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

export const WALK_THROUGH_FOCUS = new RawContextKey<boolean>('interactivePlaygroundFocus', false);

const UNBOUND_COMMAND = localize('walkThrough.unboundCommand', "unbound");
const WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'walkThroughEditorViewState';

interface IViewState {
	scrollTop: number;
	scrollLeft: number;
}

interface IWalkThroughEditorViewState {
	viewState: IViewState;
}

export class WalkThroughPart extends EditorPane {

	static readonly ID: string = 'workbench.editor.walkThroughPart';

	private readonly disposables = new DisposableStore();
	private contentDisposables: IDisposable[] = [];
	private content!: HTMLDivElement;
	private scrollbar!: DomScrollableElement;
	private editorFocus: IContextKey<boolean>;
	private lastFocus: HTMLElement | undefined;
	private size: Dimension | undefined;
	private editorMemento: IEditorMemento<IWalkThroughEditorViewState>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
	) {
		super(WalkThroughPart.ID, group, telemetryService, themeService, storageService);
		this.editorFocus = WALK_THROUGH_FOCUS.bindTo(this.contextKeyService);
		this.editorMemento = this.getEditorMemento<IWalkThroughEditorViewState>(editorGroupService, textResourceConfigurationService, WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY);
	}

	protected createEditor(container: HTMLElement): void {
		this.content = document.createElement('div');
		this.content.classList.add('welcomePageFocusElement');
		this.content.tabIndex = 0;
		this.content.style.outlineStyle = 'none';

		this.scrollbar = new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto
		});
		this.disposables.add(this.scrollbar);
		container.appendChild(this.scrollbar.getDomNode());

		this.registerFocusHandlers();
		this.registerClickHandler();

		this.disposables.add(this.scrollbar.onScroll(e => this.updatedScrollPosition()));
	}

	private updatedScrollPosition() {
		const scrollDimensions = this.scrollbar.getScrollDimensions();
		const scrollPosition = this.scrollbar.getScrollPosition();
		const scrollHeight = scrollDimensions.scrollHeight;
		if (scrollHeight && this.input instanceof WalkThroughInput) {
			const scrollTop = scrollPosition.scrollTop;
			const height = scrollDimensions.height;
			this.input.relativeScrollPosition(scrollTop / scrollHeight, (scrollTop + height) / scrollHeight);
		}
	}

	private onTouchChange(event: GestureEvent) {
		event.preventDefault();
		event.stopPropagation();

		const scrollPosition = this.scrollbar.getScrollPosition();
		this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - event.translationY });
	}

	private addEventListener<K extends keyof HTMLElementEventMap, E extends HTMLElement>(element: E, type: K, listener: (this: E, ev: HTMLElementEventMap[K]) => any, useCapture?: boolean): IDisposable;
	private addEventListener<E extends HTMLElement>(element: E, type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): IDisposable;
	private addEventListener<E extends HTMLElement>(element: E, type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): IDisposable {
		element.addEventListener(type, listener, useCapture);
		return toDisposable(() => { element.removeEventListener(type, listener, useCapture); });
	}

	private registerFocusHandlers() {
		this.disposables.add(this.addEventListener(this.content, 'mousedown', e => {
			this.focus();
		}));
		this.disposables.add(this.addEventListener(this.content, 'focus', e => {
			this.editorFocus.set(true);
		}));
		this.disposables.add(this.addEventListener(this.content, 'blur', e => {
			this.editorFocus.reset();
		}));
		this.disposables.add(this.addEventListener(this.content, 'focusin', (e: FocusEvent) => {
			// Work around scrolling as side-effect of setting focus on the offscreen zone widget (#18929)
			if (isHTMLElement(e.target) && e.target.classList.contains('zone-widget-container')) {
				const scrollPosition = this.scrollbar.getScrollPosition();
				this.content.scrollTop = scrollPosition.scrollTop;
				this.content.scrollLeft = scrollPosition.scrollLeft;
			}
			if (isHTMLElement(e.target)) {
				this.lastFocus = e.target;
			}
		}));
	}

	private registerClickHandler() {
		this.content.addEventListener('click', event => {
			for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
				if (isHTMLAnchorElement(node) && node.href) {
					const baseElement = node.ownerDocument.getElementsByTagName('base')[0] || this.window.location;
					if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {
						const scrollTarget = this.content.querySelector(node.hash);
						const innerContent = this.content.firstElementChild;
						if (scrollTarget && innerContent) {
							const targetTop = scrollTarget.getBoundingClientRect().top - 20;
							const containerTop = innerContent.getBoundingClientRect().top;
							this.scrollbar.setScrollPosition({ scrollTop: targetTop - containerTop });
						}
					} else {
						this.open(URI.parse(node.href));
					}
					event.preventDefault();
					break;
				} else if (isHTMLButtonElement(node)) {
					const href = node.getAttribute('data-href');
					if (href) {
						this.open(URI.parse(href));
					}
					break;
				} else if (node === event.currentTarget) {
					break;
				}
			}
		});
	}

	private open(uri: URI) {
		if (uri.scheme === 'command' && uri.path === 'git.clone' && !CommandsRegistry.getCommand('git.clone')) {
			this.notificationService.info(localize('walkThrough.gitNotFound', "It looks like Git is not installed on your system."));
			return;
		}
		this.openerService.open(this.addFrom(uri), { allowCommands: true });
	}

	private addFrom(uri: URI) {
		if (uri.scheme !== 'command' || !(this.input instanceof WalkThroughInput)) {
			return uri;
		}
		const query = uri.query ? JSON.parse(uri.query) : {};
		query.from = this.input.getTelemetryFrom();
		return uri.with({ query: JSON.stringify(query) });
	}

	layout(dimension: Dimension): void {
		this.size = dimension;
		size(this.content, dimension.width, dimension.height);
		this.updateSizeClasses();
		this.contentDisposables.forEach(disposable => {
			if (disposable instanceof CodeEditorWidget) {
				disposable.layout();
			}
		});
		const walkthroughInput = this.input instanceof WalkThroughInput && this.input;
		if (walkthroughInput && walkthroughInput.layout) {
			walkthroughInput.layout(dimension);
		}
		this.scrollbar.scanDomNode();
	}

	private updateSizeClasses() {
		const innerContent = this.content.firstElementChild;
		if (this.size && innerContent) {
			innerContent.classList.toggle('max-height-685px', this.size.height <= 685);
		}
	}

	override focus(): void {
		super.focus();

		let active = this.content.ownerDocument.activeElement;
		while (active && active !== this.content) {
			active = active.parentElement;
		}
		if (!active) {
			(this.lastFocus || this.content).focus();
		}
		this.editorFocus.set(true);
	}

	arrowUp() {
		const scrollPosition = this.scrollbar.getScrollPosition();
		this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - this.getArrowScrollHeight() });
	}

	arrowDown() {
		const scrollPosition = this.scrollbar.getScrollPosition();
		this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + this.getArrowScrollHeight() });
	}

	private getArrowScrollHeight() {
		let fontSize = this.configurationService.getValue('editor.fontSize');
		if (typeof fontSize !== 'number' || fontSize < 1) {
			fontSize = 12;
		}
		return 3 * (fontSize as number);
	}

	pageUp() {
		const scrollDimensions = this.scrollbar.getScrollDimensions();
		const scrollPosition = this.scrollbar.getScrollPosition();
		this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - scrollDimensions.height });
	}

	pageDown() {
		const scrollDimensions = this.scrollbar.getScrollDimensions();
		const scrollPosition = this.scrollbar.getScrollPosition();
		this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + scrollDimensions.height });
	}

	override setInput(input: WalkThroughInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const store = new DisposableStore();
		this.contentDisposables.push(store);

		this.content.innerText = '';

		return super.setInput(input, options, context, token)
			.then(async () => {
				if (input.resource.path.endsWith('.md')) {
					await this.extensionService.whenInstalledExtensionsRegistered();
				}
				return input.resolve();
			})
			.then(model => {
				if (token.isCancellationRequested) {
					return;
				}

				const content = model.main;
				if (!input.resource.path.endsWith('.md')) {
					safeInnerHtml(this.content, content, { ALLOW_UNKNOWN_PROTOCOLS: true });

					this.updateSizeClasses();
					this.decorateContent();
					this.contentDisposables.push(this.keybindingService.onDidUpdateKeybindings(() => this.decorateContent()));
					input.onReady?.(this.content.firstElementChild as HTMLElement, store);
					this.scrollbar.scanDomNode();
					this.loadTextEditorViewState(input);
					this.updatedScrollPosition();
					return;
				}

				const innerContent = document.createElement('div');
				innerContent.classList.add('walkThroughContent'); // only for markdown files
				const markdown = this.expandMacros(content);
				safeInnerHtml(innerContent, markdown, { ALLOW_UNKNOWN_PROTOCOLS: true });
				this.content.appendChild(innerContent);

				model.snippets.forEach((snippet, i) => {
					const model = snippet.textEditorModel;
					if (!model) {
						return;
					}
					const id = `snippet-${model.uri.fragment}`;
					const div = innerContent.querySelector(`#${id.replace(/[\\.]/g, '\\$&')}`) as HTMLElement;

					const options = this.getEditorOptions(model.getLanguageId());
					const telemetryData = {
						target: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined,
						snippet: i
					};
					const editor = this.instantiationService.createInstance(CodeEditorWidget, div, options, {
						telemetryData: telemetryData
					});
					editor.setModel(model);
					this.contentDisposables.push(editor);

					const updateHeight = (initial: boolean) => {
						const lineHeight = editor.getOption(EditorOption.lineHeight);
						const height = `${Math.max(model.getLineCount() + 1, 4) * lineHeight}px`;
						if (div.style.height !== height) {
							div.style.height = height;
							editor.layout();
							if (!initial) {
								this.scrollbar.scanDomNode();
							}
						}
					};
					updateHeight(true);
					this.contentDisposables.push(editor.onDidChangeModelContent(() => updateHeight(false)));
					this.contentDisposables.push(editor.onDidChangeCursorPosition(e => {
						const innerContent = this.content.firstElementChild;
						if (innerContent) {
							const targetTop = div.getBoundingClientRect().top;
							const containerTop = innerContent.getBoundingClientRect().top;
							const lineHeight = editor.getOption(EditorOption.lineHeight);
							const lineTop = (targetTop + (e.position.lineNumber - 1) * lineHeight) - containerTop;
							const lineBottom = lineTop + lineHeight;
							const scrollDimensions = this.scrollbar.getScrollDimensions();
							const scrollPosition = this.scrollbar.getScrollPosition();
							const scrollTop = scrollPosition.scrollTop;
							const height = scrollDimensions.height;
							if (scrollTop > lineTop) {
								this.scrollbar.setScrollPosition({ scrollTop: lineTop });
							} else if (scrollTop < lineBottom - height) {
								this.scrollbar.setScrollPosition({ scrollTop: lineBottom - height });
							}
						}
					}));

					this.contentDisposables.push(this.configurationService.onDidChangeConfiguration(e => {
						if (e.affectsConfiguration('editor') && snippet.textEditorModel) {
							editor.updateOptions(this.getEditorOptions(snippet.textEditorModel.getLanguageId()));
						}
					}));
				});
				this.updateSizeClasses();
				this.multiCursorModifier();
				this.contentDisposables.push(this.configurationService.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration('editor.multiCursorModifier')) {
						this.multiCursorModifier();
					}
				}));
				input.onReady?.(innerContent, store);
				this.scrollbar.scanDomNode();
				this.loadTextEditorViewState(input);
				this.updatedScrollPosition();
				this.contentDisposables.push(Gesture.addTarget(innerContent));
				this.contentDisposables.push(addDisposableListener(innerContent, TouchEventType.Change, e => this.onTouchChange(e as GestureEvent)));
			});
	}

	private getEditorOptions(language: string): ICodeEditorOptions {
		const config = deepClone(this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
		return {
			...isObject(config) ? config : Object.create(null),
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
			},
			overviewRulerLanes: 3,
			fixedOverflowWidgets: false,
			lineNumbersMinChars: 1,
			minimap: { enabled: false },
		};
	}

	private expandMacros(input: string) {
		return input.replace(/kb\(([a-z.\d\-]+)\)/gi, (match: string, kb: string) => {
			const keybinding = this.keybindingService.lookupKeybinding(kb);
			const shortcut = keybinding ? keybinding.getLabel() || '' : UNBOUND_COMMAND;
			return `<span class="shortcut">${strings.escape(shortcut)}</span>`;
		});
	}

	private decorateContent() {
		const keys = this.content.querySelectorAll('.shortcut[data-command]');
		Array.prototype.forEach.call(keys, (key: Element) => {
			const command = key.getAttribute('data-command');
			const keybinding = command && this.keybindingService.lookupKeybinding(command);
			const label = keybinding ? keybinding.getLabel() || '' : UNBOUND_COMMAND;
			while (key.firstChild) {
				key.firstChild.remove();
			}
			key.appendChild(document.createTextNode(label));
		});
		const ifkeys = this.content.querySelectorAll('.if_shortcut[data-command]');
		Array.prototype.forEach.call(ifkeys, (key: HTMLElement) => {
			const command = key.getAttribute('data-command');
			const keybinding = command && this.keybindingService.lookupKeybinding(command);
			key.style.display = !keybinding ? 'none' : '';
		});
	}

	private multiCursorModifier() {
		const labels = UILabelProvider.modifierLabels[OS];
		const value = this.configurationService.getValue('editor.multiCursorModifier');
		const modifier = labels[value === 'ctrlCmd' ? (OS === OperatingSystem.Macintosh ? 'metaKey' : 'ctrlKey') : 'altKey'];
		const keys = this.content.querySelectorAll('.multi-cursor-modifier');
		Array.prototype.forEach.call(keys, (key: Element) => {
			while (key.firstChild) {
				key.firstChild.remove();
			}
			key.appendChild(document.createTextNode(modifier));
		});
	}

	private saveTextEditorViewState(input: WalkThroughInput): void {
		const scrollPosition = this.scrollbar.getScrollPosition();

		this.editorMemento.saveEditorState(this.group, input, {
			viewState: {
				scrollTop: scrollPosition.scrollTop,
				scrollLeft: scrollPosition.scrollLeft
			}
		});
	}

	private loadTextEditorViewState(input: WalkThroughInput) {
		const state = this.editorMemento.loadEditorState(this.group, input);
		if (state) {
			this.scrollbar.setScrollPosition(state.viewState);
		}
	}

	public override clearInput(): void {
		if (this.input instanceof WalkThroughInput) {
			this.saveTextEditorViewState(this.input);
		}
		this.contentDisposables = dispose(this.contentDisposables);
		super.clearInput();
	}

	protected override saveState(): void {
		if (this.input instanceof WalkThroughInput) {
			this.saveTextEditorViewState(this.input);
		}

		super.saveState();
	}

	override dispose(): void {
		this.editorFocus.reset();
		this.contentDisposables = dispose(this.contentDisposables);
		this.disposables.dispose();
		super.dispose();
	}
}
