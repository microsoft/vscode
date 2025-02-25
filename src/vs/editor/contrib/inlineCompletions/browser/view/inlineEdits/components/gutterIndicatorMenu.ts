/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildNode, LiveElement, n } from '../../../../../../../base/browser/dom.js';
import { ActionBar, IActionBarOptions } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../../../base/common/keybindings.js';
import { IObservable, autorun, constObservable, derived, derivedWithStore, observableFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { nativeHoverDelegate } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { asCssVariable, descriptionForeground, editorActionListForeground, editorHoverBorder } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { hideInlineCompletionId, inlineSuggestCommitId, jumpToNextInlineEditId, toggleShowCollapsedId } from '../../../controller/commandIds.js';
import { IInlineEditsViewHost } from '../inlineEditsViewInterface.js';
import { FirstFnArg, InlineEditTabAction } from '../utils/utils.js';

export class GutterIndicatorMenuContent {

	private readonly _inlineEditsShowCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.showCollapsed);

	constructor(
		private readonly _host: IInlineEditsViewHost,
		private readonly _close: (focusEditor: boolean) => void,
		private readonly _editorObs: ObservableCodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
	}

	public toDisposableLiveElement(): LiveElement {
		return this._createHoverContent().toDisposableLiveElement();
	}

	private _createHoverContent() {
		const activeElement = observableValue<string | undefined>('active', undefined);

		const createOptionArgs = (options: { id: string; title: string; icon: IObservable<ThemeIcon> | ThemeIcon; commandId: string | IObservable<string>; commandArgs?: unknown[] }): FirstFnArg<typeof option> => {
			return {
				title: options.title,
				icon: options.icon,
				keybinding: typeof options.commandId === 'string' ? this._getKeybinding(options.commandArgs ? undefined : options.commandId) : derived(reader => typeof options.commandId === 'string' ? undefined : this._getKeybinding(options.commandArgs ? undefined : options.commandId.read(reader)).read(reader)),
				isActive: activeElement.map(v => v === options.id),
				onHoverChange: v => activeElement.set(v ? options.id : undefined, undefined),
				onAction: () => {
					this._close(true);
					return this._commandService.executeCommand(typeof options.commandId === 'string' ? options.commandId : options.commandId.get(), ...(options.commandArgs ?? []));
				},
			};
		};

		// TODO make this menu contributable!
		return hoverContent([
			header(this._host.displayName),
			option(createOptionArgs({
				id: 'gotoAndAccept', title: `${localize('goto', "Go To")} / ${localize('accept', "Accept")}`,
				icon: this._host.tabAction.map(action => action === InlineEditTabAction.Accept ? Codicon.check : Codicon.arrowRight),
				commandId: this._host.tabAction.map(action => action === InlineEditTabAction.Accept ? inlineSuggestCommitId : jumpToNextInlineEditId)
			})),
			option(createOptionArgs({ id: 'reject', title: localize('reject', "Reject"), icon: Codicon.close, commandId: hideInlineCompletionId })),
			separator(),
			this._host.extensionCommands?.map(c => c && c.length > 0 ? [
				...c.map((c, idx) => option(createOptionArgs({ id: c.id + '_' + idx, title: c.title, icon: Codicon.symbolEvent, commandId: c.id, commandArgs: c.arguments }))),
				separator()
			] : []),
			this._inlineEditsShowCollapsed.map(showCollapsed => showCollapsed ?
				option(createOptionArgs({ id: 'showExpanded', title: localize('showExpanded', "Show Expanded"), icon: Codicon.expandAll, commandId: toggleShowCollapsedId })) :
				option(createOptionArgs({ id: 'showCollapsed', title: localize('showCollapsed', "Show Collapsed"), icon: Codicon.collapseAll, commandId: toggleShowCollapsedId }))
			),
			option(createOptionArgs({ id: 'settings', title: localize('settings', "Settings"), icon: Codicon.gear, commandId: 'workbench.action.openSettings', commandArgs: ['@tag:nextEditSuggestions'] })),
			this._host.action.map(action => action ? [
				separator(),
				actionBar(
					[{
						id: action.id,
						label: action.title,
						enabled: true,
						run: () => this._commandService.executeCommand(action.id, ...(action.arguments ?? [])),
						class: undefined,
						tooltip: action.tooltip ?? action.title
					}],
					{ hoverDelegate: nativeHoverDelegate /* unable to show hover inside another hover */ }
				)
			] : [])
		]);
	}

	private _getKeybinding(commandId: string | undefined) {
		if (!commandId) {
			return constObservable(undefined);
		}
		return observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId)); // TODO: use contextkeyservice to use different renderings
	}
}

function hoverContent(content: ChildNode) {
	return n.div({
		class: 'content',
		style: {
			margin: 4,
			minWidth: 150,
		}
	}, content);
}

function header(title: string | IObservable<string>) {
	return n.div({
		class: 'header',
		style: {
			color: asCssVariable(descriptionForeground),
			fontSize: '12px',
			fontWeight: '600',
			padding: '0 10px',
			lineHeight: 26,
		}
	}, [title]);
}

function option(props: {
	title: string;
	icon: IObservable<ThemeIcon> | ThemeIcon;
	keybinding: IObservable<ResolvedKeybinding | undefined>;
	isActive?: IObservable<boolean>;
	onHoverChange?: (isHovered: boolean) => void;
	onAction?: () => void;
}) {
	return derivedWithStore((_reader, store) => n.div({
		class: ['monaco-menu-option', props.isActive?.map(v => v && 'active')],
		onmouseenter: () => props.onHoverChange?.(true),
		onmouseleave: () => props.onHoverChange?.(false),
		onclick: props.onAction,
		onkeydown: e => {
			if (e.key === 'Enter') {
				props.onAction?.();
			}
		},
		tabIndex: 0,
		style: {
			borderRadius: 3, // same as hover widget border radius
		}
	}, [
		n.elem('span', {
			style: {
				fontSize: 16,
				display: 'flex',
			}
		}, [ThemeIcon.isThemeIcon(props.icon) ? renderIcon(props.icon) : props.icon.map(icon => renderIcon(icon))]),
		n.elem('span', {}, [props.title]),
		n.div({
			style: { marginLeft: 'auto', opacity: '0.6' },
			ref: elem => {
				const keybindingLabel = store.add(new KeybindingLabel(elem, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
				store.add(autorun(reader => {
					keybindingLabel.set(props.keybinding.read(reader));
				}));
			}
		})
	]));
}

// TODO: make this observable
function actionBar(actions: IAction[], options: IActionBarOptions) {
	return derivedWithStore((_reader, store) => n.div({
		class: ['action-widget-action-bar'],
		style: {
			padding: '0 10px',
		}
	}, [
		n.div({
			ref: elem => {
				const actionBar = store.add(new ActionBar(elem, options));
				actionBar.push(actions, { icon: false, label: true });
			}
		})
	]));
}

function separator() {
	return n.div({
		class: 'menu-separator',
		style: {
			color: asCssVariable(editorActionListForeground),
			padding: '4px 0',
		}
	}, n.div({
		style: {
			borderBottom: `1px solid ${asCssVariable(editorHoverBorder)}`,
		}
	}));
}
