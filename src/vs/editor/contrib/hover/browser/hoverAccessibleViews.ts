/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ContentHoverController } from './contentHoverController.js';
import { AccessibleViewType, AccessibleViewProviderId, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from './hoverActionIds.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { labelForHoverVerbosityAction } from './markdownHoverParticipant.js';

namespace HoverAccessibilityHelpNLS {
	export const increaseVerbosity = localize('increaseVerbosity', '- The focused hover part verbosity level can be increased with the Increase Hover Verbosity command.', `<keybinding:${INCREASE_HOVER_VERBOSITY_ACTION_ID}>`);
	export const decreaseVerbosity = localize('decreaseVerbosity', '- The focused hover part verbosity level can be decreased with the Decrease Hover Verbosity command.', `<keybinding:${DECREASE_HOVER_VERBOSITY_ACTION_ID}>`);
}

export class HoverAccessibleView implements IAccessibleViewImplementation {

	public readonly type = AccessibleViewType.View;
	public readonly priority = 95;
	public readonly name = 'hover';
	public readonly when = EditorContextKeys.hoverFocused;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			throw new Error('No active or focused code editor');
		}
		const hoverController = ContentHoverController.get(codeEditor);
		if (!hoverController) {
			return;
		}
		const keybindingService = accessor.get(IKeybindingService);
		return accessor.get(IInstantiationService).createInstance(HoverAccessibleViewProvider, keybindingService, codeEditor, hoverController);
	}
}

export class HoverAccessibilityHelp implements IAccessibleViewImplementation {

	public readonly priority = 100;
	public readonly name = 'hover';
	public readonly type = AccessibleViewType.Help;
	public readonly when = EditorContextKeys.hoverVisible;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			throw new Error('No active or focused code editor');
		}
		const hoverController = ContentHoverController.get(codeEditor);
		if (!hoverController) {
			return;
		}
		return accessor.get(IInstantiationService).createInstance(HoverAccessibilityHelpProvider, hoverController);
	}
}

abstract class BaseHoverAccessibleViewProvider extends Disposable implements IAccessibleViewContentProvider {

	abstract provideContent(): string;
	abstract options: IAccessibleViewOptions;

	public readonly id = AccessibleViewProviderId.Hover;
	public readonly verbositySettingKey = 'accessibility.verbosity.hover';

	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	protected _focusedHoverPartIndex: number = -1;

	constructor(protected readonly _hoverController: ContentHoverController) {
		super();
	}

	public onOpen(): void {
		if (!this._hoverController) {
			return;
		}
		this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = true;
		this._focusedHoverPartIndex = this._hoverController.focusedHoverPartIndex();
		this._register(this._hoverController.onHoverContentsChanged(() => {
			this._onDidChangeContent.fire();
		}));
	}

	public onClose(): void {
		if (!this._hoverController) {
			return;
		}
		if (this._focusedHoverPartIndex === -1) {
			this._hoverController.focus();
		} else {
			this._hoverController.focusHoverPartWithIndex(this._focusedHoverPartIndex);
		}
		this._focusedHoverPartIndex = -1;
		this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = false;
	}

	provideContentAtIndex(focusedHoverIndex: number, includeVerbosityActions: boolean): string {
		if (focusedHoverIndex !== -1) {
			const accessibleContent = this._hoverController.getAccessibleWidgetContentAtIndex(focusedHoverIndex);
			if (accessibleContent === undefined) {
				return '';
			}
			const contents: string[] = [];
			if (includeVerbosityActions) {
				contents.push(...this._descriptionsOfVerbosityActionsForIndex(focusedHoverIndex));
			}
			contents.push(accessibleContent);
			return contents.join('\n');
		} else {
			const accessibleContent = this._hoverController.getAccessibleWidgetContent();
			if (accessibleContent === undefined) {
				return '';
			}
			const contents: string[] = [];
			contents.push(accessibleContent);
			return contents.join('\n');
		}
	}

	private _descriptionsOfVerbosityActionsForIndex(index: number): string[] {
		const content: string[] = [];
		const descriptionForIncreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Increase, index);
		if (descriptionForIncreaseAction !== undefined) {
			content.push(descriptionForIncreaseAction);
		}
		const descriptionForDecreaseAction = this._descriptionOfVerbosityActionForIndex(HoverVerbosityAction.Decrease, index);
		if (descriptionForDecreaseAction !== undefined) {
			content.push(descriptionForDecreaseAction);
		}
		return content;
	}

	private _descriptionOfVerbosityActionForIndex(action: HoverVerbosityAction, index: number): string | undefined {
		const isActionSupported = this._hoverController.doesHoverAtIndexSupportVerbosityAction(index, action);
		if (!isActionSupported) {
			return;
		}
		switch (action) {
			case HoverVerbosityAction.Increase:
				return HoverAccessibilityHelpNLS.increaseVerbosity;
			case HoverVerbosityAction.Decrease:
				return HoverAccessibilityHelpNLS.decreaseVerbosity;
		}
	}
}

export class HoverAccessibilityHelpProvider extends BaseHoverAccessibleViewProvider implements IAccessibleViewContentProvider {

	public readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(hoverController: ContentHoverController) {
		super(hoverController);
	}

	provideContent(): string {
		return this.provideContentAtIndex(this._focusedHoverPartIndex, true);
	}
}

export class HoverAccessibleViewProvider extends BaseHoverAccessibleViewProvider implements IAccessibleViewContentProvider {

	public readonly options: IAccessibleViewOptions = { type: AccessibleViewType.View };

	constructor(
		private readonly _keybindingService: IKeybindingService,
		private readonly _editor: ICodeEditor,
		hoverController: ContentHoverController,
	) {
		super(hoverController);
		this._initializeOptions(this._editor, hoverController);
	}

	public provideContent(): string {
		return this.provideContentAtIndex(this._focusedHoverPartIndex, false);
	}

	public get actions(): IAction[] {
		const actions: IAction[] = [];
		actions.push(this._getActionFor(this._editor, HoverVerbosityAction.Increase));
		actions.push(this._getActionFor(this._editor, HoverVerbosityAction.Decrease));
		return actions;
	}

	private _getActionFor(editor: ICodeEditor, action: HoverVerbosityAction): IAction {
		let actionId: string;
		let accessibleActionId: string;
		let actionCodicon: ThemeIcon;
		switch (action) {
			case HoverVerbosityAction.Increase:
				actionId = INCREASE_HOVER_VERBOSITY_ACTION_ID;
				accessibleActionId = INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID;
				actionCodicon = Codicon.add;
				break;
			case HoverVerbosityAction.Decrease:
				actionId = DECREASE_HOVER_VERBOSITY_ACTION_ID;
				accessibleActionId = DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID;
				actionCodicon = Codicon.remove;
				break;
		}
		const actionLabel = labelForHoverVerbosityAction(this._keybindingService, action);
		const actionEnabled = this._hoverController.doesHoverAtIndexSupportVerbosityAction(this._focusedHoverPartIndex, action);
		return new Action(accessibleActionId, actionLabel, ThemeIcon.asClassName(actionCodicon), actionEnabled, () => {
			editor.getAction(actionId)?.run({ index: this._focusedHoverPartIndex, focus: false });
		});
	}

	private _initializeOptions(editor: ICodeEditor, hoverController: ContentHoverController): void {
		const helpProvider = this._register(new HoverAccessibilityHelpProvider(hoverController));
		this.options.language = editor.getModel()?.getLanguageId();
		this.options.customHelp = () => { return helpProvider.provideContentAtIndex(this._focusedHoverPartIndex, true); };
	}
}

export class ExtHoverAccessibleView implements IAccessibleViewImplementation {
	public readonly type = AccessibleViewType.View;
	public readonly priority = 90;
	public readonly name = 'extension-hover';

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const contextViewService = accessor.get(IContextViewService);
		const contextViewElement = contextViewService.getContextViewElement();
		const extensionHoverContent = contextViewElement?.textContent ?? undefined;
		const hoverService = accessor.get(IHoverService);

		if (contextViewElement.classList.contains('accessible-view-container') || !extensionHoverContent) {
			// The accessible view, itself, uses the context view service to display the text. We don't want to read that.
			return;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Hover,
			{ language: 'typescript', type: AccessibleViewType.View },
			() => { return extensionHoverContent; },
			() => {
				hoverService.showAndFocusLastHover();
			},
			'accessibility.verbosity.hover',
		);
	}
}
