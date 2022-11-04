/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ListMenuItem, ActionShowOptions, stripNewlines } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./codeActionWidget';
import { ActionItemRenderer, ActionList, ActionListItemKind, ActionWidget, HeaderRenderer, IRenderDelegate } from 'vs/editor/contrib/actionWidget/browser/actionWidget';
import { acceptSelectedCodeActionCommand, previewSelectedCodeActionCommand } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/browser/codeActionUi';
import { CodeActionItem, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
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
			renderers: [
				new ActionItemRenderer(previewSelectedCodeActionCommand, acceptSelectedCodeActionCommand, keybindingService, new CodeActionKeybindingResolver(keybindingService)),
				new HeaderRenderer(),
			],
			options: {
				keyboardSupport: false,
				accessibilityProvider: {
					getAriaLabel: element => {
						if (element.kind === ActionListItemKind.Action) {
							let label = stripNewlines(element.item.action.title);
							if (element.item.action.disabled) {
								label = localize({ key: 'customCodeActionWidget.labels', comment: ['Code action labels for accessibility.'] }, "{0}, Disabled Reason: {1}", label, element.item.action.disabled);
							}
							return label;
						}
						return null;
					},
					getWidgetAriaLabel: () => localize({ key: 'customCodeActionWidget', comment: ['A Code Action Option'] }, "Code Action Widget"),
					getRole: () => 'option',
					getWidgetRole: () => 'code-action-widget'
				},
			}
		}, codeActions, showHeaders, previewSelectedCodeActionCommand, acceptSelectedCodeActionCommand, (element: ListMenuItem<CodeActionItem>) => { return element.kind === ActionListItemKind.Action && !element.item?.action.disabled; }, onDidSelect, contextViewService);
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

	renderWidget(element: HTMLElement, trigger: CodeActionTrigger, codeActions: CodeActionSet, options: ActionShowOptions, showingCodeActions: readonly CodeActionItem[], delegate: IRenderDelegate<CodeActionItem>): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
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

		// Invisible div to block mouse interaction in the rest of the UI
		const menuBlock = document.createElement('div');
		const block = element.appendChild(menuBlock);
		block.classList.add('context-view-block');
		block.style.position = 'fixed';
		block.style.cursor = 'initial';
		block.style.left = '0';
		block.style.top = '0';
		block.style.width = '100%';
		block.style.height = '100%';
		block.style.zIndex = '-1';
		renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		// Invisible div to block mouse interaction with the menu
		const pointerBlockDiv = document.createElement('div');
		const pointerBlock = element.appendChild(pointerBlockDiv);
		pointerBlock.classList.add('context-view-pointerBlock');
		pointerBlock.style.position = 'fixed';
		pointerBlock.style.cursor = 'initial';
		pointerBlock.style.left = '0';
		pointerBlock.style.top = '0';
		pointerBlock.style.width = '100%';
		pointerBlock.style.height = '100%';
		pointerBlock.style.zIndex = '2';

		// Removes block on click INSIDE widget or ANY mouse movement
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));

		// Action bar
		let actionBarWidth = 0;
		if (!options.fromLightbulb) {
			const actionBar = this.createActionBar('.codeActionWidget-action-bar', codeActions, options);
			if (actionBar) {
				widget.appendChild(actionBar.getContainer().parentElement!);
				renderDisposables.add(actionBar);
				actionBarWidth = actionBar.getContainer().offsetWidth;
			}
		}

		const width = this.list.value?.layout(actionBarWidth);
		widget.style.width = `${width}px`;

		const focusTracker = renderDisposables.add(dom.trackFocus(element));
		renderDisposables.add(focusTracker.onDidBlur(() => this.hide()));

		return renderDisposables;
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
