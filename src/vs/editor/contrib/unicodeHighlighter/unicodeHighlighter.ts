/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CharCode } from 'vs/base/common/charCode';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { InvisibleCharacters } from 'vs/base/common/strings';
import 'vs/css!./unicodeHighlighter';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { DeriveFromWorkspaceTrust, deriveFromWorkspaceTrust, EditorOption, InternalUnicodeHighlightOptions, unicodeHighlightConfigKeys } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecoration, IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { UnicodeHighlighterOptions, UnicodeHighlighterReason, UnicodeHighlighterReasonKind, UnicodeTextModelHighlighter } from 'vs/editor/common/modes/unicodeTextModelHighlighter';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { HoverAnchor, HoverAnchorType, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import { MarkdownHover, renderMarkdownHovers } from 'vs/editor/contrib/hover/markdownHoverParticipant';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { minimapFindMatch, minimapUnicodeHighlight, overviewRulerFindMatchForeground, overviewRulerUnicodeHighlightForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';

export class UnicodeHighlighter extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.unicodeHighlighter';

	private _highlighter: DocumentUnicodeHighlighter | ViewportUnicodeHighlighter | null = null;
	private _options: InternalUnicodeHighlightOptions;

	constructor(
		private readonly _editor: ICodeEditor,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super();

		this._register(this._editor.onDidChangeModel(() => {
			this._updateHighlighter();
		}));

		this._options = _editor.getOption(EditorOption.unicodeHighlighting);

		this._register(_workspaceTrustService.onDidChangeTrust(e => {
			this._updateHighlighter();
		}));

		this._register(_editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.unicodeHighlighting)) {
				this._options = _editor.getOption(EditorOption.unicodeHighlighting);
				this._updateHighlighter();
			}
		}));

		this._updateHighlighter();
	}

	public override dispose(): void {
		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		super.dispose();
	}

	private _updateHighlighter(): void {
		if (this._highlighter) {
			this._highlighter.dispose();
			this._highlighter = null;
		}
		if (!this._editor.hasModel()) {
			return;
		}
		const options = resolveOptions(this._workspaceTrustService.isWorkspaceTrusted(), this._options);

		if (
			[
				options.nonBasicASCII,
				options.ambiguousCharacters,
				options.invisibleCharacters,
			].every((option) => option === false)
		) {
			// Don't do anything if the feature is fully disabled
			return;
		}

		const highlightOptions: UnicodeHighlighterOptions = {
			nonBasicASCII: options.nonBasicASCII,
			ambiguousCharacters: options.ambiguousCharacters,
			invisibleCharacters: options.invisibleCharacters,
			includeComments: options.includeComments,
			allowedCodePoints: Array.from(options.allowedCharacters).map(c => c.codePointAt(0)!),
		};

		if (this._editorWorkerService.canComputeUnicodeHighlights(this._editor.getModel().uri)) {
			this._highlighter = new DocumentUnicodeHighlighter(this._editor, highlightOptions, this._editorWorkerService);
		} else {
			this._highlighter = new ViewportUnicodeHighlighter(this._editor, highlightOptions);
		}
	}

	public getDecorationInfo(decorationId: string): UnicodeHighlighterDecorationInfo | null {
		if (this._highlighter) {
			return this._highlighter.getDecorationInfo(decorationId);
		}
		return null;
	}
}

export interface UnicodeHighlighterDecorationInfo {
	reason: UnicodeHighlighterReason;
}

type RemoveDeriveFromWorkspaceTrust<T> = T extends DeriveFromWorkspaceTrust ? never : T;
type ResolvedOptions = { [TKey in keyof InternalUnicodeHighlightOptions]: RemoveDeriveFromWorkspaceTrust<InternalUnicodeHighlightOptions[TKey]> };

function resolveOptions(trusted: boolean, options: InternalUnicodeHighlightOptions): ResolvedOptions {
	let defaults;
	if (trusted) {
		defaults = {
			nonBasicASCII: false,
			ambiguousCharacters: true,
			invisibleCharacters: true,
			includeComments: true,
		};
	} else {
		defaults = {
			nonBasicASCII: true,
			ambiguousCharacters: true,
			invisibleCharacters: true,
			includeComments: false,
		};
	}

	return {
		nonBasicASCII: options.nonBasicASCII !== deriveFromWorkspaceTrust ? options.nonBasicASCII : defaults.nonBasicASCII,
		ambiguousCharacters: options.ambiguousCharacters !== deriveFromWorkspaceTrust ? options.ambiguousCharacters : defaults.ambiguousCharacters,
		invisibleCharacters: options.invisibleCharacters !== deriveFromWorkspaceTrust ? options.invisibleCharacters : defaults.invisibleCharacters,
		includeComments: options.includeComments !== deriveFromWorkspaceTrust ? options.includeComments : defaults.includeComments,
		allowedCharacters: options.allowedCharacters ?? [],
	};
}

class DocumentUnicodeHighlighter extends Disposable {
	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private _decorationIds = new Set<string>();

	constructor(
		private readonly _editor: IActiveCodeEditor,
		private readonly _options: UnicodeHighlighterOptions,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorationIds = new Set(this._model.deltaDecorations(Array.from(this._decorationIds), []));
		super.dispose();
	}

	private _update(): void {
		if (!this._model.mightContainNonBasicASCII()) {
			this._decorationIds = new Set(this._editor.deltaDecorations(Array.from(this._decorationIds), []));
			return;
		}

		const modelVersionId = this._model.getVersionId();
		this._editorWorkerService
			.computedUnicodeHighlights(this._model.uri, this._options)
			.then((ranges) => {
				if (this._model.getVersionId() !== modelVersionId) {
					// model changed in the meantime
					return;
				}
				const decorations: IModelDeltaDecoration[] = [];
				for (const range of ranges) {
					decorations.push({ range: range, options: this._options.includeComments ? DECORATION : DECORATION_HIDE_IN_COMMENTS });
				}
				this._decorationIds = new Set(this._editor.deltaDecorations(
					Array.from(this._decorationIds),
					decorations
				));
			});
	}

	public getDecorationInfo(decorationId: string): UnicodeHighlighterDecorationInfo | null {
		if (!this._decorationIds.has(decorationId)) {
			return null;
		}
		const range = this._editor.getModel().getDecorationRange(decorationId)!;
		const text = this._editor.getModel().getValueInRange(range);
		return {
			reason: computeReason(text, this._options)!,
		};
	}
}

class ViewportUnicodeHighlighter extends Disposable {

	private readonly _model: ITextModel = this._editor.getModel();
	private readonly _updateSoon: RunOnceScheduler;
	private _decorationIds = new Set<string>();

	constructor(
		private readonly _editor: IActiveCodeEditor,
		private readonly _options: UnicodeHighlighterOptions
	) {
		super();

		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));

		this._register(this._editor.onDidLayoutChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidScrollChange(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeHiddenAreas(() => {
			this._updateSoon.schedule();
		}));
		this._register(this._editor.onDidChangeModelContent(() => {
			this._updateSoon.schedule();
		}));

		this._updateSoon.schedule();
	}

	public override dispose() {
		this._decorationIds = new Set(this._model.deltaDecorations(Array.from(this._decorationIds), []));
		super.dispose();
	}

	private _update(): void {
		if (!this._model.mightContainNonBasicASCII()) {
			this._decorationIds = new Set(this._editor.deltaDecorations(Array.from(this._decorationIds), []));
			return;
		}

		const ranges = this._editor.getVisibleRanges();
		const decorations: IModelDeltaDecoration[] = [];
		for (const range of ranges) {
			const ranges = UnicodeTextModelHighlighter.computeUnicodeHighlights(this._model, this._options, range);
			for (const range of ranges) {
				decorations.push({ range, options: this._options.includeComments ? DECORATION : DECORATION_HIDE_IN_COMMENTS });
			}
		}
		this._decorationIds = new Set(this._editor.deltaDecorations(Array.from(this._decorationIds), decorations));
	}

	public getDecorationInfo(decorationId: string): UnicodeHighlighterDecorationInfo | null {
		if (!this._decorationIds.has(decorationId)) {
			return null;
		}
		const range = this._editor.getModel().getDecorationRange(decorationId)!;
		const text = this._editor.getModel().getValueInRange(range);
		return {
			reason: computeReason(text, this._options)!,
		};
	}
}

export class UnicodeHighlighterHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<UnicodeHighlighterHover>,
		public readonly range: Range,
		public readonly decoration: IModelDecoration
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class UnicodeHighlighterHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();

		const unicodeHighlighter = this._editor.getContribution<UnicodeHighlighter>(UnicodeHighlighter.ID);


		const result: MarkdownHover[] = [];
		let index = 300;
		for (const d of lineDecorations) {

			const highlightInfo = unicodeHighlighter.getDecorationInfo(d.id);
			if (!highlightInfo) {
				continue;
			}
			const char = model.getValueInRange(d.range);
			// text refers to a single character.
			const codePoint = char.codePointAt(0)!;

			function formatCodePoint(codePoint: number) {
				let value = `\`U+${codePoint.toString(16).padStart(4, '0')}\``;
				if (!InvisibleCharacters.isInvisibleCharacter(codePoint)) {
					// Don't render any control characters or any invisible characters, as they cannot be seen anyways.
					value += ` "${`${renderCodePointAsInlineCode(codePoint)}`}"`;
				}
				return value;
			}

			const codePointStr = formatCodePoint(codePoint);

			let reason: string;
			switch (highlightInfo.reason.kind) {
				case UnicodeHighlighterReasonKind.Ambiguous:
					reason = nls.localize(
						'unicodeHighlight.characterIsAmbiguous',
						'The character {0} could be confused with the character {1}, which is more common in source code.',
						codePointStr,
						formatCodePoint(highlightInfo.reason.confusableWith.codePointAt(0)!)
					);
					break;

				case UnicodeHighlighterReasonKind.Invisible:
					reason = nls.localize(
						'unicodeHighlight.characterIsInvisible',
						'The character {0} is invisible.',
						codePointStr
					);
					break;

				case UnicodeHighlighterReasonKind.NonBasicAscii:
					reason = nls.localize(
						'unicodeHighlight.characterIsNonBasicAscii',
						'The character {0} is not a basic ASCII character.',
						codePoint
					);
					break;
			}

			const adjustSettingsArgs: ShowExcludeOptionsArgs = {
				codePoint: codePoint,
				reason: highlightInfo.reason.kind,
			};

			const adjustSettings = nls.localize('unicodeHighlight.adjustSettings', 'Adjust settings');
			const contents: Array<IMarkdownString> = [{
				value: `${reason} [${adjustSettings}](command:${ShowExcludeOptions.ID}?${encodeURIComponent(JSON.stringify(adjustSettingsArgs))})`,
				isTrusted: true,
			}];

			result.push(new MarkdownHover(this, d.range, contents, index++));
		}
		return result;
	}

	public renderHoverParts(hoverParts: MarkdownHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
		return renderMarkdownHovers(hoverParts, fragment, this._editor, this._hover, this._modeService, this._openerService);
	}
}

function renderCodePointAsInlineCode(codePoint: number): string {
	if (codePoint === CharCode.BackTick) {
		return '`` ` ``';
	}
	return '`' + String.fromCodePoint(codePoint) + '`';
}

function computeReason(char: string, options: UnicodeHighlighterOptions): UnicodeHighlighterReason | null {
	return UnicodeTextModelHighlighter.computeUnicodeHighlightReason(char, options);
}

const DECORATION_HIDE_IN_COMMENTS = ModelDecorationOptions.register({
	description: 'unicode-highlight',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	className: 'unicode-highlight',
	showIfCollapsed: true,
	overviewRuler: {
		color: themeColorFromId(overviewRulerUnicodeHighlightForeground),
		position: OverviewRulerLane.Center
	},
	minimap: {
		color: themeColorFromId(minimapUnicodeHighlight),
		position: MinimapPosition.Inline
	},
	hideInCommentTokens: true
});

const DECORATION = ModelDecorationOptions.register({
	description: 'unicode-highlight',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	className: 'unicode-highlight',
	showIfCollapsed: true,
	overviewRuler: {
		color: themeColorFromId(overviewRulerFindMatchForeground),
		position: OverviewRulerLane.Center
	},
	minimap: {
		color: themeColorFromId(minimapFindMatch),
		position: MinimapPosition.Inline
	}
});

interface ShowExcludeOptionsArgs {
	codePoint: number;
	reason: UnicodeHighlighterReason['kind'];
}

export class ShowExcludeOptions extends EditorAction {
	public static ID = 'editor.action.unicodeHighlight.showExcludeOptions';
	constructor() {
		super({
			id: ShowExcludeOptions.ID,
			label: nls.localize('action.unicodeHighlight.showExcludeOptions', "Show Exclude Options"),
			alias: 'Show Exclude Options',
			precondition: undefined
		});
	}
	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor, args: any): Promise<void> {
		const { codePoint, reason } = args as ShowExcludeOptionsArgs;

		const char = String.fromCodePoint(codePoint);

		const quickPickService = accessor!.get(IQuickInputService);
		const configurationService = accessor!.get(IConfigurationService);

		interface ExtendedOptions extends IQuickPickItem {
			run(): Promise<void>;
		}

		const options: ExtendedOptions[] = [
			{
				label: nls.localize('unicodeHighlight.excludeCharFromBeingHighlighted', 'Exclude {0} from being highlighted', `U+${codePoint.toString(16)} "${char}"`),
				run: async () => {
					const existingValue = configurationService.getValue(unicodeHighlightConfigKeys.allowedCharacters);
					let value: string;
					if (typeof existingValue === 'string') {
						value = existingValue;
					} else {
						value = '';
					}

					value += char;
					await configurationService.updateValue(unicodeHighlightConfigKeys.allowedCharacters, value, ConfigurationTarget.USER);
				}
			},
		];

		if (reason === UnicodeHighlighterReasonKind.Ambiguous) {
			options.push({
				label: nls.localize('unicodeHighlight.disableHighlightingOfAmbiguousCharacters', 'Disable highlighting of ambiguous characters'),
				run: async () => {
					await configurationService.updateValue(unicodeHighlightConfigKeys.ambiguousCharacters, false, ConfigurationTarget.USER);
				}
			});
		}
		else if (reason === UnicodeHighlighterReasonKind.Invisible) {
			options.push({
				label: nls.localize('unicodeHighlight.disableHighlightingOfInvisibleCharacters', 'Disable highlighting of invisible characters'),
				run: async () => {
					await configurationService.updateValue(unicodeHighlightConfigKeys.invisibleCharacters, false, ConfigurationTarget.USER);
				}
			});
		}
		else if (reason === UnicodeHighlighterReasonKind.NonBasicAscii) {
			options.push({
				label: nls.localize('unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters', 'Disable highlighting of non basic ASCII characters'),
				run: async () => {
					await configurationService.updateValue(unicodeHighlightConfigKeys.nonBasicASCII, false, ConfigurationTarget.USER);
				}
			});
		} else {
			expectNever(reason);
		}

		const result = await quickPickService.pick(
			options,
			{ title: nls.localize('unicodeHighlight.configureUnicodeHighlightOptions', 'Configure Unicode Highlight Options') }
		);

		if (result) {
			await result.run();
		}
	}
}

function expectNever(value: never) {
	throw new Error(`Unexpected value: ${value}`);
}

registerEditorAction(ShowExcludeOptions);
registerEditorContribution(UnicodeHighlighter.ID, UnicodeHighlighter);
