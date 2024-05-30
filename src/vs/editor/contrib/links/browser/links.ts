/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCancelablePromise, CancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import * as resources from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./links';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { LinkProvider } from 'vs/editor/common/languages';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ClickLinkGesture, ClickLinkKeyboardEvent, ClickLinkMouseEvent } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { getLinks, Link, LinksList } from 'vs/editor/contrib/links/browser/getLinks';
import * as nls from 'vs/nls';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class LinkDetector extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.linkDetector';

	public static get(editor: ICodeEditor): LinkDetector | null {
		return editor.getContribution<LinkDetector>(LinkDetector.ID);
	}

	private readonly providers: LanguageFeatureRegistry<LinkProvider>;
	private readonly debounceInformation: IFeatureDebounceInformation;
	private readonly computeLinks: RunOnceScheduler;
	private computePromise: CancelablePromise<LinksList> | null;
	private activeLinksList: LinksList | null;
	private activeLinkDecorationId: string | null;
	private currentOccurrences: { [decorationId: string]: LinkOccurrence };

	constructor(
		private readonly editor: ICodeEditor,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
	) {
		super();

		this.providers = this.languageFeaturesService.linkProvider;
		this.debounceInformation = languageFeatureDebounceService.for(this.providers, 'Links', { min: 1000, max: 4000 });
		this.computeLinks = this._register(new RunOnceScheduler(() => this.computeLinksNow(), 1000));
		this.computePromise = null;
		this.activeLinksList = null;
		this.currentOccurrences = {};
		this.activeLinkDecorationId = null;

		const clickLinkGesture = this._register(new ClickLinkGesture(editor));

		this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
			this._onEditorMouseMove(mouseEvent, keyboardEvent);
		}));
		this._register(clickLinkGesture.onExecute((e) => {
			this.onEditorMouseUp(e);
		}));
		this._register(clickLinkGesture.onCancel((e) => {
			this.cleanUpActiveLinkDecoration();
		}));
		this._register(editor.onDidChangeConfiguration((e) => {
			if (!e.hasChanged(EditorOption.links)) {
				return;
			}
			// Remove any links (for the getting disabled case)
			this.updateDecorations([]);

			// Stop any computation (for the getting disabled case)
			this.stop();

			// Start computing (for the getting enabled case)
			this.computeLinks.schedule(0);
		}));
		this._register(editor.onDidChangeModelContent((e) => {
			if (!this.editor.hasModel()) {
				return;
			}
			this.computeLinks.schedule(this.debounceInformation.get(this.editor.getModel()));
		}));
		this._register(editor.onDidChangeModel((e) => {
			this.currentOccurrences = {};
			this.activeLinkDecorationId = null;
			this.stop();
			this.computeLinks.schedule(0);
		}));
		this._register(editor.onDidChangeModelLanguage((e) => {
			this.stop();
			this.computeLinks.schedule(0);
		}));
		this._register(this.providers.onDidChange((e) => {
			this.stop();
			this.computeLinks.schedule(0);
		}));

		this.computeLinks.schedule(0);
	}

	private async computeLinksNow(): Promise<void> {
		if (!this.editor.hasModel() || !this.editor.getOption(EditorOption.links)) {
			return;
		}

		const model = this.editor.getModel();

		if (model.isTooLargeForSyncing()) {
			return;
		}

		if (!this.providers.has(model)) {
			return;
		}

		if (this.activeLinksList) {
			this.activeLinksList.dispose();
			this.activeLinksList = null;
		}

		this.computePromise = createCancelablePromise(token => getLinks(this.providers, model, token));
		try {
			const sw = new StopWatch(false);
			this.activeLinksList = await this.computePromise;
			this.debounceInformation.update(model, sw.elapsed());
			if (model.isDisposed()) {
				return;
			}
			this.updateDecorations(this.activeLinksList.links);
		} catch (err) {
			onUnexpectedError(err);
		} finally {
			this.computePromise = null;
		}
	}

	private updateDecorations(links: Link[]): void {
		const useMetaKey = (this.editor.getOption(EditorOption.multiCursorModifier) === 'altKey');
		const oldDecorations: string[] = [];
		const keys = Object.keys(this.currentOccurrences);
		for (const decorationId of keys) {
			const occurence = this.currentOccurrences[decorationId];
			oldDecorations.push(occurence.decorationId);
		}

		const newDecorations: IModelDeltaDecoration[] = [];
		if (links) {
			// Not sure why this is sometimes null
			for (const link of links) {
				newDecorations.push(LinkOccurrence.decoration(link, useMetaKey));
			}
		}

		this.editor.changeDecorations((changeAccessor) => {
			const decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);

			this.currentOccurrences = {};
			this.activeLinkDecorationId = null;
			for (let i = 0, len = decorations.length; i < len; i++) {
				const occurence = new LinkOccurrence(links[i], decorations[i]);
				this.currentOccurrences[occurence.decorationId] = occurence;
			}
		});
	}

	private _onEditorMouseMove(mouseEvent: ClickLinkMouseEvent, withKey: ClickLinkKeyboardEvent | null): void {
		const useMetaKey = (this.editor.getOption(EditorOption.multiCursorModifier) === 'altKey');
		if (this.isEnabled(mouseEvent, withKey)) {
			this.cleanUpActiveLinkDecoration(); // always remove previous link decoration as their can only be one
			const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
			if (occurrence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurrence.activate(changeAccessor, useMetaKey);
					this.activeLinkDecorationId = occurrence.decorationId;
				});
			}
		} else {
			this.cleanUpActiveLinkDecoration();
		}
	}

	private cleanUpActiveLinkDecoration(): void {
		const useMetaKey = (this.editor.getOption(EditorOption.multiCursorModifier) === 'altKey');
		if (this.activeLinkDecorationId) {
			const occurrence = this.currentOccurrences[this.activeLinkDecorationId];
			if (occurrence) {
				this.editor.changeDecorations((changeAccessor) => {
					occurrence.deactivate(changeAccessor, useMetaKey);
				});
			}

			this.activeLinkDecorationId = null;
		}
	}

	private onEditorMouseUp(mouseEvent: ClickLinkMouseEvent): void {
		if (!this.isEnabled(mouseEvent)) {
			return;
		}
		const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
		if (!occurrence) {
			return;
		}
		this.openLinkOccurrence(occurrence, mouseEvent.hasSideBySideModifier, true /* from user gesture */);
	}

	public openLinkOccurrence(occurrence: LinkOccurrence, openToSide: boolean, fromUserGesture = false): void {

		if (!this.openerService) {
			return;
		}

		const { link } = occurrence;

		link.resolve(CancellationToken.None).then(uri => {

			// Support for relative file URIs of the shape file://./relativeFile.txt or file:///./relativeFile.txt
			if (typeof uri === 'string' && this.editor.hasModel()) {
				const modelUri = this.editor.getModel().uri;
				if (modelUri.scheme === Schemas.file && uri.startsWith(`${Schemas.file}:`)) {
					const parsedUri = URI.parse(uri);
					if (parsedUri.scheme === Schemas.file) {
						const fsPath = resources.originalFSPath(parsedUri);

						let relativePath: string | null = null;
						if (fsPath.startsWith('/./') || fsPath.startsWith('\\.\\')) {
							relativePath = `.${fsPath.substr(1)}`;
						} else if (fsPath.startsWith('//./') || fsPath.startsWith('\\\\.\\')) {
							relativePath = `.${fsPath.substr(2)}`;
						}

						if (relativePath) {
							uri = resources.joinPath(modelUri, relativePath);
						}
					}
				}
			}

			return this.openerService.open(uri, { openToSide, fromUserGesture, allowContributedOpeners: true, allowCommands: true, fromWorkspace: true });

		}, err => {
			const messageOrError =
				err instanceof Error ? (<Error>err).message : err;
			// different error cases
			if (messageOrError === 'invalid') {
				this.notificationService.warn(nls.localize('invalid.url', 'Failed to open this link because it is not well-formed: {0}', link.url!.toString()));
			} else if (messageOrError === 'missing') {
				this.notificationService.warn(nls.localize('missing.url', 'Failed to open this link because its target is missing.'));
			} else {
				onUnexpectedError(err);
			}
		});
	}

	public getLinkOccurrence(position: Position | null): LinkOccurrence | null {
		if (!this.editor.hasModel() || !position) {
			return null;
		}
		const decorations = this.editor.getModel().getDecorationsInRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, 0, true);

		for (const decoration of decorations) {
			const currentOccurrence = this.currentOccurrences[decoration.id];
			if (currentOccurrence) {
				return currentOccurrence;
			}
		}

		return null;
	}

	private isEnabled(mouseEvent: ClickLinkMouseEvent, withKey?: ClickLinkKeyboardEvent | null): boolean {
		return Boolean(
			(mouseEvent.target.type === MouseTargetType.CONTENT_TEXT)
			&& (mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey))
		);
	}

	private stop(): void {
		this.computeLinks.cancel();
		if (this.activeLinksList) {
			this.activeLinksList?.dispose();
			this.activeLinksList = null;
		}
		if (this.computePromise) {
			this.computePromise.cancel();
			this.computePromise = null;
		}
	}

	public override dispose(): void {
		super.dispose();
		this.stop();
	}
}

const decoration = {
	general: ModelDecorationOptions.register({
		description: 'detected-link',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		collapseOnReplaceEdit: true,
		inlineClassName: 'detected-link'
	}),
	active: ModelDecorationOptions.register({
		description: 'detected-link-active',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		collapseOnReplaceEdit: true,
		inlineClassName: 'detected-link-active'
	})
};

class LinkOccurrence {

	public static decoration(link: Link, useMetaKey: boolean): IModelDeltaDecoration {
		return {
			range: link.range,
			options: LinkOccurrence._getOptions(link, useMetaKey, false)
		};
	}

	private static _getOptions(link: Link, useMetaKey: boolean, isActive: boolean): ModelDecorationOptions {
		const options = { ... (isActive ? decoration.active : decoration.general) };
		options.hoverMessage = getHoverMessage(link, useMetaKey);
		return options;
	}

	public decorationId: string;
	public link: Link;

	constructor(link: Link, decorationId: string) {
		this.link = link;
		this.decorationId = decorationId;
	}

	public activate(changeAccessor: IModelDecorationsChangeAccessor, useMetaKey: boolean): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, true));
	}

	public deactivate(changeAccessor: IModelDecorationsChangeAccessor, useMetaKey: boolean): void {
		changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, false));
	}
}

function getHoverMessage(link: Link, useMetaKey: boolean): MarkdownString {
	const executeCmd = link.url && /^command:/i.test(link.url.toString());

	const label = link.tooltip
		? link.tooltip
		: executeCmd
			? nls.localize('links.navigate.executeCmd', 'Execute command')
			: nls.localize('links.navigate.follow', 'Follow link');

	const kb = useMetaKey
		? platform.isMacintosh
			? nls.localize('links.navigate.kb.meta.mac', "cmd + click")
			: nls.localize('links.navigate.kb.meta', "ctrl + click")
		: platform.isMacintosh
			? nls.localize('links.navigate.kb.alt.mac', "option + click")
			: nls.localize('links.navigate.kb.alt', "alt + click");

	if (link.url) {
		let nativeLabel = '';
		if (/^command:/i.test(link.url.toString())) {
			// Don't show complete command arguments in the native tooltip
			const match = link.url.toString().match(/^command:([^?#]+)/);
			if (match) {
				const commandId = match[1];
				nativeLabel = nls.localize('tooltip.explanation', "Execute command {0}", commandId);
			}
		}
		const hoverMessage = new MarkdownString('', true)
			.appendLink(link.url.toString(true).replace(/ /g, '%20'), label, nativeLabel)
			.appendMarkdown(` (${kb})`);
		return hoverMessage;
	} else {
		return new MarkdownString().appendText(`${label} (${kb})`);
	}
}

class OpenLinkAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.openLink',
			label: nls.localize('label', "Open Link"),
			alias: 'Open Link',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const linkDetector = LinkDetector.get(editor);
		if (!linkDetector) {
			return;
		}
		if (!editor.hasModel()) {
			return;
		}

		const selections = editor.getSelections();
		for (const sel of selections) {
			const link = linkDetector.getLinkOccurrence(sel.getEndPosition());
			if (link) {
				linkDetector.openLinkOccurrence(link, false);
			}
		}
	}
}

registerEditorContribution(LinkDetector.ID, LinkDetector, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(OpenLinkAction);
