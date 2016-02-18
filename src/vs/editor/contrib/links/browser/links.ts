/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./links';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import Platform = require('vs/base/common/platform');
import Errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import Keyboard = require('vs/base/browser/keyboardEvent');
import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EventEmitter = require('vs/base/common/eventEmitter');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {IEditorService, IResourceInput} from 'vs/platform/editor/common/editor';
import {IMessageService} from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import {KeyCode} from 'vs/base/common/keyCodes';
import {Range} from 'vs/editor/common/core/range';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

class LinkOccurence {

	public static decoration(link:Modes.ILink): EditorCommon.IModelDeltaDecoration {
		return {
			range: {
				startLineNumber: link.range.startLineNumber,
				startColumn: link.range.startColumn,
				endLineNumber: link.range.startLineNumber,
				endColumn: link.range.endColumn
			},
			options: LinkOccurence._getOptions(link, false)
		};
	}

	private static _getOptions(link:Modes.ILink, isActive:boolean):EditorCommon.IModelDecorationOptions {
		var result = '';
		if (link.extraInlineClassName) {
			result = link.extraInlineClassName + ' ';
		}

		if (isActive) {
			result += LinkDetector.CLASS_NAME_ACTIVE;
		} else {
			result += LinkDetector.CLASS_NAME;
		}

		return {
			stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			inlineClassName: result,
			hoverMessage: LinkDetector.HOVER_MESSAGE_GENERAL
		};
	}

	public decorationId:string;
	public link:Modes.ILink;

	constructor(link:Modes.ILink, decorationId:string/*, changeAccessor:EditorCommon.IModelDecorationsChangeAccessor*/) {
		this.link = link;
		this.decorationId = decorationId;
	}

	public activate(changeAccessor: EditorCommon.IModelDecorationsChangeAccessor):void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(this.link, true));
	}

	public deactivate(changeAccessor: EditorCommon.IModelDecorationsChangeAccessor):void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(this.link, false));
	}
}

class LinkDetector {
	static RECOMPUTE_TIME = 1000; // ms
	static TRIGGER_KEY_VALUE = Platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
	static TRIGGER_MODIFIER = Platform.isMacintosh ? 'metaKey' : 'ctrlKey';
	static HOVER_MESSAGE_GENERAL = Platform.isMacintosh ? nls.localize('links.navigate.mac', "Cmd + click to follow link") : nls.localize('links.navigate', "Ctrl + click to follow link");
	static CLASS_NAME = 'detected-link';
	static CLASS_NAME_ACTIVE = 'detected-link-active';

	private editor:EditorCommon.ICommonCodeEditor;
	private listenersToRemove:EventEmitter.ListenerUnbind[];
	private timeoutPromise:TPromise<void>;
	private computePromise:TPromise<Modes.ILink[]>;
	private activeLinkDecorationId:string;
	private lastMouseEvent:EditorBrowser.IMouseEvent;
	private editorService:IEditorService;
	private messageService:IMessageService;
	private editorWorkerService: IEditorWorkerService;
	private currentOccurences:{ [decorationId:string]:LinkOccurence; };

	constructor(
		editor:EditorCommon.ICommonCodeEditor,
		editorService:IEditorService,
		messageService:IMessageService,
		editorWorkerService: IEditorWorkerService
	) {
		this.editor = editor;
		this.editorService = editorService;
		this.messageService = messageService;
		this.editorWorkerService = editorWorkerService;
		this.listenersToRemove = [];
		this.listenersToRemove.push(editor.addListener('change', (e:EditorCommon.IModelContentChangedEvent) => this.onChange()));
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelChanged, (e:EditorCommon.IModelContentChangedEvent) => this.onModelChanged()));
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelModeChanged, (e:EditorCommon.IModelModeChangedEvent) => this.onModelModeChanged()));
		this.listenersToRemove.push(editor.addListener(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.linkSupport) {
				this.onModelModeChanged();
			}
		}));
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.MouseUp, (e:EditorBrowser.IMouseEvent) => this.onEditorMouseUp(e)));
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.MouseMove, (e:EditorBrowser.IMouseEvent) => this.onEditorMouseMove(e)));
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.KeyDown, (e:Keyboard.StandardKeyboardEvent) => this.onEditorKeyDown(e)));
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.KeyUp, (e:Keyboard.StandardKeyboardEvent) => this.onEditorKeyUp(e)));
		this.timeoutPromise = null;
		this.computePromise = null;
		this.currentOccurences = {};
		this.activeLinkDecorationId = null;
		this.beginCompute();
	}

	public isComputing(): boolean {
		return TPromise.is(this.computePromise);
	}

	private onModelChanged(): void {
		this.lastMouseEvent = null;
		this.currentOccurences = {};
		this.activeLinkDecorationId = null;
		this.stop();
		this.beginCompute();
	}

	private onModelModeChanged(): void {
		this.stop();
		this.beginCompute();
	}

	private onChange():void {
		if (!this.timeoutPromise) {
			this.timeoutPromise = TPromise.timeout(LinkDetector.RECOMPUTE_TIME);
			this.timeoutPromise.then(() => {
				this.timeoutPromise = null;
				this.beginCompute();
			});
		}
	}

	private beginCompute():void {
		if (!this.editor.getModel()) {
			return;
		}

		let modePromise:TPromise<Modes.ILink[]> = TPromise.as(null);
		let mode = this.editor.getModel().getMode();
		if (mode.linkSupport) {
			modePromise = mode.linkSupport.computeLinks(this.editor.getModel().getAssociatedResource());
		}

		let standardPromise:TPromise<Modes.ILink[]> = this.editorWorkerService.computeLinks(this.editor.getModel().getAssociatedResource());

		this.computePromise = TPromise.join([modePromise, standardPromise]).then((r) => {
			let a = r[0];
			let b = r[1];
			if (!a || a.length === 0) {
				return b || [];
			}
			if (!b || b.length === 0) {
				return a || [];
			}
			return LinkDetector._linksUnion(a, b);
		});

		this.computePromise.then((links:Modes.ILink[]) => {
			this.updateDecorations(links);
			this.computePromise = null;
		});
	}

	private static _linksUnion(oldLinks: Modes.ILink[], newLinks: Modes.ILink[]): Modes.ILink[] {
		// reunite oldLinks with newLinks and remove duplicates
		var result: Modes.ILink[] = [],
			oldIndex: number,
			oldLen: number,
			newIndex: number,
			newLen: number,
			oldLink: Modes.ILink,
			newLink: Modes.ILink,
			comparisonResult: number;

		for (oldIndex = 0, newIndex = 0, oldLen = oldLinks.length, newLen = newLinks.length; oldIndex < oldLen && newIndex < newLen;) {
			oldLink = oldLinks[oldIndex];
			newLink = newLinks[newIndex];

			if (Range.areIntersectingOrTouching(oldLink.range, newLink.range)) {
				// Remove the oldLink
				oldIndex++;
				continue;
			}

			comparisonResult = Range.compareRangesUsingStarts(oldLink.range, newLink.range);

			if (comparisonResult < 0) {
				// oldLink is before
				result.push(oldLink);
				oldIndex++;
			} else {
				// newLink is before
				result.push(newLink);
				newIndex++;
			}
		}

		for (; oldIndex < oldLen; oldIndex++) {
			result.push(oldLinks[oldIndex]);
		}
		for (; newIndex < newLen; newIndex++) {
			result.push(newLinks[newIndex]);
		}

		return result;
	}

	private updateDecorations(links:Modes.ILink[]):void {
		this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
			var oldDecorations:string[] = [];
			for (var decorationId in this.currentOccurences) {
				if (this.currentOccurences.hasOwnProperty(decorationId)) {
					var occurance = this.currentOccurences[decorationId];
					oldDecorations.push(occurance.decorationId);
				}
			}

			var newDecorations:EditorCommon.IModelDeltaDecoration[] = [];
			if (links) {
				// Not sure why this is sometimes null
				for (var i = 0; i < links.length; i++) {
					newDecorations.push(LinkOccurence.decoration(links[i]));
				}
			}

			var decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);

			this.currentOccurences = {};
			this.activeLinkDecorationId = null;
			for (let i = 0, len = decorations.length; i < len; i++) {
				var occurance = new LinkOccurence(links[i], decorations[i]);
				this.currentOccurences[occurance.decorationId] = occurance;
			}
		});
	}

	private onEditorKeyDown(e:Keyboard.StandardKeyboardEvent):void {
		if (e.keyCode === LinkDetector.TRIGGER_KEY_VALUE && this.lastMouseEvent) {
			this.onEditorMouseMove(this.lastMouseEvent, e);
		}
	}

	private onEditorKeyUp(e:Keyboard.StandardKeyboardEvent):void {
		if (e.keyCode === LinkDetector.TRIGGER_KEY_VALUE) {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private onEditorMouseMove(mouseEvent: EditorBrowser.IMouseEvent, withKey?:Keyboard.StandardKeyboardEvent):void {
		this.lastMouseEvent = mouseEvent;

		if (this.isEnabled(mouseEvent, withKey)) {
			this.cleanUpActiveLinkDecoration(); // always remove previous link decoration as their can only be one
			var occurence = this.getLinkOccurence(mouseEvent.target.position);
			if (occurence) {
				this.editor.changeDecorations((changeAccessor)=>{
					occurence.activate(changeAccessor);
					this.activeLinkDecorationId = occurence.decorationId;
				});
			}
		} else {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private cleanUpActiveLinkDecoration():void {
		if (this.activeLinkDecorationId) {
			var occurence = this.currentOccurences[this.activeLinkDecorationId];
			if (occurence) {
				this.editor.changeDecorations((changeAccessor)=>{
					occurence.deactivate(changeAccessor);
				});
			}

			this.activeLinkDecorationId = null;
		}
	}

	private onEditorMouseUp(mouseEvent: EditorBrowser.IMouseEvent):void {
		if (!this.isEnabled(mouseEvent)) {
			return;
		}
		var occurence = this.getLinkOccurence(mouseEvent.target.position);
		if (!occurence) {
			return;
		}
		this.openLinkOccurence(occurence, mouseEvent.event.altKey);
	}

	public openLinkOccurence(occurence:LinkOccurence, openToSide:boolean):void {

		if (!this.editorService) {
			return;
		}

		var link = occurence.link;
		var absoluteUrl = link.url;
		var hashIndex = absoluteUrl.indexOf('#');
		var lineNumber = -1;
		var column = -1;
		if (hashIndex >= 0) {
			var hash = absoluteUrl.substr(hashIndex + 1);
			var selection = hash.split(',');

			if (selection.length > 0) {
				lineNumber = Number(selection[0]);
			}

			if (selection.length > 1) {
				column = Number(selection[1]);
			}

			if (lineNumber >= 0 || column >= 0) {
				absoluteUrl = absoluteUrl.substr(0, hashIndex);
			}
		}

		var url: URI;
		try {
			url = URI.parse(absoluteUrl);
		} catch (err) {
			// invalid url
			this.messageService.show(Severity.Warning, nls.localize('invalid.url', 'Invalid URI: cannot open {0}', absoluteUrl));
			return;
		}

		var input:IResourceInput = {
			resource: url
		};

		if (lineNumber >= 0) {
			input.options = {
				selection: { startLineNumber: lineNumber, startColumn: column }
			};
		}

		this.editorService.openEditor(input, openToSide).done(null, Errors.onUnexpectedError);
	}

	public getLinkOccurence(position: EditorCommon.IPosition): LinkOccurence {
		var decorations = this.editor.getModel().getDecorationsInRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, null, true);

		for (var i = 0; i < decorations.length; i++) {
			var decoration = decorations[i];
			var currentOccurence = this.currentOccurences[decoration.id];
			if (currentOccurence) {
				return currentOccurence;
			}
		}

		return null;
	}

	private isEnabled(mouseEvent: EditorBrowser.IMouseEvent, withKey?:Keyboard.StandardKeyboardEvent):boolean {
		return 	mouseEvent.target.type === EditorCommon.MouseTargetType.CONTENT_TEXT &&
				(mouseEvent.event[LinkDetector.TRIGGER_MODIFIER] || (withKey && withKey.keyCode === LinkDetector.TRIGGER_KEY_VALUE));
	}

	private stop():void {
		if (this.timeoutPromise) {
			this.timeoutPromise.cancel();
			this.timeoutPromise = null;
		}
		if (this.computePromise) {
			this.computePromise.cancel();
			this.computePromise = null;
		}
	}

	public dispose():void {
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
		this.stop();
	}
}

class OpenLinkAction extends EditorAction {

	static ID = 'editor.action.openLink';

	private _linkDetector: LinkDetector;

	constructor(
		descriptor:EditorCommon.IEditorActionDescriptorData,
		editor:EditorCommon.ICommonCodeEditor,
		@IEditorService editorService:IEditorService,
		@IMessageService messageService:IMessageService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.UpdateOnCursorPositionChange);

		this._linkDetector = new LinkDetector(editor, editorService, messageService, editorWorkerService);
	}

	public dispose(): void {
		this._linkDetector.dispose();
		super.dispose();
	}

	public getEnablementState(): boolean {
		if(this._linkDetector.isComputing()) {
			// optimistic enablement while state is being computed
			return true;
		}
		return !!this._linkDetector.getLinkOccurence(this.editor.getPosition());
	}

	public run():TPromise<any> {
		var link = this._linkDetector.getLinkOccurence(this.editor.getPosition());
		if(link) {
			this._linkDetector.openLinkOccurence(link, false);
		}
		return TPromise.as(null);
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(OpenLinkAction, OpenLinkAction.ID, nls.localize('label', "Open Link")));
