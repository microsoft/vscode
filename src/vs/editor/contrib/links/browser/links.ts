/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./links';
import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMessageService } from 'vs/platform/message/common/message';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { LinkProviderRegistry } from 'vs/editor/common/modes';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IEditorMouseEvent, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { getLinks, Link } from 'vs/editor/contrib/links/common/links';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorLinkForeground, editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';

class LinkOccurence {

	public static decoration(link: Link): editorCommon.IModelDeltaDecoration {
		return {
			range: {
				startLineNumber: link.range.startLineNumber,
				startColumn: link.range.startColumn,
				endLineNumber: link.range.endLineNumber,
				endColumn: link.range.endColumn
			},
			options: LinkOccurence._getOptions(link, false)
		};
	}

	private static _getOptions(link: Link, isActive: boolean): editorCommon.IModelDecorationOptions {
		var result = '';

		if (isActive) {
			result += LinkDetector.CLASS_NAME_ACTIVE;
		} else {
			result += LinkDetector.CLASS_NAME;
		}

		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			inlineClassName: result,
			hoverMessage: LinkDetector.HOVER_MESSAGE_GENERAL
		};
	}

	public decorationId: string;
	public link: Link;

	constructor(link: Link, decorationId: string/*, changeAccessor:editorCommon.IModelDecorationsChangeAccessor*/) {
		this.link = link;
		this.decorationId = decorationId;
	}

	public activate(changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(this.link, true));
	}

	public deactivate(changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(this.link, false));
	}
}

@editorContribution
class LinkDetector implements editorCommon.IEditorContribution {

	private static ID: string = 'editor.linkDetector';

	public static get(editor: editorCommon.ICommonCodeEditor): LinkDetector {
		return editor.getContribution<LinkDetector>(LinkDetector.ID);
	}

	static RECOMPUTE_TIME = 1000; // ms
	static TRIGGER_KEY_VALUE = platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
	static TRIGGER_MODIFIER = platform.isMacintosh ? 'metaKey' : 'ctrlKey';
	static HOVER_MESSAGE_GENERAL = platform.isMacintosh ? nls.localize('links.navigate.mac', "Cmd + click to follow link") : nls.localize('links.navigate', "Ctrl + click to follow link");
	static CLASS_NAME = 'detected-link';
	static CLASS_NAME_ACTIVE = 'detected-link-active';

	private editor: ICodeEditor;
	private listenersToRemove: IDisposable[];
	private timeoutPromise: TPromise<void>;
	private computePromise: TPromise<void>;
	private activeLinkDecorationId: string;
	private lastMouseEvent: IEditorMouseEvent;
	private openerService: IOpenerService;
	private messageService: IMessageService;
	private editorWorkerService: IEditorWorkerService;
	private currentOccurences: { [decorationId: string]: LinkOccurence; };

	constructor(
		editor: ICodeEditor,
		@IOpenerService openerService: IOpenerService,
		@IMessageService messageService: IMessageService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		this.editor = editor;
		this.openerService = openerService;
		this.messageService = messageService;
		this.editorWorkerService = editorWorkerService;
		this.listenersToRemove = [];
		this.listenersToRemove.push(editor.onDidChangeModelContent((e) => this.onChange()));
		this.listenersToRemove.push(editor.onDidChangeModel((e) => this.onModelChanged()));
		this.listenersToRemove.push(editor.onDidChangeModelLanguage((e) => this.onModelModeChanged()));
		this.listenersToRemove.push(LinkProviderRegistry.onDidChange((e) => this.onModelModeChanged()));
		this.listenersToRemove.push(this.editor.onMouseUp((e: IEditorMouseEvent) => this.onEditorMouseUp(e)));
		this.listenersToRemove.push(this.editor.onMouseMove((e: IEditorMouseEvent) => this.onEditorMouseMove(e)));
		this.listenersToRemove.push(this.editor.onKeyDown((e: IKeyboardEvent) => this.onEditorKeyDown(e)));
		this.listenersToRemove.push(this.editor.onKeyUp((e: IKeyboardEvent) => this.onEditorKeyUp(e)));
		this.timeoutPromise = null;
		this.computePromise = null;
		this.currentOccurences = {};
		this.activeLinkDecorationId = null;
		this.beginCompute();
	}

	public getId(): string {
		return LinkDetector.ID;
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

	private onChange(): void {
		if (!this.timeoutPromise) {
			this.timeoutPromise = TPromise.timeout(LinkDetector.RECOMPUTE_TIME);
			this.timeoutPromise.then(() => {
				this.timeoutPromise = null;
				this.beginCompute();
			});
		}
	}

	private beginCompute(): void {
		if (!this.editor.getModel()) {
			return;
		}

		if (!LinkProviderRegistry.has(this.editor.getModel())) {
			return;
		}

		this.computePromise = getLinks(this.editor.getModel()).then(links => {
			this.updateDecorations(links);
			this.computePromise = null;
		});
	}

	private updateDecorations(links: Link[]): void {
		this.editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			var oldDecorations: string[] = [];
			let keys = Object.keys(this.currentOccurences);
			for (let i = 0, len = keys.length; i < len; i++) {
				let decorationId = keys[i];
				let occurance = this.currentOccurences[decorationId];
				oldDecorations.push(occurance.decorationId);
			}

			var newDecorations: editorCommon.IModelDeltaDecoration[] = [];
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

	private onEditorKeyDown(e: IKeyboardEvent): void {
		if (e.keyCode === LinkDetector.TRIGGER_KEY_VALUE && this.lastMouseEvent) {
			this.onEditorMouseMove(this.lastMouseEvent, e);
		}
	}

	private onEditorKeyUp(e: IKeyboardEvent): void {
		if (e.keyCode === LinkDetector.TRIGGER_KEY_VALUE) {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private onEditorMouseMove(mouseEvent: IEditorMouseEvent, withKey?: IKeyboardEvent): void {
		this.lastMouseEvent = mouseEvent;

		if (this.isEnabled(mouseEvent, withKey)) {
			this.cleanUpActiveLinkDecoration(); // always remove previous link decoration as their can only be one
			var occurence = this.getLinkOccurence(mouseEvent.target.position);
			if (occurence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurence.activate(changeAccessor);
					this.activeLinkDecorationId = occurence.decorationId;
				});
			}
		} else {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private cleanUpActiveLinkDecoration(): void {
		if (this.activeLinkDecorationId) {
			var occurence = this.currentOccurences[this.activeLinkDecorationId];
			if (occurence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurence.deactivate(changeAccessor);
				});
			}

			this.activeLinkDecorationId = null;
		}
	}

	private onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		if (!this.isEnabled(mouseEvent)) {
			return;
		}
		var occurence = this.getLinkOccurence(mouseEvent.target.position);
		if (!occurence) {
			return;
		}
		this.openLinkOccurence(occurence, mouseEvent.event.altKey);
	}

	public openLinkOccurence(occurence: LinkOccurence, openToSide: boolean): void {

		if (!this.openerService) {
			return;
		}

		const {link} = occurence;

		link.resolve().then(uri => {
			// open the uri
			return this.openerService.open(uri, { openToSide });

		}, err => {
			// different error cases
			if (err === 'invalid') {
				this.messageService.show(Severity.Warning, nls.localize('invalid.url', 'Sorry, failed to open this link because it is not well-formed: {0}', link.url));
			} else if (err === 'missing') {
				this.messageService.show(Severity.Warning, nls.localize('missing.url', 'Sorry, failed to open this link because its target is missing.'));
			} else {
				onUnexpectedError(err);
			}
		}).done(null, onUnexpectedError);
	}

	public getLinkOccurence(position: editorCommon.IPosition): LinkOccurence {
		var decorations = this.editor.getModel().getDecorationsInRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, 0, true);

		for (var i = 0; i < decorations.length; i++) {
			var decoration = decorations[i];
			var currentOccurence = this.currentOccurences[decoration.id];
			if (currentOccurence) {
				return currentOccurence;
			}
		}

		return null;
	}

	private isEnabled(mouseEvent: IEditorMouseEvent, withKey?: IKeyboardEvent): boolean {
		return mouseEvent.target.type === editorCommon.MouseTargetType.CONTENT_TEXT &&
			(mouseEvent.event[LinkDetector.TRIGGER_MODIFIER] || (withKey && withKey.keyCode === LinkDetector.TRIGGER_KEY_VALUE));
	}

	private stop(): void {
		if (this.timeoutPromise) {
			this.timeoutPromise.cancel();
			this.timeoutPromise = null;
		}
		if (this.computePromise) {
			this.computePromise.cancel();
			this.computePromise = null;
		}
	}

	public dispose(): void {
		this.listenersToRemove = dispose(this.listenersToRemove);
		this.stop();
	}
}

@editorAction
class OpenLinkAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.openLink',
			label: nls.localize('label', "Open Link"),
			alias: 'Open Link',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		let linkDetector = LinkDetector.get(editor);
		if (!linkDetector) {
			return;
		}

		let link = linkDetector.getLinkOccurence(editor.getPosition());
		if (link) {
			linkDetector.openLinkOccurence(link, false);
		}
	}
}

registerThemingParticipant((theme, collector) => {
	let activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor.${theme.selector} .detected-link-active { color: ${activeLinkForeground} !important; }`);
	}
	let linkForeground = theme.getColor(editorLinkForeground);
	if (linkForeground) {
		collector.addRule(`.monaco-editor.${theme.selector} .detected-link { color: ${linkForeground} !important; }`);
	}
});