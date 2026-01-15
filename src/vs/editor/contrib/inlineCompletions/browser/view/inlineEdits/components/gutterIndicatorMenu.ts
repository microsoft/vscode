/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildNode, LiveElement, n } from '../../../../../../../base/browser/dom.js';
import { ActionBar, IActionBarOptions } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../../../base/common/keybindings.js';
import { IObservable, autorun, constObservable, derived, observableFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { nativeHoverDelegate } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { defaultKeybindingLabelStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, descriptionForeground, editorActionListForeground, editorHoverBorder } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, toggleShowCollapsedId } from '../../../controller/commandIds.js';
import { FirstFnArg, } from '../utils/utils.js';
import { InlineSuggestionGutterMenuData } from './gutterIndicatorView.js';

export class GutterIndicatorMenuContent {
	private readonly _inlineEditsShowCollapsed: IObservable<boolean>;

	constructor(
		private readonly _editorObs: ObservableCodeEditor,
		private readonly _data: InlineSuggestionGutterMenuData,
		private readonly _close: (focusEditor: boolean) => void,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		this._inlineEditsShowCollapsed = this._editorObs.getOption(EditorOption.inlineSuggest).map(s => s.edits.showCollapsed);
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
				keybinding: typeof options.commandId === 'string' ? this._getKeybinding(options.commandArgs ? undefined : options.commandId) : derived(this, reader => typeof options.commandId === 'string' ? undefined : this._getKeybinding(options.commandArgs ? undefined : options.commandId.read(reader)).read(reader)),
				isActive: activeElement.map(v => v === options.id),
				onHoverChange: v => activeElement.set(v ? options.id : undefined, undefined),
				onAction: () => {
					this._close(true);
					return this._commandService.executeCommand(typeof options.commandId === 'string' ? options.commandId : options.commandId.get(), ...(options.commandArgs ?? []));
				},
			};
		};

		const title = header(this._data.displayName);

		const gotoAndAccept = option(createOptionArgs({
			id: 'gotoAndAccept',
			title: `${localize('goto', "Go To")} / ${localize('accept', "Accept")}`,
			icon: Codicon.check,
			commandId: inlineSuggestCommitId,
		}));

		const reject = option(createOptionArgs({
			id: 'reject',
			title: localize('reject', "Reject"),
			icon: Codicon.close,
			commandId: hideInlineCompletionId
		}));

		const alternativeCommand = this._data.alternativeAction ? option(createOptionArgs({
			id: 'alternativeCommand',
			title: this._data.alternativeAction.command.title,
			icon: this._data.alternativeAction.icon,
			commandId: inlineSuggestCommitAlternativeActionId,
		})) : undefined;

		const extensionCommands = this._data.extensionCommands.map((c, idx) => option(createOptionArgs({
			id: c.command.id + '_' + idx,
			title: c.command.title,
			icon: c.icon ?? Codicon.symbolEvent,
			commandId: c.command.id,
			commandArgs: c.command.arguments
		})));

		const showModelEnabled = false;
		const modelOptions = showModelEnabled ? this._data.modelInfo?.models.map((m: { id: string; name: string }) => option({
			title: m.name,
			icon: m.id === this._data.modelInfo?.currentModelId ? Codicon.check : Codicon.circle,
			keybinding: constObservable(undefined),
			isActive: activeElement.map(v => v === 'model_' + m.id),
			onHoverChange: v => activeElement.set(v ? 'model_' + m.id : undefined, undefined),
			onAction: () => {
				this._close(true);
				this._data.setModelId?.(m.id);
			},
		})) ?? [] : [];

		const toggleCollapsedMode = this._inlineEditsShowCollapsed.map(showCollapsed => showCollapsed ?
			option(createOptionArgs({
				id: 'showExpanded',
				title: localize('showExpanded', "Show Expanded"),
				icon: Codicon.expandAll,
				commandId: toggleShowCollapsedId
			}))
			: option(createOptionArgs({
				id: 'showCollapsed',
				title: localize('showCollapsed', "Show Collapsed"),
				icon: Codicon.collapseAll,
				commandId: toggleShowCollapsedId
			}))
		);

		const snooze = option(createOptionArgs({
			id: 'snooze',
			title: localize('snooze', "Snooze"),
			icon: Codicon.bellSlash,
			commandId: 'editor.action.inlineSuggest.snooze'
		}));

		const settings = option(createOptionArgs({
			id: 'settings',
			title: localize('settings', "Settings"),
			icon: Codicon.gear,
			commandId: 'workbench.action.openSettings',
			commandArgs: ['@tag:nextEditSuggestions']
		}));

		const actions = this._data.action ? [this._data.action] : [];
		const actionBarFooter = actions.length > 0 ? actionBar(
			actions.map(action => ({
				id: action.id,
				label: action.title + '...',
				enabled: true,
				run: () => this._commandService.executeCommand(action.id, ...(action.arguments ?? [])),
				class: undefined,
				tooltip: action.tooltip ?? action.title
			})),
			{ hoverDelegate: nativeHoverDelegate /* unable to show hover inside another hover */ }
		) : undefined;

		return hoverContent([
			title,
			gotoAndAccept,
			alternativeCommand,
			reject,
			toggleCollapsedMode,
			modelOptions.length ? separator() : undefined,
			...modelOptions,
			extensionCommands.length ? separator() : undefined,
			snooze,
			settings,

			...extensionCommands,

			actionBarFooter ? separator() : undefined,
			actionBarFooter
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
			minWidth: 180,
		}
	}, content);
}

function header(title: string | IObservable<string>) {
	return n.div({
		class: 'header',
		style: {
			color: asCssVariable(descriptionForeground),
			fontSize: '13px',
			fontWeight: '600',
			padding: '0 4px',
			lineHeight: 28,
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
	return derived({ name: 'inlineEdits.option' }, (_reader) => n.div({
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
			style: { marginLeft: 'auto' },
			ref: elem => {
				const keybindingLabel = _reader.store.add(new KeybindingLabel(elem, OS, {
					disableTitle: true,
					...defaultKeybindingLabelStyles,
					keybindingLabelShadow: undefined,
					keybindingLabelForeground: asCssVariable(descriptionForeground),
					keybindingLabelBackground: 'transparent',
					keybindingLabelBorder: 'transparent',
					keybindingLabelBottomBorder: undefined,
				}));
				_reader.store.add(autorun(reader => {
					keybindingLabel.set(props.keybinding.read(reader));
				}));
			}
		})
	]));
}

// TODO: make this observable
function actionBar(actions: IAction[], options: IActionBarOptions) {
	return derived({ name: 'inlineEdits.actionBar' }, (_reader) => n.div({
		class: ['action-widget-action-bar'],
		style: {
			padding: '3px 24px',
		}
	}, [
		n.div({
			ref: elem => {
				const actionBar = _reader.store.add(new ActionBar(elem, options));
				actionBar.push(actions, { icon: false, label: true });
			}
		})
	]));
}

function separator() {
	return n.div({
		id: 'inline-edit-gutter-indicator-menu-separator',
		class: 'menu-separator',
		style: {
			color: asCssVariable(editorActionListForeground),
			padding: '2px 0',
		}
	}, n.div({
		style: {
			borderBottom: `1px solid ${asCssVariable(editorHoverBorder)}`,
		}
	}));
}
