/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from 'vs/base/browser/browser';
import { BrowserFeatures } from 'vs/base/browser/canIUse';
import * as dom from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { distinct } from 'vs/base/common/arrays';
import { RunOnceScheduler, timeout } from 'vs/base/common/async';
import { memoize } from 'vs/base/common/decorators';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { dispose, disposeIfDisposable, IDisposable } from 'vs/base/common/lifecycle';
import * as env from 'vs/base/common/platform';
import severity from 'vs/base/common/severity';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { GlyphMarginLane, IModelDecorationOptions, IModelDecorationOverviewRulerOptions, IModelDecorationsChangeAccessor, ITextModel, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { getBreakpointMessageAndIcon } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { BreakpointWidget } from 'vs/workbench/contrib/debug/browser/breakpointWidget';
import * as icons from 'vs/workbench/contrib/debug/browser/debugIcons';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, DebuggerString, IBreakpoint, IBreakpointEditorContribution, IBreakpointUpdateData, IDebugConfiguration, IDebugService, IDebugSession, State } from 'vs/workbench/contrib/debug/common/debug';

const $ = dom.$;

interface IBreakpointDecoration {
	decorationId: string;
	breakpoint: IBreakpoint;
	range: Range;
	inlineWidget?: InlineBreakpointWidget;
}

const breakpointHelperDecoration: IModelDecorationOptions = {
	description: 'breakpoint-helper-decoration',
	glyphMarginClassName: ThemeIcon.asClassName(icons.debugBreakpointHint),
	glyphMargin: { position: GlyphMarginLane.Right },
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
};

export function createBreakpointDecorations(accessor: ServicesAccessor, model: ITextModel, breakpoints: ReadonlyArray<IBreakpoint>, state: State, breakpointsActivated: boolean, showBreakpointsInOverviewRuler: boolean): { range: Range; options: IModelDecorationOptions }[] {
	const result: { range: Range; options: IModelDecorationOptions }[] = [];
	breakpoints.forEach((breakpoint) => {
		if (breakpoint.lineNumber > model.getLineCount()) {
			return;
		}
		const hasOtherBreakpointsOnLine = breakpoints.some(bp => bp !== breakpoint && bp.lineNumber === breakpoint.lineNumber);
		const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
		const range = model.validateRange(
			breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1)
				: new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1) // Decoration has to have a width #20688
		);

		result.push({
			options: getBreakpointDecorationOptions(accessor, model, breakpoint, state, breakpointsActivated, showBreakpointsInOverviewRuler, hasOtherBreakpointsOnLine),
			range
		});
	});

	return result;
}

function getBreakpointDecorationOptions(accessor: ServicesAccessor, model: ITextModel, breakpoint: IBreakpoint, state: State, breakpointsActivated: boolean, showBreakpointsInOverviewRuler: boolean, hasOtherBreakpointsOnLine: boolean): IModelDecorationOptions {
	const debugService = accessor.get(IDebugService);
	const languageService = accessor.get(ILanguageService);
	const { icon, message, showAdapterUnverifiedMessage } = getBreakpointMessageAndIcon(state, breakpointsActivated, breakpoint, undefined);
	let glyphMarginHoverMessage: MarkdownString | undefined;

	let unverifiedMessage: string | undefined;
	if (showAdapterUnverifiedMessage) {
		let langId: string | undefined;
		unverifiedMessage = debugService.getModel().getSessions().map(s => {
			const dbg = debugService.getAdapterManager().getDebugger(s.configuration.type);
			const message = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
			if (message) {
				if (!langId) {
					// Lazily compute this, only if needed for some debug adapter
					langId = languageService.guessLanguageIdByFilepathOrFirstLine(breakpoint.uri) ?? undefined;
				}
				return langId && dbg.interestedInLanguage(langId) ? message : undefined;
			}

			return undefined;
		})
			.find(messages => !!messages);
	}

	if (message) {
		glyphMarginHoverMessage = new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true });
		if (breakpoint.condition || breakpoint.hitCondition) {
			const languageId = model.getLanguageId();
			glyphMarginHoverMessage.appendCodeblock(languageId, message);
			if (unverifiedMessage) {
				glyphMarginHoverMessage.appendMarkdown('$(warning) ' + unverifiedMessage);
			}
		} else {
			glyphMarginHoverMessage.appendText(message);
			if (unverifiedMessage) {
				glyphMarginHoverMessage.appendMarkdown('\n\n$(warning) ' + unverifiedMessage);
			}
		}
	} else if (unverifiedMessage) {
		glyphMarginHoverMessage = new MarkdownString(undefined, { isTrusted: true, supportThemeIcons: true }).appendMarkdown(unverifiedMessage);
	}

	let overviewRulerDecoration: IModelDecorationOverviewRulerOptions | null = null;
	if (showBreakpointsInOverviewRuler) {
		overviewRulerDecoration = {
			color: themeColorFromId(debugIconBreakpointForeground),
			position: OverviewRulerLane.Left
		};
	}

	const renderInline = breakpoint.column && (hasOtherBreakpointsOnLine || breakpoint.column > model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber));
	return {
		description: 'breakpoint-decoration',
		glyphMargin: { position: GlyphMarginLane.Right },
		glyphMarginClassName: ThemeIcon.asClassName(icon),
		glyphMarginHoverMessage,
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		before: renderInline ? {
			content: noBreakWhitespace,
			inlineClassName: `debug-breakpoint-placeholder`,
			inlineClassNameAffectsLetterSpacing: true
		} : undefined,
		overviewRuler: overviewRulerDecoration,
		zIndex: 9999
	};
}

type BreakpointsForLine = { lineNumber: number; positions: IPosition[] };

async function requestBreakpointCandidateLocations(model: ITextModel, lineNumbers: number[], session: IDebugSession): Promise<BreakpointsForLine[]> {
	if (!session.capabilities.supportsBreakpointLocationsRequest) {
		return [];
	}

	return await Promise.all(distinct(lineNumbers, l => l).map(async lineNumber => {
		try {
			return { lineNumber, positions: await session.breakpointsLocations(model.uri, lineNumber) };
		} catch {
			return { lineNumber, positions: [] };
		}
	}));
}

function createCandidateDecorations(model: ITextModel, breakpointDecorations: IBreakpointDecoration[], lineBreakpoints: BreakpointsForLine[]): { range: Range; options: IModelDecorationOptions; breakpoint: IBreakpoint | undefined }[] {
	const result: { range: Range; options: IModelDecorationOptions; breakpoint: IBreakpoint | undefined }[] = [];
	for (const { positions, lineNumber } of lineBreakpoints) {
		if (positions.length === 0) {
			continue;
		}

		// Do not render candidates if there is only one, since it is already covered by the line breakpoint
		const firstColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		const lastColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
		positions.forEach(p => {
			const range = new Range(p.lineNumber, p.column, p.lineNumber, p.column + 1);
			if ((p.column <= firstColumn && !breakpointDecorations.some(bp => bp.range.startColumn > firstColumn && bp.range.startLineNumber === p.lineNumber)) || p.column > lastColumn) {
				// Do not render candidates on the start of the line if there's no other breakpoint on the line.
				return;
			}

			const breakpointAtPosition = breakpointDecorations.find(bpd => bpd.range.equalsRange(range));
			if (breakpointAtPosition && breakpointAtPosition.inlineWidget) {
				// Space already occupied, do not render candidate.
				return;
			}
			result.push({
				range,
				options: {
					description: 'breakpoint-placeholder-decoration',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					before: breakpointAtPosition ? undefined : {
						content: noBreakWhitespace,
						inlineClassName: `debug-breakpoint-placeholder`,
						inlineClassNameAffectsLetterSpacing: true
					},
				},
				breakpoint: breakpointAtPosition ? breakpointAtPosition.breakpoint : undefined
			});
		});
	}

	return result;
}

export class BreakpointEditorContribution implements IBreakpointEditorContribution {

	private breakpointHintDecoration: string | null = null;
	private breakpointWidget: BreakpointWidget | undefined;
	private breakpointWidgetVisible!: IContextKey<boolean>;
	private toDispose: IDisposable[] = [];
	private ignoreDecorationsChangedEvent = false;
	private ignoreBreakpointsChangeEvent = false;
	private breakpointDecorations: IBreakpointDecoration[] = [];
	private candidateDecorations: { decorationId: string; inlineWidget: InlineBreakpointWidget }[] = [];
	private setDecorationsScheduler!: RunOnceScheduler;

	constructor(
		private readonly editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService
	) {
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.setDecorationsScheduler = new RunOnceScheduler(() => this.setDecorations(), 30);
		this.setDecorationsScheduler.schedule();
		this.registerListeners();
	}

	/**
	 * Returns context menu actions at the line number if breakpoints can be
	 * set. This is used by the {@link TestingDecorations} to allow breakpoint
	 * setting on lines where breakpoint "run" actions are present.
	 */
	public getContextMenuActionsAtPosition(lineNumber: number, model: ITextModel) {
		if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
			return [];
		}

		if (!this.debugService.canSetBreakpointsIn(model)) {
			return [];
		}

		const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber, uri: model.uri });
		return this.getContextMenuActions(breakpoints, model.uri, lineNumber);
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
				return;
			}

			const model = this.editor.getModel();
			if (!e.target.position
				|| !model
				|| e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN
				|| e.target.detail.isAfterLines
				|| !this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)
				// don't return early if there's a breakpoint
				&& !e.target.element?.className.includes('breakpoint')
			) {
				return;
			}
			const canSetBreakpoints = this.debugService.canSetBreakpointsIn(model);
			const lineNumber = e.target.position.lineNumber;
			const uri = model.uri;

			if (e.event.rightButton || (env.isMacintosh && e.event.leftButton && e.event.ctrlKey)) {
				// handled by editor gutter context menu
				return;
			} else {
				const breakpoints = this.debugService.getModel().getBreakpoints({ uri, lineNumber });

				if (breakpoints.length) {
					const isShiftPressed = e.event.shiftKey;
					const enabled = breakpoints.some(bp => bp.enabled);

					if (isShiftPressed) {
						breakpoints.forEach(bp => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
					} else if (!env.isLinux && breakpoints.some(bp => !!bp.condition || !!bp.logMessage || !!bp.hitCondition)) {
						// Show the dialog if there is a potential condition to be accidently lost.
						// Do not show dialog on linux due to electron issue freezing the mouse #50026
						const logPoint = breakpoints.every(bp => !!bp.logMessage);
						const breakpointType = logPoint ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");

						const disabledBreakpointDialogMessage = nls.localize(
							'breakpointHasConditionDisabled',
							"This {0} has a {1} that will get lost on remove. Consider enabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);
						const enabledBreakpointDialogMessage = nls.localize(
							'breakpointHasConditionEnabled',
							"This {0} has a {1} that will get lost on remove. Consider disabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);

						await this.dialogService.prompt({
							type: severity.Info,
							message: enabled ? enabledBreakpointDialogMessage : disabledBreakpointDialogMessage,
							buttons: [
								{
									label: nls.localize({ key: 'removeLogPoint', comment: ['&& denotes a mnemonic'] }, "&&Remove {0}", breakpointType),
									run: () => breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()))
								},
								{
									label: nls.localize('disableLogPoint', "{0} {1}", enabled ? nls.localize({ key: 'disable', comment: ['&& denotes a mnemonic'] }, "&&Disable") : nls.localize({ key: 'enable', comment: ['&& denotes a mnemonic'] }, "&&Enable"), breakpointType),
									run: () => breakpoints.forEach(bp => this.debugService.enableOrDisableBreakpoints(!enabled, bp))
								}
							],
							cancelButton: true
						});
					} else {
						if (!enabled) {
							breakpoints.forEach(bp => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
						} else {
							breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
						}
					}
				} else if (canSetBreakpoints) {
					this.debugService.addBreakpoints(uri, [{ lineNumber }]);
				}
			}
		}));

		if (!(BrowserFeatures.pointerEvents && isSafari)) {
			/**
			 * We disable the hover feature for Safari on iOS as
			 * 1. Browser hover events are handled specially by the system (it treats first click as hover if there is `:hover` css registered). Below hover behavior will confuse users with inconsistent expeirence.
			 * 2. When users click on line numbers, the breakpoint hint displays immediately, however it doesn't create the breakpoint unless users click on the left gutter. On a touch screen, it's hard to click on that small area.
			 */
			this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => {
				if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
					return;
				}

				let showBreakpointHintAtLineNumber = -1;
				const model = this.editor.getModel();
				if (model && e.target.position && (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) && this.debugService.canSetBreakpointsIn(model) &&
					this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
					const data = e.target.detail;
					if (!data.isAfterLines) {
						showBreakpointHintAtLineNumber = e.target.position.lineNumber;
					}
				}
				this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
			}));
			this.toDispose.push(this.editor.onMouseLeave(() => {
				this.ensureBreakpointHintDecoration(-1);
			}));
		}


		this.toDispose.push(this.editor.onDidChangeModel(async () => {
			this.closeBreakpointWidget();
			await this.setDecorations();
		}));
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => {
			if (!this.ignoreBreakpointsChangeEvent && !this.setDecorationsScheduler.isScheduled()) {
				this.setDecorationsScheduler.schedule();
			}
		}));
		this.toDispose.push(this.debugService.onDidChangeState(() => {
			// We need to update breakpoint decorations when state changes since the top stack frame and breakpoint decoration might change
			if (!this.setDecorationsScheduler.isScheduled()) {
				this.setDecorationsScheduler.schedule();
			}
		}));
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.onModelDecorationsChanged()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('debug.showBreakpointsInOverviewRuler') || e.affectsConfiguration('debug.showInlineBreakpointCandidates')) {
				await this.setDecorations();
			}
		}));
	}

	private getContextMenuActions(breakpoints: ReadonlyArray<IBreakpoint>, uri: URI, lineNumber: number, column?: number): IAction[] {
		const actions: IAction[] = [];

		if (breakpoints.length === 1) {
			const breakpointType = breakpoints[0].logMessage ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");
			actions.push(new Action('debug.removeBreakpoint', nls.localize('removeBreakpoint', "Remove {0}", breakpointType), undefined, true, async () => {
				await this.debugService.removeBreakpoints(breakpoints[0].getId());
			}));
			actions.push(new Action(
				'workbench.debug.action.editBreakpointAction',
				nls.localize('editBreakpoint', "Edit {0}...", breakpointType),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column))
			));

			actions.push(new Action(
				`workbench.debug.viewlet.action.toggleBreakpoint`,
				breakpoints[0].enabled ? nls.localize('disableBreakpoint', "Disable {0}", breakpointType) : nls.localize('enableBreakpoint', "Enable {0}", breakpointType),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!breakpoints[0].enabled, breakpoints[0])
			));
		} else if (breakpoints.length > 1) {
			const sorted = breakpoints.slice().sort((first, second) => (first.column && second.column) ? first.column - second.column : 1);
			actions.push(new SubmenuAction('debug.removeBreakpoints', nls.localize('removeBreakpoints', "Remove Breakpoints"), sorted.map(bp => new Action(
				'removeInlineBreakpoint',
				bp.column ? nls.localize('removeInlineBreakpointOnColumn', "Remove Inline Breakpoint on Column {0}", bp.column) : nls.localize('removeLineBreakpoint', "Remove Line Breakpoint"),
				undefined,
				true,
				() => this.debugService.removeBreakpoints(bp.getId())
			))));

			actions.push(new SubmenuAction('debug.editBreakpoints', nls.localize('editBreakpoints', "Edit Breakpoints"), sorted.map(bp =>
				new Action('editBreakpoint',
					bp.column ? nls.localize('editInlineBreakpointOnColumn', "Edit Inline Breakpoint on Column {0}", bp.column) : nls.localize('editLineBreakpoint', "Edit Line Breakpoint"),
					undefined,
					true,
					() => Promise.resolve(this.showBreakpointWidget(bp.lineNumber, bp.column))
				)
			)));

			actions.push(new SubmenuAction('debug.enableDisableBreakpoints', nls.localize('enableDisableBreakpoints', "Enable/Disable Breakpoints"), sorted.map(bp => new Action(
				bp.enabled ? 'disableColumnBreakpoint' : 'enableColumnBreakpoint',
				bp.enabled ? (bp.column ? nls.localize('disableInlineColumnBreakpoint', "Disable Inline Breakpoint on Column {0}", bp.column) : nls.localize('disableBreakpointOnLine', "Disable Line Breakpoint"))
					: (bp.column ? nls.localize('enableBreakpoints', "Enable Inline Breakpoint on Column {0}", bp.column) : nls.localize('enableBreakpointOnLine', "Enable Line Breakpoint")),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!bp.enabled, bp)
			))));
		} else {
			actions.push(new Action(
				'addBreakpoint',
				nls.localize('addBreakpoint', "Add Breakpoint"),
				undefined,
				true,
				() => this.debugService.addBreakpoints(uri, [{ lineNumber, column }])
			));
			actions.push(new Action(
				'addConditionalBreakpoint',
				nls.localize('addConditionalBreakpoint', "Add Conditional Breakpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.CONDITION))
			));
			actions.push(new Action(
				'addLogPoint',
				nls.localize('addLogPoint', "Add Logpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.LOG_MESSAGE))
			));
		}

		if (this.debugService.state === State.Stopped) {
			actions.push(new Separator());
			actions.push(new Action(
				'runToLine',
				nls.localize('runToLine', "Run to Line"),
				undefined,
				true,
				() => this.debugService.runTo(uri, lineNumber).catch(onUnexpectedError)
			));
		}

		return actions;
	}

	private marginFreeFromNonDebugDecorations(line: number): boolean {
		const decorations = this.editor.getLineDecorations(line);
		if (decorations) {
			for (const { options } of decorations) {
				const clz = options.glyphMarginClassName;
				if (clz && (!clz.includes('codicon-') || clz.includes('codicon-testing-') || clz.includes('codicon-merge-') || clz.includes('codicon-arrow-') || clz.includes('codicon-loading') || clz.includes('codicon-fold'))) {
					return false;
				}
			}
		}

		return true;
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		this.editor.changeDecorations((accessor) => {
			if (this.breakpointHintDecoration) {
				accessor.removeDecoration(this.breakpointHintDecoration);
				this.breakpointHintDecoration = null;
			}
			if (showBreakpointHintAtLineNumber !== -1) {
				this.breakpointHintDecoration = accessor.addDecoration({
					startLineNumber: showBreakpointHintAtLineNumber,
					startColumn: 1,
					endLineNumber: showBreakpointHintAtLineNumber,
					endColumn: 1
				}, breakpointHelperDecoration
				);
			}
		});
	}

	private async setDecorations(): Promise<void> {
		if (!this.editor.hasModel()) {
			return;
		}

		const setCandidateDecorations = (changeAccessor: IModelDecorationsChangeAccessor, desiredCandidatePositions: BreakpointsForLine[]) => {
			const desiredCandidateDecorations = createCandidateDecorations(model, this.breakpointDecorations, desiredCandidatePositions);
			const candidateDecorationIds = changeAccessor.deltaDecorations(this.candidateDecorations.map(c => c.decorationId), desiredCandidateDecorations);
			this.candidateDecorations.forEach(candidate => {
				candidate.inlineWidget.dispose();
			});
			this.candidateDecorations = candidateDecorationIds.map((decorationId, index) => {
				const candidate = desiredCandidateDecorations[index];
				// Candidate decoration has a breakpoint attached when a breakpoint is already at that location and we did not yet set a decoration there
				// In practice this happens for the first breakpoint that was set on a line
				// We could have also rendered this first decoration as part of desiredBreakpointDecorations however at that moment we have no location information
				const icon = candidate.breakpoint ? getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), candidate.breakpoint, this.labelService).icon : icons.breakpoint.disabled;
				const contextMenuActions = () => this.getContextMenuActions(candidate.breakpoint ? [candidate.breakpoint] : [], activeCodeEditor.getModel().uri, candidate.range.startLineNumber, candidate.range.startColumn);
				const inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, ThemeIcon.asClassName(icon), candidate.breakpoint, this.debugService, this.contextMenuService, contextMenuActions);

				return {
					decorationId,
					inlineWidget
				};
			});
		};

		const activeCodeEditor = this.editor;
		const model = activeCodeEditor.getModel();
		const breakpoints = this.debugService.getModel().getBreakpoints({ uri: model.uri });
		const debugSettings = this.configurationService.getValue<IDebugConfiguration>('debug');
		const desiredBreakpointDecorations = this.instantiationService.invokeFunction(accessor => createBreakpointDecorations(accessor, model, breakpoints, this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), debugSettings.showBreakpointsInOverviewRuler));

		// try to set breakpoint location candidates in the same changeDecorations()
		// call to avoid flickering, if the DA responds reasonably quickly.
		const session = this.debugService.getViewModel().focusedSession;
		const desiredCandidatePositions = debugSettings.showInlineBreakpointCandidates && session ? requestBreakpointCandidateLocations(this.editor.getModel(), desiredBreakpointDecorations.map(bp => bp.range.startLineNumber), session) : Promise.resolve([]);
		const desiredCandidatePositionsRaced = await Promise.race([desiredCandidatePositions, timeout(500).then(() => undefined)]);
		if (desiredCandidatePositionsRaced === undefined) { // the timeout resolved first
			desiredCandidatePositions.then(v => activeCodeEditor.changeDecorations(d => setCandidateDecorations(d, v)));
		}

		try {
			this.ignoreDecorationsChangedEvent = true;

			// Set breakpoint decorations
			activeCodeEditor.changeDecorations((changeAccessor) => {
				const decorationIds = changeAccessor.deltaDecorations(this.breakpointDecorations.map(bpd => bpd.decorationId), desiredBreakpointDecorations);
				this.breakpointDecorations.forEach(bpd => {
					bpd.inlineWidget?.dispose();
				});
				this.breakpointDecorations = decorationIds.map((decorationId, index) => {
					let inlineWidget: InlineBreakpointWidget | undefined = undefined;
					const breakpoint = breakpoints[index];
					if (desiredBreakpointDecorations[index].options.before) {
						const contextMenuActions = () => this.getContextMenuActions([breakpoint], activeCodeEditor.getModel().uri, breakpoint.lineNumber, breakpoint.column);
						inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, desiredBreakpointDecorations[index].options.glyphMarginClassName, breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
					}

					return {
						decorationId,
						breakpoint,
						range: desiredBreakpointDecorations[index].range,
						inlineWidget
					};
				});

				if (desiredCandidatePositionsRaced) {
					setCandidateDecorations(changeAccessor, desiredCandidatePositionsRaced);
				}
			});
		} finally {
			this.ignoreDecorationsChangedEvent = false;
		}

		for (const d of this.breakpointDecorations) {
			if (d.inlineWidget) {
				this.editor.layoutContentWidget(d.inlineWidget);
			}
		}
	}

	private async onModelDecorationsChanged(): Promise<void> {
		if (this.breakpointDecorations.length === 0 || this.ignoreDecorationsChangedEvent || !this.editor.hasModel()) {
			// I have no decorations
			return;
		}
		let somethingChanged = false;
		const model = this.editor.getModel();
		this.breakpointDecorations.forEach(breakpointDecoration => {
			if (somethingChanged) {
				return;
			}
			const newBreakpointRange = model.getDecorationRange(breakpointDecoration.decorationId);
			if (newBreakpointRange && (!breakpointDecoration.range.equalsRange(newBreakpointRange))) {
				somethingChanged = true;
				breakpointDecoration.range = newBreakpointRange;
			}
		});
		if (!somethingChanged) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data = new Map<string, IBreakpointUpdateData>();
		for (let i = 0, len = this.breakpointDecorations.length; i < len; i++) {
			const breakpointDecoration = this.breakpointDecorations[i];
			const decorationRange = model.getDecorationRange(breakpointDecoration.decorationId);
			// check if the line got deleted.
			if (decorationRange) {
				// since we know it is collapsed, it cannot grow to multiple lines
				if (breakpointDecoration.breakpoint) {
					data.set(breakpointDecoration.breakpoint.getId(), {
						lineNumber: decorationRange.startLineNumber,
						column: breakpointDecoration.breakpoint.column ? decorationRange.startColumn : undefined,
					});
				}
			}
		}

		try {
			this.ignoreBreakpointsChangeEvent = true;
			await this.debugService.updateBreakpoints(model.uri, data, true);
		} finally {
			this.ignoreBreakpointsChangeEvent = false;
		}
	}

	// breakpoint widget
	showBreakpointWidget(lineNumber: number, column: number | undefined, context?: BreakpointWidgetContext): void {
		this.breakpointWidget?.dispose();

		this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber, column, context);
		this.breakpointWidget.show({ lineNumber, column: 1 });
		this.breakpointWidgetVisible.set(true);
	}

	closeBreakpointWidget(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
			this.breakpointWidget = undefined;
			this.breakpointWidgetVisible.reset();
			this.editor.focus();
		}
	}

	dispose(): void {
		this.breakpointWidget?.dispose();
		this.editor.removeDecorations(this.breakpointDecorations.map(bpd => bpd.decorationId));
		dispose(this.toDispose);
	}
}

GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
	const model = editor.getModel();
	const debugService = accessor.get(IDebugService);
	if (!model || !debugService.getAdapterManager().hasEnabledDebuggers() || !debugService.canSetBreakpointsIn(model)) {
		return;
	}

	const breakpointEditorContribution = editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
	if (!breakpointEditorContribution) {
		return;
	}

	const actions = breakpointEditorContribution.getContextMenuActionsAtPosition(lineNumber, model);

	for (const action of actions) {
		result.push(action, '2_debug');
	}
});

class InlineBreakpointWidget implements IContentWidget, IDisposable {

	// editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = false;
	suppressMouseDown = true;

	private domNode!: HTMLElement;
	private range: Range | null;
	private toDispose: IDisposable[] = [];

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly decorationId: string,
		cssClass: string | null | undefined,
		private readonly breakpoint: IBreakpoint | undefined,
		private readonly debugService: IDebugService,
		private readonly contextMenuService: IContextMenuService,
		private readonly getContextMenuActions: () => IAction[]
	) {
		this.range = this.editor.getModel().getDecorationRange(decorationId);
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => {
			const model = this.editor.getModel();
			const range = model.getDecorationRange(this.decorationId);
			if (this.range && !this.range.equalsRange(range)) {
				this.range = range;
				this.editor.layoutContentWidget(this);
			}
		}));
		this.create(cssClass);

		this.editor.addContentWidget(this);
		this.editor.layoutContentWidget(this);
	}

	private create(cssClass: string | null | undefined): void {
		this.domNode = $('.inline-breakpoint-widget');
		if (cssClass) {
			this.domNode.classList.add(...cssClass.split(' '));
		}
		this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, async e => {
			switch (this.breakpoint?.enabled) {
				case undefined:
					await this.debugService.addBreakpoints(this.editor.getModel().uri, [{ lineNumber: this.range!.startLineNumber, column: this.range!.startColumn }]);
					break;
				case true:
					await this.debugService.removeBreakpoints(this.breakpoint.getId());
					break;
				case false:
					this.debugService.enableOrDisableBreakpoints(true, this.breakpoint);
					break;
			}
		}));
		this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, e => {
			const event = new StandardMouseEvent(e);
			const actions = this.getContextMenuActions();
			this.contextMenuService.showContextMenu({
				getAnchor: () => event,
				getActions: () => actions,
				getActionsContext: () => this.breakpoint,
				onHide: () => disposeIfDisposable(actions)
			});
		}));

		const updateSize = () => {
			const lineHeight = this.editor.getOption(EditorOption.lineHeight);
			this.domNode.style.height = `${lineHeight}px`;
			this.domNode.style.width = `${Math.ceil(0.8 * lineHeight)}px`;
			this.domNode.style.marginLeft = `4px`;
		};
		updateSize();

		this.toDispose.push(this.editor.onDidChangeConfiguration(c => {
			if (c.hasChanged(EditorOption.fontSize) || c.hasChanged(EditorOption.lineHeight)) {
				updateSize();
			}
		}));
	}

	@memoize
	getId(): string {
		return generateUuid();
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.range) {
			return null;
		}
		// Workaround: since the content widget can not be placed before the first column we need to force the left position
		this.domNode.classList.toggle('line-start', this.range.startColumn === 1);

		return {
			position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn - 1 },
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	dispose(): void {
		this.editor.removeContentWidget(this);
		dispose(this.toDispose);
	}
}

registerThemingParticipant((theme, collector) => {
	const debugIconBreakpointColor = theme.getColor(debugIconBreakpointForeground);
	if (debugIconBreakpointColor) {
		collector.addRule(`
		${icons.allBreakpoints.map(b => `.monaco-workbench ${ThemeIcon.asCSSSelector(b.regular)}`).join(',\n		')},
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugBreakpointUnsupported)},
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugBreakpointHint)}:not([class*='codicon-debug-breakpoint']):not([class*='codicon-debug-stackframe']),
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)}::after,
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframe)}::after {
			color: ${debugIconBreakpointColor} !important;
		}
		`);
	}

	const debugIconBreakpointDisabledColor = theme.getColor(debugIconBreakpointDisabledForeground);
	if (debugIconBreakpointDisabledColor) {
		collector.addRule(`
		${icons.allBreakpoints.map(b => `.monaco-workbench ${ThemeIcon.asCSSSelector(b.disabled)}`).join(',\n		')} {
			color: ${debugIconBreakpointDisabledColor};
		}
		`);
	}

	const debugIconBreakpointUnverifiedColor = theme.getColor(debugIconBreakpointUnverifiedForeground);
	if (debugIconBreakpointUnverifiedColor) {
		collector.addRule(`
		${icons.allBreakpoints.map(b => `.monaco-workbench ${ThemeIcon.asCSSSelector(b.unverified)}`).join(',\n		')} {
			color: ${debugIconBreakpointUnverifiedColor};
		}
		`);
	}

	const debugIconBreakpointCurrentStackframeForegroundColor = theme.getColor(debugIconBreakpointCurrentStackframeForeground);
	if (debugIconBreakpointCurrentStackframeForegroundColor) {
		collector.addRule(`
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStackframe)},
		.monaco-editor .debug-top-stack-frame-column {
			color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
		}
		`);
	}

	const debugIconBreakpointStackframeFocusedColor = theme.getColor(debugIconBreakpointStackframeForeground);
	if (debugIconBreakpointStackframeFocusedColor) {
		collector.addRule(`
		.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)} {
			color: ${debugIconBreakpointStackframeFocusedColor} !important;
		}
		`);
	}
});

export const debugIconBreakpointForeground = registerColor('debugIcon.breakpointForeground', { dark: '#E51400', light: '#E51400', hcDark: '#E51400', hcLight: '#E51400' }, nls.localize('debugIcon.breakpointForeground', 'Icon color for breakpoints.'));
const debugIconBreakpointDisabledForeground = registerColor('debugIcon.breakpointDisabledForeground', { dark: '#848484', light: '#848484', hcDark: '#848484', hcLight: '#848484' }, nls.localize('debugIcon.breakpointDisabledForeground', 'Icon color for disabled breakpoints.'));
const debugIconBreakpointUnverifiedForeground = registerColor('debugIcon.breakpointUnverifiedForeground', { dark: '#848484', light: '#848484', hcDark: '#848484', hcLight: '#848484' }, nls.localize('debugIcon.breakpointUnverifiedForeground', 'Icon color for unverified breakpoints.'));
const debugIconBreakpointCurrentStackframeForeground = registerColor('debugIcon.breakpointCurrentStackframeForeground', { dark: '#FFCC00', light: '#BE8700', hcDark: '#FFCC00', hcLight: '#BE8700' }, nls.localize('debugIcon.breakpointCurrentStackframeForeground', 'Icon color for the current breakpoint stack frame.'));
const debugIconBreakpointStackframeForeground = registerColor('debugIcon.breakpointStackframeForeground', { dark: '#89D185', light: '#89D185', hcDark: '#89D185', hcLight: '#89D185' }, nls.localize('debugIcon.breakpointStackframeForeground', 'Icon color for all breakpoint stack frames.'));
