/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./links';
import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as platform from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMessageService } from 'vs/platform/message/common/message';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { LinkProviderRegistry } from 'vs/editor/common/modes';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { getLinks, Link } from 'vs/editor/contrib/links/common/links';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { Position } from 'vs/editor/common/core/position';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { ClickLinkGesture, ClickLinkMouseEvent, ClickLinkKeyboardEvent } from 'vs/editor/contrib/goToDeclaration/browser/clickLinkGesture';

const HOVER_MESSAGE_GENERAL_META = (
	platform.isMacintosh
		? nls.localize('links.navigate.mac', "Cmd + click to follow link")
		: nls.localize('links.navigate', "Ctrl + click to follow link")
);

const HOVER_MESSAGE_GENERAL_ALT = nls.localize('links.navigate.al', "Alt + click to follow link");

const decoration = {
	meta: ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'detected-link',
		hoverMessage: HOVER_MESSAGE_GENERAL_META
	}),
	metaActive: ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'detected-link-active',
		hoverMessage: HOVER_MESSAGE_GENERAL_META
	}),
	alt: ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'detected-link',
		hoverMessage: HOVER_MESSAGE_GENERAL_ALT
	}),
	altActive: ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: 'detected-link-active',
		hoverMessage: HOVER_MESSAGE_GENERAL_ALT
	}),
};

class LinkOccurence {

	public static decoration(link: Link, useMetaKey: boolean): editorCommon.IModelDeltaDecoration {
		return {
			range: {
				startLineNumber: link.range.startLineNumber,
				startColumn: link.range.startColumn,
				endLineNumber: link.range.endLineNumber,
				endColumn: link.range.endColumn
			},
			options: LinkOccurence._getOptions(useMetaKey, false)
		};
	}

	private static _getOptions(useMetaKey: boolean, isActive: boolean): ModelDecorationOptions {
		if (useMetaKey) {
			return (isActive ? decoration.metaActive : decoration.meta);
		}
		return (isActive ? decoration.altActive : decoration.alt);
	}

	public decorationId: string;
	public link: Link;

	constructor(link: Link, decorationId: string) {
		this.link = link;
		this.decorationId = decorationId;
	}

	public activate(changeAccessor: editorCommon.IModelDecorationsChangeAccessor, useMetaKey: boolean): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(useMetaKey, true));
	}

	public deactivate(changeAccessor: editorCommon.IModelDecorationsChangeAccessor, useMetaKey: boolean): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurence._getOptions(useMetaKey, false));
	}
}

@editorContribution
class LinkDetector implements editorCommon.IEditorContribution {

	private static ID: string = 'editor.linkDetector';

	public static get(editor: editorCommon.ICommonCodeEditor): LinkDetector {
		return editor.getContribution<LinkDetector>(LinkDetector.ID);
	}

	static RECOMPUTE_TIME = 1000; // ms

	private editor: ICodeEditor;
	private listenersToRemove: IDisposable[];
	private timeoutPromise: TPromise<void>;
	private computePromise: TPromise<void>;
	private activeLinkDecorationId: string;
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

		let clickLinkGesture = new ClickLinkGesture(editor);
		this.listenersToRemove.push(clickLinkGesture);
		this.listenersToRemove.push(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
			this._onEditorMouseMove(mouseEvent, keyboardEvent);
		}));
		this.listenersToRemove.push(clickLinkGesture.onExecute((e) => {
			this.onEditorMouseUp(e);
		}));
		this.listenersToRemove.push(clickLinkGesture.onCancel((e) => {
			this.cleanUpActiveLinkDecoration();
		}));

		this.listenersToRemove.push(editor.onDidChangeModelContent((e) => this.onChange()));
		this.listenersToRemove.push(editor.onDidChangeModel((e) => this.onModelChanged()));
		this.listenersToRemove.push(editor.onDidChangeModelLanguage((e) => this.onModelModeChanged()));
		this.listenersToRemove.push(LinkProviderRegistry.onDidChange((e) => this.onModelModeChanged()));

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
		const useMetaKey = (this.editor.getConfiguration().multicursorModifier === 'altKey');
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
					newDecorations.push(LinkOccurence.decoration(links[i], useMetaKey));
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

	private _onEditorMouseMove(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): void {
		const useMetaKey = (this.editor.getConfiguration().multicursorModifier === 'altKey');
		if (this.isEnabled(mouseEvent, withKey)) {
			this.cleanUpActiveLinkDecoration(); // always remove previous link decoration as their can only be one
			var occurence = this.getLinkOccurence(mouseEvent.target.position);
			if (occurence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurence.activate(changeAccessor, useMetaKey);
					this.activeLinkDecorationId = occurence.decorationId;
				});
			}
		} else {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private cleanUpActiveLinkDecoration(): void {
		const useMetaKey = (this.editor.getConfiguration().multicursorModifier === 'altKey');
		if (this.activeLinkDecorationId) {
			var occurence = this.currentOccurences[this.activeLinkDecorationId];
			if (occurence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurence.deactivate(changeAccessor, useMetaKey);
				});
			}

			this.activeLinkDecorationId = null;
		}
	}

	private onEditorMouseUp(mouseEvent: ClickLinkMouseEvent): void {
		if (!this.isEnabled(mouseEvent)) {
			return;
		}
		var occurence = this.getLinkOccurence(mouseEvent.target.position);
		if (!occurence) {
			return;
		}
		this.openLinkOccurence(occurence, mouseEvent.hasSideBySideModifier);
	}

	public openLinkOccurence(occurence: LinkOccurence, openToSide: boolean): void {

		if (!this.openerService) {
			return;
		}

		const { link } = occurence;

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

	public getLinkOccurence(position: Position): LinkOccurence {
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

	private isEnabled(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent): boolean {
		return (
			mouseEvent.target.type === MouseTargetType.CONTENT_TEXT
			&& (mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey))
		);
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
		collector.addRule(`.monaco-editor .detected-link-active { color: ${activeLinkForeground} !important; }`);
	}
});