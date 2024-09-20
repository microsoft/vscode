/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { IAnchor } from '../../../../base/browser/ui/contextview/contextview.js';
import { IAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { IEditorContribution, ScrollType } from '../../../common/editorCommon.js';
import { CodeActionTriggerType } from '../../../common/languages.js';
import { IModelDeltaDecoration } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ApplyCodeActionReason, applyCodeAction } from './codeAction.js';
import { CodeActionKeybindingResolver } from './codeActionKeybindingResolver.js';
import { toMenuItems } from './codeActionMenu.js';
import { LightBulbWidget } from './lightBulbWidget.js';
import { MessageController } from '../../message/browser/messageController.js';
import { localize } from '../../../../nls.js';
import { IActionListDelegate } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { editorFindMatchHighlight, editorFindMatchHighlightBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { CodeActionAutoApply, CodeActionFilter, CodeActionItem, CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../common/types.js';
import { CodeActionModel, CodeActionsState } from './codeActionModel.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

interface IActionShowOptions {
	readonly includeDisabledActions?: boolean;
	readonly fromLightbulb?: boolean;
}


const DECORATION_CLASS_NAME = 'quickfix-edit-highlight';

export class CodeActionController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.codeActionController';

	public static get(editor: ICodeEditor): CodeActionController | null {
		return editor.getContribution<CodeActionController>(CodeActionController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _model: CodeActionModel;

	private readonly _lightBulbWidget: Lazy<LightBulbWidget | null>;
	private readonly _activeCodeActions = this._register(new MutableDisposable<CodeActionSet>());
	private _showDisabled = false;

	private readonly _resolver: CodeActionKeybindingResolver;

	private _disposed = false;

	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IEditorProgressService progressService: IEditorProgressService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		this._editor = editor;
		this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService, _configurationService, this._telemetryService));
		this._register(this._model.onDidChangeState(newState => this.update(newState)));

		this._lightBulbWidget = new Lazy(() => {
			const widget = this._editor.getContribution<LightBulbWidget>(LightBulbWidget.ID);
			if (widget) {
				this._register(widget.onClick(e => this.showCodeActionsFromLightbulb(e.actions, e)));
			}
			return widget;
		});

		this._resolver = instantiationService.createInstance(CodeActionKeybindingResolver);

		this._register(this._editor.onDidLayoutChange(() => this._actionWidgetService.hide()));
	}

	override dispose() {
		this._disposed = true;
		super.dispose();
	}

	private async showCodeActionsFromLightbulb(actions: CodeActionSet, at: IAnchor | IPosition): Promise<void> {
		if (actions.allAIFixes && actions.validActions.length === 1) {
			const actionItem = actions.validActions[0];
			const command = actionItem.action.command;
			if (command && command.id === 'inlineChat.start') {
				if (command.arguments && command.arguments.length >= 1) {
					command.arguments[0] = { ...command.arguments[0], autoSend: false };
				}
			}
			await this._applyCodeAction(actionItem, false, false, ApplyCodeActionReason.FromAILightbulb);
			return;
		}
		await this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: true });
	}

	public showCodeActions(_trigger: CodeActionTrigger, actions: CodeActionSet, at: IAnchor | IPosition) {
		return this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: false });
	}

	public hideCodeActions(): void {
		this._actionWidgetService.hide();
	}

	public manualTriggerAtCurrentPosition(
		notAvailableMessage: string,
		triggerAction: CodeActionTriggerSource,
		filter?: CodeActionFilter,
		autoApply?: CodeActionAutoApply,
	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		MessageController.get(this._editor)?.closeMessage();
		const triggerPosition = this._editor.getPosition();
		this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition } });
	}

	private _trigger(trigger: CodeActionTrigger) {
		return this._model.trigger(trigger);
	}

	private async _applyCodeAction(action: CodeActionItem, retrigger: boolean, preview: boolean, actionReason: ApplyCodeActionReason): Promise<void> {
		try {
			await this._instantiationService.invokeFunction(applyCodeAction, action, actionReason, { preview, editor: this._editor });
		} finally {
			if (retrigger) {
				this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
			}
		}
	}

	public hideLightBulbWidget(): void {
		this._lightBulbWidget.rawValue?.hide();
		this._lightBulbWidget.rawValue?.gutterHide();
	}

	private async update(newState: CodeActionsState.State): Promise<void> {
		if (newState.type !== CodeActionsState.Type.Triggered) {
			this.hideLightBulbWidget();
			return;
		}

		let actions: CodeActionSet;
		try {
			actions = await newState.actions;
		} catch (e) {
			onUnexpectedError(e);
			return;
		}

		if (this._disposed) {
			return;
		}


		const selection = this._editor.getSelection();
		if (selection?.startLineNumber !== newState.position.lineNumber) {
			return;
		}

		this._lightBulbWidget.value?.update(actions, newState.trigger, newState.position);

		if (newState.trigger.type === CodeActionTriggerType.Invoke) {
			if (newState.trigger.filter?.include) { // Triggered for specific scope
				// Check to see if we want to auto apply.

				const validActionToApply = this.tryGetValidActionToApply(newState.trigger, actions);
				if (validActionToApply) {
					try {
						this.hideLightBulbWidget();
						await this._applyCodeAction(validActionToApply, false, false, ApplyCodeActionReason.FromCodeActions);
					} finally {
						actions.dispose();
					}
					return;
				}

				// Check to see if there is an action that we would have applied were it not invalid
				if (newState.trigger.context) {
					const invalidAction = this.getInvalidActionThatWouldHaveBeenApplied(newState.trigger, actions);
					if (invalidAction && invalidAction.action.disabled) {
						MessageController.get(this._editor)?.showMessage(invalidAction.action.disabled, newState.trigger.context.position);
						actions.dispose();
						return;
					}
				}
			}

			const includeDisabledActions = !!newState.trigger.filter?.include;
			if (newState.trigger.context) {
				if (!actions.allActions.length || !includeDisabledActions && !actions.validActions.length) {
					MessageController.get(this._editor)?.showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
					this._activeCodeActions.value = actions;
					actions.dispose();
					return;
				}
			}

			this._activeCodeActions.value = actions;
			this.showCodeActionList(actions, this.toCoords(newState.position), { includeDisabledActions, fromLightbulb: false });
		} else {
			// auto magically triggered
			if (this._actionWidgetService.isVisible) {
				// TODO: Figure out if we should update the showing menu?
				actions.dispose();
			} else {
				this._activeCodeActions.value = actions;
			}
		}
	}

	private getInvalidActionThatWouldHaveBeenApplied(trigger: CodeActionTrigger, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.allActions.length) {
			return undefined;
		}

		if ((trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length === 0)
			|| (trigger.autoApply === CodeActionAutoApply.IfSingle && actions.allActions.length === 1)
		) {
			return actions.allActions.find(({ action }) => action.disabled);
		}

		return undefined;
	}

	private tryGetValidActionToApply(trigger: CodeActionTrigger, actions: CodeActionSet): CodeActionItem | undefined {
		if (!actions.validActions.length) {
			return undefined;
		}

		if ((trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length > 0)
			|| (trigger.autoApply === CodeActionAutoApply.IfSingle && actions.validActions.length === 1)
		) {
			return actions.validActions[0];
		}

		return undefined;
	}

	private static readonly DECORATION = ModelDecorationOptions.register({
		description: 'quickfix-highlight',
		className: DECORATION_CLASS_NAME
	});

	public async showCodeActionList(actions: CodeActionSet, at: IAnchor | IPosition, options: IActionShowOptions): Promise<void> {

		const currentDecorations = this._editor.createDecorationsCollection();

		const editorDom = this._editor.getDomNode();
		if (!editorDom) {
			return;
		}

		const actionsToShow = options.includeDisabledActions && (this._showDisabled || actions.validActions.length === 0) ? actions.allActions : actions.validActions;
		if (!actionsToShow.length) {
			return;
		}

		const anchor = Position.isIPosition(at) ? this.toCoords(at) : at;

		const delegate: IActionListDelegate<CodeActionItem> = {
			onSelect: async (action: CodeActionItem, preview?: boolean) => {
				this._applyCodeAction(action, /* retrigger */ true, !!preview, options.fromLightbulb ? ApplyCodeActionReason.FromAILightbulb : ApplyCodeActionReason.FromCodeActions);
				this._actionWidgetService.hide(false);
				currentDecorations.clear();
			},
			onHide: (didCancel?) => {
				this._editor?.focus();
				currentDecorations.clear();
			},
			onHover: async (action: CodeActionItem, token: CancellationToken) => {
				if (token.isCancellationRequested) {
					return;
				}

				let canPreview = false;
				const actionKind = action.action.kind;

				if (actionKind) {
					const hierarchicalKind = new HierarchicalKind(actionKind);
					const refactorKinds = [
						CodeActionKind.RefactorExtract,
						CodeActionKind.RefactorInline,
						CodeActionKind.RefactorRewrite,
						CodeActionKind.RefactorMove,
						CodeActionKind.Source
					];

					canPreview = refactorKinds.some(refactorKind => refactorKind.contains(hierarchicalKind));
				}

				return { canPreview: canPreview || !!action.action.edit?.edits.length };
			},
			onFocus: (action: CodeActionItem | undefined) => {
				if (action && action.action) {
					const ranges = action.action.ranges;
					const diagnostics = action.action.diagnostics;
					currentDecorations.clear();
					if (ranges && ranges.length > 0) {
						// Handles case for `fix all` where there are multiple diagnostics.
						const decorations: IModelDeltaDecoration[] = (diagnostics && diagnostics?.length > 1)
							? diagnostics.map(diagnostic => ({ range: diagnostic, options: CodeActionController.DECORATION }))
							: ranges.map(range => ({ range, options: CodeActionController.DECORATION }));
						currentDecorations.set(decorations);
					} else if (diagnostics && diagnostics.length > 0) {
						const decorations: IModelDeltaDecoration[] = diagnostics.map(diagnostic => ({ range: diagnostic, options: CodeActionController.DECORATION }));
						currentDecorations.set(decorations);
						const diagnostic = diagnostics[0];
						if (diagnostic.startLineNumber && diagnostic.startColumn) {
							const selectionText = this._editor.getModel()?.getWordAtPosition({ lineNumber: diagnostic.startLineNumber, column: diagnostic.startColumn })?.word;
							aria.status(localize('editingNewSelection', "Context: {0} at line {1} and column {2}.", selectionText, diagnostic.startLineNumber, diagnostic.startColumn));
						}
					}
				} else {
					currentDecorations.clear();
				}
			}
		};

		this._actionWidgetService.show(
			'codeActionWidget',
			true,
			toMenuItems(actionsToShow, this._shouldShowHeaders(), this._resolver.getResolver()),
			delegate,
			anchor,
			editorDom,
			this._getActionBarActions(actions, at, options));
	}

	private toCoords(position: IPosition): IAnchor {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}

		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
	}

	private _shouldShowHeaders(): boolean {
		const model = this._editor?.getModel();
		return this._configurationService.getValue('editor.codeActionWidget.showHeaders', { resource: model?.uri });
	}

	private _getActionBarActions(actions: CodeActionSet, at: IAnchor | IPosition, options: IActionShowOptions): IAction[] {
		if (options.fromLightbulb) {
			return [];
		}

		const resultActions = actions.documentation.map((command): IAction => ({
			id: command.id,
			label: command.title,
			tooltip: command.tooltip ?? '',
			class: undefined,
			enabled: true,
			run: () => this._commandService.executeCommand(command.id, ...(command.arguments ?? [])),
		}));

		if (options.includeDisabledActions && actions.validActions.length > 0 && actions.allActions.length !== actions.validActions.length) {
			resultActions.push(this._showDisabled ? {
				id: 'hideMoreActions',
				label: localize('hideMoreActions', 'Hide Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					this._showDisabled = false;
					return this.showCodeActionList(actions, at, options);
				}
			} : {
				id: 'showMoreActions',
				label: localize('showMoreActions', 'Show Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => {
					this._showDisabled = true;
					return this.showCodeActionList(actions, at, options);
				}
			});
		}

		return resultActions;
	}
}

registerThemingParticipant((theme, collector) => {
	const addBackgroundColorRule = (selector: string, color: Color | undefined): void => {
		if (color) {
			collector.addRule(`.monaco-editor ${selector} { background-color: ${color}; }`);
		}
	};

	addBackgroundColorRule('.quickfix-edit-highlight', theme.getColor(editorFindMatchHighlight));
	const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);

	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-editor .quickfix-edit-highlight { border: 1px ${isHighContrast(theme.type) ? 'dotted' : 'solid'} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
	}
});
