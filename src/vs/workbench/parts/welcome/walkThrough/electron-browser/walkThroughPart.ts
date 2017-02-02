/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./walkThroughPart';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IEditorOptions, IEditorViewState } from 'vs/editor/common/editorCommon';
import { $, Dimension, Builder } from 'vs/base/browser/builder';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { marked } from 'vs/base/common/marked/marked';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeEditor } from 'vs/editor/browser/codeEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { localize } from 'vs/nls';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope } from 'vs/workbench/common/memento';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { once } from 'vs/base/common/event';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';
import { isObject } from 'vs/base/common/types';

export const WALK_THROUGH_FOCUS = new RawContextKey<boolean>('interactivePlaygroundFocus', false);

const UNBOUND_COMMAND = localize('walkThrough.unboundCommand', "unbound");
const WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'walkThroughEditorViewState';

interface IViewState {
	scrollTop: number;
	scrollLeft: number;
}

interface IWalkThroughEditorViewState extends IEditorViewState {
	viewState: IViewState;
}

interface IWalkThroughEditorViewStates {
	0?: IWalkThroughEditorViewState;
	1?: IWalkThroughEditorViewState;
	2?: IWalkThroughEditorViewState;
}

export class WalkThroughPart extends BaseEditor {

	static ID: string = 'workbench.editor.walkThroughPart';

	private disposables: IDisposable[] = [];
	private contentDisposables: IDisposable[] = [];
	private content: HTMLDivElement;
	private scrollbar: DomScrollableElement;
	private editorFocus: IContextKey<boolean>;
	private size: Dimension;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IOpenerService private openerService: IOpenerService,
		@IFileService private fileService: IFileService,
		@IModelService protected modelService: IModelService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IStorageService private storageService: IStorageService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IModeService private modeService: IModeService
	) {
		super(WalkThroughPart.ID, telemetryService);
		this.editorFocus = WALK_THROUGH_FOCUS.bindTo(this.contextKeyService);
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();

		this.content = document.createElement('div');
		this.content.tabIndex = 0;
		this.content.style.outlineStyle = 'none';

		this.scrollbar = new DomScrollableElement(this.content, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Auto
		});
		this.disposables.push(this.scrollbar);
		container.appendChild(this.scrollbar.getDomNode());

		this.registerFocusHandlers();
		this.registerClickHandler();

		this.disposables.push(this.scrollbar.onScroll(e => this.updatedScrollPosition()));
	}

	private updatedScrollPosition() {
		const scrollHeight = this.scrollbar.getScrollHeight();
		if (scrollHeight && this.input instanceof WalkThroughInput) {
			const scrollTop = this.scrollbar.getScrollTop();
			const height = this.scrollbar.getHeight();
			this.input.relativeScrollPosition(scrollTop / scrollHeight, (scrollTop + height) / scrollHeight);
		}
	}

	private addEventListener<K extends keyof HTMLElementEventMap, E extends HTMLElement>(element: E, type: K, listener: (this: E, ev: HTMLElementEventMap[K]) => any, useCapture?: boolean): IDisposable;
	private addEventListener<E extends HTMLElement>(element: E, type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): IDisposable;
	private addEventListener<E extends HTMLElement>(element: E, type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): IDisposable {
		element.addEventListener(type, listener, useCapture);
		return { dispose: () => { element.removeEventListener(type, listener, useCapture); } };
	}

	private registerFocusHandlers() {
		this.disposables.push(this.addEventListener(this.content, 'mousedown', e => {
			this.focus();
		}));
		this.disposables.push(this.addEventListener(this.content, 'focus', e => {
			this.editorFocus.set(true);
		}));
		this.disposables.push(this.addEventListener(this.content, 'blur', e => {
			this.editorFocus.reset();
		}));
		this.disposables.push(this.addEventListener(this.content, 'focusin', e => {
			// Work around scrolling as side-effect of setting focus on the offscreen zone widget (#18929)
			if (e.target instanceof HTMLElement && e.target.classList.contains('zone-widget-container')) {
				this.content.scrollTop = this.scrollbar.getScrollTop();
				this.content.scrollLeft = this.scrollbar.getScrollLeft();
			}
		}));
	}

	private registerClickHandler() {
		this.content.addEventListener('click', event => {
			for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
				if (node instanceof HTMLAnchorElement && node.href) {
					let baseElement = window.document.getElementsByTagName('base')[0] || window.location;
					if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {
						let scrollTarget = this.content.querySelector(node.hash);
						this.telemetryService.publicLog('revealInDocument', {
							hash: node.hash,
							broken: !scrollTarget,
							from: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined
						});
						const innerContent = this.content.firstElementChild;
						if (scrollTarget && innerContent) {
							const targetTop = scrollTarget.getBoundingClientRect().top - 20;
							const containerTop = innerContent.getBoundingClientRect().top;
							this.scrollbar.updateState({ scrollTop: targetTop - containerTop });
						}
					} else {
						this.open(URI.parse(node.href));
					}
					event.preventDefault();
					break;
				} else if (node instanceof HTMLButtonElement) {
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
		if (uri.scheme === 'http' || uri.scheme === 'https') {
			this.telemetryService.publicLog('openExternal', {
				uri: uri.toString(true),
				from: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined
			});
		}
		this.openerService.open(this.addFrom(uri));
	}

	private addFrom(uri: URI) {
		if (uri.scheme !== 'command' || !(this.input instanceof WalkThroughInput)) {
			return uri;
		}
		const query = uri.query ? JSON.parse(uri.query) : {};
		query.from = this.input.getTelemetryFrom();
		return uri.with({ query: JSON.stringify(query) });
	}

	layout(size: Dimension): void {
		this.size = size;
		$(this.content).style({ height: `${size.height}px`, width: `${size.width}px` });
		this.updateSizeClasses();
		this.contentDisposables.forEach(disposable => {
			if (disposable instanceof CodeEditor) {
				disposable.layout();
			}
		});
		this.scrollbar.scanDomNode();
	}

	private updateSizeClasses() {
		const innerContent = this.content.firstElementChild;
		if (this.size && innerContent) {
			const classList = innerContent.classList;
			classList[this.size.height <= 685 ? 'add' : 'remove']('max-height-685px');
		}
	}

	focus(): void {
		let active = document.activeElement;
		while (active && active !== this.content) {
			active = active.parentElement;
		}
		if (!active) {
			this.content.focus();
		}
		this.editorFocus.set(true);
	}

	arrowUp() {
		this.scrollbar.updateState({ scrollTop: this.scrollbar.getScrollTop() - this.getArrowScrollHeight() });
	}

	arrowDown() {
		this.scrollbar.updateState({ scrollTop: this.scrollbar.getScrollTop() + this.getArrowScrollHeight() });
	}

	private getArrowScrollHeight() {
		let fontSize = this.configurationService.lookup<number>('editor.fontSize').value;
		if (typeof fontSize !== 'number' || fontSize < 1) {
			fontSize = 12;
		}
		return 3 * fontSize;
	}

	pageUp() {
		this.scrollbar.updateState({ scrollTop: this.scrollbar.getScrollTop() - this.scrollbar.getHeight() });
	}

	pageDown() {
		this.scrollbar.updateState({ scrollTop: this.scrollbar.getScrollTop() + this.scrollbar.getHeight() });
	}

	setInput(input: WalkThroughInput, options: EditorOptions): TPromise<void> {
		if (this.input instanceof WalkThroughInput && this.input.matches(input)) {
			return TPromise.as(undefined);
		}

		if (this.input instanceof WalkThroughInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}

		this.contentDisposables = dispose(this.contentDisposables);
		this.content.innerHTML = '';

		return super.setInput(input, options)
			.then(() => {
				return input.resolve(true);
			})
			.then(model => {
				const content = model.main.textEditorModel.getLinesContent().join('\n');
				if (strings.endsWith(input.getResource().path, '.html')) {
					this.content.innerHTML = content;
					this.updateSizeClasses();
					this.updateMarkerClasses();
					this.decorateContent();
					if (input.onReady) {
						input.onReady(this.content.firstElementChild as HTMLElement);
					}
					this.scrollbar.scanDomNode();
					this.loadTextEditorViewState(input.getResource());
					this.updatedScrollPosition();
					return;
				}

				let i = 0;
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					const id = `snippet-${model.snippets[i++].textEditorModel.uri.fragment}`;
					return `<div id="${id}" class="walkThroughEditorContainer" ></div>`;
				};
				const innerContent = document.createElement('div');
				innerContent.classList.add('walkThroughContent'); // only for markdown files
				const markdown = this.expandMacros(content);
				innerContent.innerHTML = marked(markdown, { renderer });
				this.style(innerContent);
				this.contentDisposables.push(this.themeService.onDidColorThemeChange(() => this.style(innerContent)));
				this.content.appendChild(innerContent);

				model.snippets.forEach((snippet, i) => {
					const model = snippet.textEditorModel;
					const id = `snippet-${model.uri.fragment}`;
					const div = innerContent.querySelector(`#${id.replace(/\./g, '\\.')}`) as HTMLElement;

					const editor = this.instantiationService.createInstance(CodeEditor, div, this.getEditorOptions(snippet.textEditorModel.getModeId()));
					editor.setModel(model);
					this.contentDisposables.push(editor);

					const updateHeight = (initial: boolean) => {
						const lineHeight = editor.getConfiguration().lineHeight;
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
							const lineHeight = editor.getConfiguration().lineHeight;
							const lineTop = (targetTop + (e.position.lineNumber - 1) * lineHeight) - containerTop;
							const lineBottom = lineTop + lineHeight;
							const scrollTop = this.scrollbar.getScrollTop();
							const height = this.scrollbar.getHeight();
							if (scrollTop > lineTop) {
								this.scrollbar.updateState({ scrollTop: lineTop });
							} else if (scrollTop < lineBottom - height) {
								this.scrollbar.updateState({ scrollTop: lineBottom - height });
							}
						}
					}));

					this.contentDisposables.push(this.themeService.onDidColorThemeChange(theme => editor.updateOptions({ theme: theme.id })));
					this.contentDisposables.push(this.configurationService.onDidUpdateConfiguration(() => editor.updateOptions(this.getEditorOptions(snippet.textEditorModel.getModeId()))));

					this.contentDisposables.push(once(editor.onMouseDown)(() => {
						this.telemetryService.publicLog('walkThroughSnippetInteraction', {
							from: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined,
							type: 'mouseDown',
							snippet: i
						});
					}));
					this.contentDisposables.push(once(editor.onKeyDown)(() => {
						this.telemetryService.publicLog('walkThroughSnippetInteraction', {
							from: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined,
							type: 'keyDown',
							snippet: i
						});
					}));
					this.contentDisposables.push(once(editor.onDidChangeModelContent)(() => {
						this.telemetryService.publicLog('walkThroughSnippetInteraction', {
							from: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : undefined,
							type: 'changeModelContent',
							snippet: i
						});
					}));
				});
				this.updateSizeClasses();
				this.updateMarkerClasses();
				if (input.onReady) {
					input.onReady(innerContent);
				}
				this.scrollbar.scanDomNode();
				this.loadTextEditorViewState(input.getResource());
				this.updatedScrollPosition();
			});
	}

	private getEditorOptions(language: string): IEditorOptions {
		const config = this.configurationService.getConfiguration<IEditorOptions>({ overrideIdentifier: language, section: 'editor' });
		return {
			...isObject(config) ? config : Object.create(null),
			scrollBeyondLastLine: false,
			scrollbar: DefaultConfig.editor.scrollbar,
			overviewRulerLanes: 3,
			fixedOverflowWidgets: true,
			lineNumbersMinChars: 1,
			theme: this.themeService.getColorTheme().id,
		};
	}

	private updateMarkerClasses() {
		const innerContent = this.content.firstElementChild;
		if (SCMPreview.enabled && innerContent) {
			innerContent.classList.add('scmEnabled');
		}
	}

	private style(div: HTMLElement) {
		const styleElement = document.querySelector('.monaco-editor-background');
		const {color, backgroundColor, fontFamily, fontWeight, fontSize} = window.getComputedStyle(styleElement);
		div.style.color = color;
		div.style.backgroundColor = backgroundColor;
		div.style.fontFamily = fontFamily;
		div.style.fontWeight = fontWeight;
		div.style.fontSize = fontSize;
	}

	private expandMacros(input: string) {
		return input.replace(/kb\(([a-z.\d\-]+)\)/gi, (match: string, kb: string) => {
			const keybinding = this.keybindingService.lookupKeybindings(kb)[0];
			const shortcut = keybinding ? this.keybindingService.getLabelFor(keybinding) : UNBOUND_COMMAND;
			return `<span class="shortcut">${shortcut}</span>`;
		});
	}

	private decorateContent() {
		const keys = this.content.querySelectorAll('.shortcut[data-command]');
		Array.prototype.forEach.call(keys, (key: Element) => {
			const command = key.getAttribute('data-command');
			const keybinding = command && this.keybindingService.lookupKeybindings(command)[0];
			const label = keybinding ? this.keybindingService.getLabelFor(keybinding) : UNBOUND_COMMAND;
			key.appendChild(document.createTextNode(label));
		});
	}
	private saveTextEditorViewState(resource: URI): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (!editorViewStateMemento) {
			editorViewStateMemento = Object.create(null);
			memento[WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY] = editorViewStateMemento;
		}

		const editorViewState: IWalkThroughEditorViewState = {
			viewState: {
				scrollTop: this.scrollbar.getScrollTop(),
				scrollLeft: this.scrollbar.getScrollLeft()
			}
		};

		let fileViewState: IWalkThroughEditorViewStates = editorViewStateMemento[resource.toString()];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			editorViewStateMemento[resource.toString()] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	private loadTextEditorViewState(resource: URI) {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const editorViewStateMemento = memento[WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY];
		if (editorViewStateMemento) {
			const fileViewState: IWalkThroughEditorViewStates = editorViewStateMemento[resource.toString()];
			if (fileViewState) {
				const state: IWalkThroughEditorViewState = fileViewState[this.position];
				if (state) {
					this.scrollbar.updateState(state.viewState);
				}
			}
		}
	}

	public clearInput(): void {
		if (this.input instanceof WalkThroughInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}
		super.clearInput();
	}

	public shutdown(): void {
		if (this.input instanceof WalkThroughInput) {
			this.saveTextEditorViewState(this.input.getResource());
		}
		super.shutdown();
	}

	dispose(): void {
		this.editorFocus.reset();
		this.contentDisposables = dispose(this.contentDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
