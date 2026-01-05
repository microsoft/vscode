/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCancelablePromise, CancelablePromise, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as platform from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import './links.css';
import { ICodeEditor, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { LinkProvider } from '../../../common/languages.js';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ClickLinkGesture, ClickLinkKeyboardEvent, ClickLinkMouseEvent } from '../../gotoSymbol/browser/link/clickLinkGesture.js';
import { getLinks, Link, LinksList } from './getLinks.js';
import * as nls from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

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
				err instanceof Error ? err.message : err;
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
			&& ((mouseEvent.hasTriggerModifier || (withKey && withKey.keyCodeIsTriggerKey)) || mouseEvent.isMiddleClick && mouseEvent.mouseMiddleClickAction === 'openLink')
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
			label: nls.localize2('label', "Open Link"),
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
