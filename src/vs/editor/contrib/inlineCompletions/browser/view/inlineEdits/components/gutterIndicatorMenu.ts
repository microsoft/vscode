/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildNode, LiveElement, n } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../../../base/common/keybindings.js';
import { IObservable, ISettableObservable, autorun, constObservable, derived, observableFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
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
		private readonly _close: (focusEditor: boolean, commandId?: string) => void,
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
		const hoveredId = observableValue<string | undefined>('hovered', undefined);
		const focusedId = observableValue<string | undefined>('focused', undefined);
		const tabStopId = observableValue<string | undefined>('tabStop', undefined);

		const createOptionArgs = (options: { id: string; title: string; icon: IObservable<ThemeIcon> | ThemeIcon; commandId: string | IObservable<string>; commandArgs?: unknown[]; isFirstTabStop?: boolean }): FirstFnArg<typeof option> => {
			return {
				title: options.title,
				icon: options.icon,
				keybinding: typeof options.commandId === 'string' ? this._getKeybinding(options.commandArgs ? undefined : options.commandId) : derived(this, reader => typeof options.commandId === 'string' ? undefined : this._getKeybinding(options.commandArgs ? undefined : options.commandId.read(reader)).read(reader)),
				isActive: getOptionActive(options.id, hoveredId, focusedId),
				tabIndex: getOptionTabIndex(options.id, !!options.isFirstTabStop, tabStopId),
				onHoverChange: makeHoverChangeHandler(options.id, hoveredId),
				onFocusChange: makeFocusChangeHandler(options.id, focusedId, tabStopId),
				onAction: () => {
					const commandId = typeof options.commandId === 'string' ? options.commandId : options.commandId.get();
					this._close(true, commandId);
					return this._commandService.executeCommand(commandId, ...(options.commandArgs ?? []));
				},
			};
		};

		const extensionCommandGroups = this._data.extensionCommands.map((group, groupIdx) =>
			group.map((c, idx) => option(createOptionArgs({
				id: c.command.id + '_' + idx,
				title: c.command.title,
				icon: c.icon ?? Codicon.symbolEvent,
				commandId: c.command.id,
				commandArgs: c.command.arguments,
				isFirstTabStop: this._data.extensionCommandsOnly && groupIdx === 0 && idx === 0,
			})))
		);

		const extensionCommandNodes: ChildNode = [];
		for (const group of extensionCommandGroups) {
			if (group.length > 0) {
				extensionCommandNodes.push(separator());
				extensionCommandNodes.push(...group);
			}
		}

		if (this._data.extensionCommandsOnly) {
			// drop leading separator
			return hoverContent(extensionCommandNodes.slice(1));
		}

		const title = header(this._data.displayName);

		const gotoAndAccept = option(createOptionArgs({
			id: 'gotoAndAccept',
			title: localize('gotoAndAccept', "Go To / Accept"),
			icon: Codicon.check,
			commandId: inlineSuggestCommitId,
			isFirstTabStop: true,
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

		const showModelEnabled = false;
		const modelOptions = showModelEnabled ? this._data.modelInfo?.models.map((m: { id: string; name: string }) => option({
			title: m.name,
			icon: m.id === this._data.modelInfo?.currentModelId ? Codicon.check : Codicon.circle,
			keybinding: constObservable(undefined),
			isActive: getOptionActive('model_' + m.id, hoveredId, focusedId),
			tabIndex: getOptionTabIndex('model_' + m.id, false, tabStopId),
			onHoverChange: makeHoverChangeHandler('model_' + m.id, hoveredId),
			onFocusChange: makeFocusChangeHandler('model_' + m.id, focusedId, tabStopId),
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

		const footerAction = this._data.action ? option(createOptionArgs({
			id: 'footerAction',
			title: this._data.action.title + '...',
			icon: Codicon.feedback,
			commandId: this._data.action.id,
			commandArgs: this._data.action.arguments,
		})) : undefined;

		return hoverContent([
			title,
			gotoAndAccept,
			alternativeCommand,
			reject,
			toggleCollapsedMode,
			modelOptions.length ? separator() : undefined,
			...modelOptions,
			snooze,
			settings,

			...extensionCommandNodes,

			footerAction ? separator() : undefined,
			footerAction
		]);
	}

	private _getKeybinding(commandId: string | undefined) {
		if (!commandId) {
			return constObservable(undefined);
		}
		return observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId)); // TODO: use contextkeyservice to use different renderings
	}
}

function getOptionActive(id: string, hoveredId: IObservable<string | undefined>, focusedId: IObservable<string | undefined>): IObservable<boolean> {
	return derived({ name: 'inlineEdits.optionActive' }, reader => {
		const hovered = hoveredId.read(reader);
		if (hovered !== undefined) {
			return hovered === id;
		}
		return focusedId.read(reader) === id;
	});
}

function getOptionTabIndex(id: string, isFirstTabStop: boolean, tabStopId: IObservable<string | undefined>): IObservable<number> {
	return derived({ name: 'inlineEdits.optionTabIndex' }, reader => {
		const stop = tabStopId.read(reader);
		if (stop === undefined) {
			return isFirstTabStop ? 0 : -1;
		}
		return stop === id ? 0 : -1;
	});
}

function makeHoverChangeHandler(id: string, hoveredId: ISettableObservable<string | undefined>): (isHovered: boolean) => void {
	return (isHovered: boolean) => {
		if (isHovered) {
			hoveredId.set(id, undefined);
		} else if (hoveredId.get() === id) {
			hoveredId.set(undefined, undefined);
		}
	};
}

function makeFocusChangeHandler(id: string, focusedId: ISettableObservable<string | undefined>, tabStopId: ISettableObservable<string | undefined>): (isFocused: boolean) => void {
	return (isFocused: boolean) => {
		if (isFocused) {
			focusedId.set(id, undefined);
			tabStopId.set(id, undefined);
		} else if (focusedId.get() === id) {
			focusedId.set(undefined, undefined);
		}
	};
}

function hoverContent(content: ChildNode) {
	return n.div({
		class: 'content',
		role: 'menu',
		ariaLabel: localize('inlineEditGutterMenu', "Inline Edit"),
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
	tabIndex?: IObservable<number>;
	onHoverChange?: (isHovered: boolean) => void;
	onFocusChange?: (isFocused: boolean) => void;
	onAction?: () => void;
}) {
	return derived({ name: 'inlineEdits.option' }, (_reader) => n.div({
		class: ['monaco-menu-option', props.isActive?.map(v => v && 'active')],
		role: 'menuitem',
		ariaLabel: props.title,
		onmouseenter: () => props.onHoverChange?.(true),
		onmouseleave: () => props.onHoverChange?.(false),
		onfocus: () => props.onFocusChange?.(true),
		onblur: () => props.onFocusChange?.(false),
		onclick: props.onAction,
		onkeydown: e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				props.onAction?.();
				return;
			}

			const options = Array.from(
				(e.currentTarget as HTMLElement).closest('[role="menu"]')
					?.querySelectorAll<HTMLElement>('.monaco-menu-option') ?? []
			);
			const idx = options.indexOf(e.currentTarget as HTMLElement);
			if (idx < 0 || options.length === 0) {
				return;
			}

			let next = -1;
			if (e.key === 'ArrowDown') {
				next = (idx + 1) % options.length;
			} else if (e.key === 'ArrowUp') {
				next = (idx - 1 + options.length) % options.length;
			} else if (e.key === 'Home') {
				next = 0;
			} else if (e.key === 'End') {
				next = options.length - 1;
			} else {
				return;
			}

			e.preventDefault();
			options[next].focus();
		},
		tabIndex: props.tabIndex ?? 0,
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

function separator() {
	return n.div({
		id: 'inline-edit-gutter-indicator-menu-separator',
		class: 'menu-separator',
		role: 'separator',
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
