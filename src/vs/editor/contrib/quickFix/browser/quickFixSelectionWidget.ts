/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickFix';
import * as nls from 'vs/nls';
import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import {ListenerUnbind} from 'vs/base/common/eventEmitter';
import * as timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IDataSource, IFocusEvent, IRenderer, ISelectionEvent, ITree, IAccessibilityProvider} from 'vs/base/parts/tree/browser/tree';
import {DefaultController} from 'vs/base/parts/tree/browser/treeDefaults';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {EventType, ICursorSelectionChangedEvent, IRange} from 'vs/editor/common/editorCommon';
import {ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition} from 'vs/editor/browser/editorBrowser';
import {IQuickFix2} from '../common/quickFix';
import {QuickFixModel} from './quickFixModel';
import {alert} from 'vs/base/browser/ui/aria/aria';

var $ = dom.emmet;

function isQuickFix(quickfix: any): quickfix is IQuickFix2 {
	return quickfix
		&& typeof (<IQuickFix2>quickfix).command === 'object'
		&& typeof (<IQuickFix2> quickfix).command.title === 'string';
}

function getAriaAlertLabel(item: IQuickFix2): string {
	return nls.localize('ariaCurrentFix',"{0}, quick fix suggestion", item.command.title);
}

// To be used as a tree element when we want to show a message
export class Message {
	constructor(public parent: MessageRoot, public message: string) {
		// nothing to do
	}
}

export class MessageRoot {
	public child: Message;

	constructor(message: string) {
		this.child = new Message(this, message);
	}
}

class DataSource implements IDataSource {

	private root: IQuickFix2[];

	constructor() {
		this.root = null;
	}

	private isRoot(element: any) : boolean {
		if (element instanceof MessageRoot) {
			return true;
		} else if (element instanceof Message) {
			return false;
		} else if (Array.isArray(element)) {
			this.root = element;
			return true;
		} else {
			return false;
		}
	}

	public getId(tree: ITree, element: any): string {
		if (element instanceof MessageRoot) {
			return 'messageroot';
		} else if (element instanceof Message) {
			return 'message' + element.message;
		} else if (Array.isArray(element)) {
			return 'root';
		} else if(isQuickFix(element)) {
			return (<IQuickFix2> element).id;
		} else {
			throw illegalArgument('element');
		}
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		if (element instanceof MessageRoot) {
			return TPromise.as(null);
		} else if (element instanceof Message) {
			return TPromise.as(element.parent);
		}
		return TPromise.as(this.isRoot(element) ? null : this.root);
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		if (element instanceof MessageRoot) {
			return TPromise.as([element.child]);
		} else if (element instanceof Message) {
			return TPromise.as([]);
		}

		return TPromise.as(this.isRoot(element) ? element : []);
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return this.isRoot(element);
	}
}

class Controller extends DefaultController {

	/* protected */ public onLeftClick(tree:ITree, element:any, event:IMouseEvent):boolean {
		event.preventDefault();
		event.stopPropagation();

		if (!(element instanceof Message)) {
			tree.setSelection([element], { origin: 'mouse' });
		}

		return true;
	}
}

export class AccessibilityProvider implements IAccessibilityProvider {
	constructor() { }

	public getAriaLabel(tree: ITree, element: any): string {
		if (isQuickFix(element)) {
			return getAriaAlertLabel(<IQuickFix2> element);
		}
	}
}

function getHeight(tree:ITree, element:any): number {
	// var fix = <IQuickFix2>element;

	// if (!(element instanceof Message) && !!fix.documentation && tree.isFocused(fix)) {
	// 	return 35;
	// }

	return 19;
}

class Renderer implements IRenderer {

	public getHeight(tree:ITree, element:any):number {
		return getHeight(tree, element);
	}

	public getTemplateId(tree: ITree, element: any): string {
		return element instanceof Message ? 'message' : 'default';
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === 'message') {
			var messageElement = dom.append(container, $('span'));
			messageElement.style.opacity = '0.7';
			messageElement.style.paddingLeft = '12px';
			return { element: messageElement };
		}

		var result: any = {};
		var text = dom.append(container, $('.text'));
		result['main'] = dom.append(text, $('.main'));
		var docs = dom.append(text, $('.docs'));
		result['documentationLabel'] = dom.append(docs, $('span.docs-label'));
		return result;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === 'message') {
			templateData.element.textContent = element.message;
			return;
		}

		var quickFix = <IQuickFix2> element;
		templateData.main.textContent = quickFix.command.title;
		templateData.documentationLabel.textContent = /*quickFix.documentation ||*/ '';
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}
}

interface ITelemetryData {
	suggestionCount?: number;
	suggestedIndex?: number;
	selectedIndex?: number;
	hintLength?: number;
	wasCancelled?: boolean;
	wasAutomaticallyTriggered?: boolean;
}

export class QuickFixSelectionWidget implements IContentWidget {
	static ID = 'editor.widget.QuickFixSelectionWidget';
	static WIDTH = 360;

	static LOADING_MESSAGE = new MessageRoot(nls.localize('QuickFixSelectionWidget.loading', "Loading..."));
	static NO_SUGGESTIONS_MESSAGE = new MessageRoot(nls.localize('QuickFixSelectionWidget.noSuggestions', "No fix suggestions."));

	private editor: ICodeEditor;
	private shouldShowEmptyList: boolean;
	private isActive: boolean;
	private isLoading: boolean;
	private isAuto: boolean;
	private listenersToRemove: ListenerUnbind[];
	private modelListenersToRemove: ListenerUnbind[];
	private model: QuickFixModel;

	private telemetryData: ITelemetryData;
	private telemetryService: ITelemetryService;

	private domnode: HTMLElement;
	private tree: ITree;

	private range: IRange;

	private _onShown: () => void;
	private _onHidden: () => void;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(editor: ICodeEditor, telemetryService:ITelemetryService, onShown: () => void, onHidden: () => void) {
		this.editor = editor;
		this._onShown = onShown;
		this._onHidden = onHidden;

		this.shouldShowEmptyList = true;

		this.isActive = false;
		this.isLoading = false;
		this.isAuto = false;
		this.modelListenersToRemove = [];
		this.model = null;

		this.telemetryData = Object.create(null);
		this.telemetryService = telemetryService;

		this.listenersToRemove = [];

		this.domnode = $('.editor-widget.quickfix-widget.monaco-editor-background.no-icons');
		this.domnode.style.width = QuickFixSelectionWidget.WIDTH + 'px';

		this.tree = new Tree(this.domnode, {
			dataSource: new DataSource(),
			renderer: new Renderer(),
			controller: new Controller(),
			accessibilityProvider: new AccessibilityProvider()
		}, {
			twistiePixels: 0,
			alwaysFocused: true,
			verticalScrollMode: 'visible',
			useShadows: false,
			ariaLabel: nls.localize('treeAriaLabel', "Quick Fix")
		});

		this.listenersToRemove.push(this.tree.addListener('selection', (e:ISelectionEvent) => {
			if (e.selection && e.selection.length > 0) {
				var element = e.selection[0];
				if (isQuickFix(element) && !(element instanceof MessageRoot) && !(element instanceof Message)) {

					this.telemetryData.selectedIndex = this.tree.getInput().indexOf(element);
					this.telemetryData.wasCancelled = false;
					this.submitTelemetryData();

					alert(nls.localize('quickFixAriaAccepted', "{0}, accepted", element.command.title));

					this.model.accept(element, this.range);
					this.editor.focus();
				}
			}
		}));

		var oldFocus: any = null;

		this.listenersToRemove.push(this.tree.addListener('focus', (e:IFocusEvent) => {
			var focus = e.focus;
			var payload = e.payload;


			if (focus === oldFocus) {
				return;
			}

			var elementsToRefresh: any[] = [];

			if (oldFocus) {
				elementsToRefresh.push(oldFocus);
			}

			if (focus) {
				elementsToRefresh.push(focus);
				this._ariaAlert(getAriaAlertLabel(focus));
			}

			oldFocus = focus;

			this.tree.refreshAll(elementsToRefresh).done(() => {
				this.updateWidgetHeight();

				if (focus) {
					return this.tree.reveal(focus, (payload && payload.firstSuggestion) ? 0 : null);
				}
			}, onUnexpectedError);
		}));

		this.editor.addContentWidget(this);

		this.listenersToRemove.push(this.editor.addListener(EventType.CursorSelectionChanged, (e: ICursorSelectionChangedEvent) => {
			if (this.isActive) {
				this.editor.layoutContentWidget(this);
			}
		}));

		this.hide();
	}

	private _lastAriaAlertLabel: string;
	private _ariaAlert(newAriaAlertLabel:string): void {
		if (this._lastAriaAlertLabel === newAriaAlertLabel) {
			return;
		}
		this._lastAriaAlertLabel = newAriaAlertLabel;
		if (this._lastAriaAlertLabel) {
			alert(this._lastAriaAlertLabel);
		}
	}

	public setModel(newModel: QuickFixModel) : void {
		this.releaseModel();
		this.model = newModel;

		var timer : timer.ITimerEvent = null,
			loadingHandle:number;

		this.modelListenersToRemove.push(this.model.addListener('loading', (e: any) => {
			if (!this.isActive) {
				timer = this.telemetryService.start('QuickFixSelectionWidgetLoadingTime');
				this.isLoading = true;
				this.isAuto = !!e.auto;

				if (!this.isAuto) {
					loadingHandle = setTimeout(() => {
						dom.removeClass(this.domnode, 'empty');
						this.tree.setInput(QuickFixSelectionWidget.LOADING_MESSAGE).done(null, onUnexpectedError);
						this.updateWidgetHeight();
						this.show();
					}, 50);
				}

				if (!e.retrigger) {
					this.telemetryData = {
						wasAutomaticallyTriggered: e.characterTriggered
					};
				}
			}
		}));

		this.modelListenersToRemove.push(this.model.addListener('suggest',(e: { fixes: IQuickFix2[]; range: IRange; auto:boolean; }) => {
			this.isLoading = false;

			if(typeof loadingHandle !== 'undefined') {
				clearTimeout(loadingHandle);
				loadingHandle = void 0;
			}

			var fixes = e.fixes;

			var bestFixIndex = -1;
			var bestFix:IQuickFix2 = fixes[0];
			var bestScore = -1;

			for (var i = 0, len = fixes.length; i < len; i++) {
				var fix = fixes[i];
				var score = fix.score;
				if (score > bestScore) {
					bestScore = score;
					bestFix = fix;
					bestFixIndex = i;
				}
			}

			dom.removeClass(this.domnode, 'empty');
			this.tree.setInput(fixes).done(null, onUnexpectedError);
			this.tree.setFocus(bestFix, { firstSuggestion: true });
			this.updateWidgetHeight();
			this.range = e.range;
			this.show();

			this.telemetryData = this.telemetryData || {};
			this.telemetryData.suggestionCount = fixes.length;
			this.telemetryData.suggestedIndex = bestFixIndex;

			if(timer) {
				timer.data = { reason: 'results'};
				timer.stop();
				timer = null;
			}
		}));

		this.modelListenersToRemove.push(this.model.addListener('empty', (e: { auto:boolean; }) => {
			var wasLoading = this.isLoading;
			this.isLoading = false;

			if(typeof loadingHandle !== 'undefined') {
				clearTimeout(loadingHandle);
				loadingHandle = void 0;
			}

			if (e.auto) {
				this.hide();
			} else if (wasLoading) {
				if (this.shouldShowEmptyList) {
					dom.removeClass(this.domnode, 'empty');
					this.tree.setInput(QuickFixSelectionWidget.NO_SUGGESTIONS_MESSAGE).done(null, onUnexpectedError);
					this.updateWidgetHeight();
					this.show();
				} else {
					this.hide();
				}
			} else {
				dom.addClass(this.domnode, 'empty');
			}

			if(timer) {
				timer.data = { reason: 'empty'};
				timer.stop();
				timer = null;
			}
		}));

		this.modelListenersToRemove.push(this.model.addListener('cancel', (e:any) => {
			this.isLoading = false;

			if(typeof loadingHandle !== 'undefined') {
				clearTimeout(loadingHandle);
				loadingHandle = void 0;
			}

			if (!e.retrigger) {
				this.hide();

				if (this.telemetryData) {
					this.telemetryData.selectedIndex = -1;
					this.telemetryData.wasCancelled = true;
					this.submitTelemetryData();
				}
			}

			if (timer) {
				timer.data = { reason: 'cancel' };
				timer.stop();
				timer = null;
			}
		}));
	}


	public selectNextPage(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			this.tree.focusNextPage();
			return true;
		}
		return false;
	}

	public selectNext(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			this.tree.focusNext(1);
			if (focus === this.tree.getFocus()) {
				this.tree.focusFirst();
			}
			return true;
		}
		return false;
	}

	public selectPreviousPage(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			this.tree.focusPreviousPage();
			return true;
		}
		return false;
	}

	public selectPrevious(): boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			this.tree.focusPrevious(1);
			if (focus === this.tree.getFocus()) {
				this.tree.focusLast();
			}
			return true;
		}
		return false;
	}

	public acceptSelectedSuggestion() : boolean {
		if (this.isLoading) {
			return !this.isAuto;
		}
		if (this.isActive) {
			var focus = this.tree.getFocus();
			if (focus) {
				this.tree.setSelection([focus]);
			} else {
				this.model.cancelDialog();
			}
			return true;
		}
		return false;
	}

	private releaseModel() : void {
		var listener:()=>void;
		while (listener = this.modelListenersToRemove.pop()) {
			listener();
		}
		this.model = null;
	}

	public show() : void {
		this.isActive = true;
		this.tree.layout();
		this.editor.layoutContentWidget(this);

		this._onShown();
	}

	public hide() : void {
		this._onHidden();

		this.isActive = false;
		this.editor.layoutContentWidget(this);
	}

	public getPosition():IContentWidgetPosition {
		if (this.isActive) {
			return {
				position: this.editor.getPosition(),
				preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
			};
		}
		return null;
	}

	public getDomNode() : HTMLElement {
		return this.domnode;
	}

	public getId() : string {
		return QuickFixSelectionWidget.ID;
	}

	private submitTelemetryData() : void {
		this.telemetryService.publicLog('QuickFixSelectionWidget', this.telemetryData);
		this.telemetryData = Object.create(null);
	}

	private updateWidgetHeight(): void {
		var input = this.tree.getInput();
		var height: number;

		if (input === QuickFixSelectionWidget.LOADING_MESSAGE || input === QuickFixSelectionWidget.NO_SUGGESTIONS_MESSAGE) {
			height = 19;
		} else {
			var fixes = <IQuickFix2[]> input;
			height = Math.min(fixes.length - 1, 11) * 19;

			var focus = this.tree.getFocus();
			height += focus ? getHeight(this.tree, focus) : 19;
		}

		this.domnode.style.height = height + 'px';
		this.tree.layout(height);
		this.editor.layoutContentWidget(this);
	}

	public destroy() : void {
		this.releaseModel();
		this.domnode = null;

		this.tree.dispose();
		this.tree = null;

		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = null;
	}
}