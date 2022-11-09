/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import { Codicon } from 'vs/base/common/codicons';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ActionItemRenderer, ActionList, ActionListItemKind, ActionShowOptions, ActionWidget, IRenderDelegate, ListMenuItem } from 'vs/platform/actionWidget/browser/actionWidget';
import { CodeActionItem, CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CodeActionKeybindingResolver } from './codeActionKeybindingResolver';

export const Context = {
	Visible: new RawContextKey<boolean>('codeActionMenuVisible', false, localize('codeActionMenuVisible', "Whether the code action list widget is visible"))
};

export interface ActionGroup {
	readonly kind: CodeActionKind;
	readonly title: string;
	readonly icon?: { readonly codicon: Codicon; readonly color?: string };
}

const uncategorizedCodeActionGroup = Object.freeze<ActionGroup>({ kind: CodeActionKind.Empty, title: localize('codeAction.widget.id.more', 'More Actions...') });

const codeActionGroups = Object.freeze<ActionGroup[]>([
	{ kind: CodeActionKind.QuickFix, title: localize('codeAction.widget.id.quickfix', 'Quick Fix...') },
	{ kind: CodeActionKind.RefactorExtract, title: localize('codeAction.widget.id.extract', 'Extract...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorInline, title: localize('codeAction.widget.id.inline', 'Inline...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorRewrite, title: localize('codeAction.widget.id.convert', 'Rewrite...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorMove, title: localize('codeAction.widget.id.move', 'Move...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.SurroundWith, title: localize('codeAction.widget.id.surround', 'Surround With...'), icon: { codicon: Codicon.symbolSnippet } },
	{ kind: CodeActionKind.Source, title: localize('codeAction.widget.id.source', 'Source Action...'), icon: { codicon: Codicon.symbolFile } },
	uncategorizedCodeActionGroup,
]);

export class CodeActionList extends ActionList<CodeActionItem> {

	constructor(
		codeActions: readonly CodeActionItem[],
		showHeaders: boolean,
		onDidSelect: (action: CodeActionItem, preview?: boolean) => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super({
			user: 'codeActionWidget',
			renderers: [new ActionItemRenderer(keybindingService, new CodeActionKeybindingResolver(keybindingService))],
		}, codeActions, showHeaders, onDidSelect, contextViewService);
	}

	public toMenuItems(inputCodeActions: readonly CodeActionItem[], showHeaders: boolean): ListMenuItem<CodeActionItem>[] {
		if (!showHeaders) {
			return inputCodeActions.map((action): ListMenuItem<CodeActionItem> => {
				return {
					kind: ActionListItemKind.Action,
					item: action,
					group: uncategorizedCodeActionGroup,
					disabled: !!action.action.disabled,
					label: action.action.title
				};
			});
		}

		// Group code actions
		const menuEntries = codeActionGroups.map(group => ({ group, actions: [] as CodeActionItem[] }));

		for (const action of inputCodeActions) {
			const kind = action.action.kind ? new CodeActionKind(action.action.kind) : CodeActionKind.None;
			for (const menuEntry of menuEntries) {
				if (menuEntry.group.kind.contains(kind)) {
					menuEntry.actions.push(action);
					break;
				}
			}
		}

		const allMenuItems: ListMenuItem<CodeActionItem>[] = [];
		for (const menuEntry of menuEntries) {
			if (menuEntry.actions.length) {
				allMenuItems.push({ kind: ActionListItemKind.Header, group: menuEntry.group });
				for (const action of menuEntry.actions) {
					allMenuItems.push({ kind: ActionListItemKind.Action, item: action, group: menuEntry.group, label: action.action.title, disabled: action.action.disabled });
				}
			}
		}
		return allMenuItems;
	}
}

export class CodeActionWidget extends ActionWidget<CodeActionItem> {

	private static _instance?: CodeActionWidget;

	public static get INSTANCE(): CodeActionWidget | undefined { return this._instance; }

	public static getOrCreateInstance(instantiationService: IInstantiationService): ActionWidget<CodeActionItem> {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(CodeActionWidget);
		}
		return this._instance;
	}

	constructor(
		@ICommandService override readonly _commandService: ICommandService,
		@IContextViewService override readonly contextViewService: IContextViewService,
		@IKeybindingService override readonly keybindingService: IKeybindingService,
		@ITelemetryService override readonly _telemetryService: ITelemetryService,
		@IContextKeyService override readonly _contextKeyService: IContextKeyService
	) {
		super(Context.Visible, _commandService, contextViewService, keybindingService, _telemetryService, _contextKeyService);
	}

	override renderWidget(element: HTMLElement, trigger: CodeActionTrigger, codeActions: CodeActionSet, options: ActionShowOptions, showingCodeActions: readonly CodeActionItem[], delegate: IRenderDelegate<CodeActionItem>): IDisposable {
		const widget = document.createElement('div');
		widget.classList.add('actionWidget');
		element.appendChild(widget);
		const onDidSelect = (action: CodeActionItem, preview?: boolean) => {
			this.hide();
			delegate.onSelect(action, trigger, preview);
		};
		this.list.value = new CodeActionList(
			showingCodeActions,
			options.showHeaders ?? true,
			onDidSelect,
			this.keybindingService,
			this.contextViewService);

		if (this.list.value) {
			widget.appendChild(this.list.value.domNode);
		} else {
			throw new Error('List has no value');
		}

		return super.renderWidget(element, trigger, codeActions, options, showingCodeActions, delegate, widget);
	}

	override onWidgetClosed(trigger: any, options: ActionShowOptions, actions: CodeActionSet, cancelled: boolean, delegate: IRenderDelegate<CodeActionItem>): void {
		super.onWidgetClosed(trigger, options, actions, cancelled, delegate);
		type ApplyCodeActionEvent = {
			codeActionFrom: any;
			validCodeActions: number;
			cancelled: boolean;
		};

		type ApplyCodeEventClassification = {
			codeActionFrom: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to opened the code action.' };
			validCodeActions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The total number of valid actions that are highlighted and can be used.' };
			cancelled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The indicator if the menu was selected or cancelled.' };
			owner: 'mjbvz';
			comment: 'Event used to gain insights into how code actions are being triggered';
		};

		this._telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
			codeActionFrom: options.fromLightbulb ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction,
			validCodeActions: actions.validActions.length,
			cancelled: cancelled,
		});
	}
}
