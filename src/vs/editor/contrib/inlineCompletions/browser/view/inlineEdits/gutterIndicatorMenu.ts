/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { IObservable, autorun, constObservable, derived, derivedWithStore, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { OS } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { Command } from '../../../../../common/languages.js';
import { AcceptInlineCompletion, HideInlineCompletion, JumpToNextInlineEdit } from '../../controller/commands.js';
import { ChildNode, FirstFnArg, LiveElement, n } from './utils.js';

export class GutterIndicatorMenuContent {
	constructor(
		private readonly _menuTitle: IObservable<string>,
		private readonly _tabAction: IObservable<'jump' | 'accept' | 'inactive'>,
		private readonly _close: (focusEditor: boolean) => void,
		private readonly _extensionCommands: IObservable<readonly Command[] | undefined>,
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
			header(this._menuTitle),
			option(createOptionArgs({ id: 'gotoAndAccept', title: `${localize('goto', "Go To")} / ${localize('accept', "Accept")}`, icon: this._tabAction.map(action => action === 'accept' ? Codicon.check : Codicon.arrowRight), commandId: this._tabAction.map(action => action === 'accept' ? new AcceptInlineCompletion().id : new JumpToNextInlineEdit().id) })),
			option(createOptionArgs({ id: 'reject', title: localize('reject', "Reject"), icon: Codicon.close, commandId: new HideInlineCompletion().id })),
			separator(),
			this._extensionCommands?.map(c => c && c.length > 0 ? [
				...c.map(c => option(createOptionArgs({ id: c.id, title: c.title, icon: Codicon.symbolEvent, commandId: c.id, commandArgs: c.arguments }))),
				separator()
			] : []),
			option(createOptionArgs({ id: 'settings', title: localize('settings', "Settings"), icon: Codicon.gear, commandId: 'workbench.action.openSettings', commandArgs: ['inlineSuggest.edits'] })),
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
			color: 'var(--vscode-descriptionForeground)',
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

function separator() {
	return n.div({
		class: 'menu-separator',
		style: {
			color: 'var(--vscode-editorActionList-foreground)',
			padding: '2px 0',
		}
	}, n.div({
		style: {
			borderBottom: '1px solid var(--vscode-editorHoverWidget-border)',
		}
	}));
}
