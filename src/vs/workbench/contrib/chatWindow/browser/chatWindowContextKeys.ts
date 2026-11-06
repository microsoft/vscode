/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { LayoutModeContext, SplitLayoutContext, TerminalsPositionContext, TerminalsVisibleContext } from '../../../common/contextkeys.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';

/** The layout state of a window, as its generic context keys describe it. */
export interface IWindowLayoutState {
	readonly layoutMode: IObservable<ChatWindowLayoutMode>;
	readonly splitLayout: IObservable<ChatWindowSplitLayout>;
}

/**
 * Binds the generic per-window layout keys (`layoutMode`, `splitLayout`) in `contextKeyService`, the window's own context,
 * to follow `state`. They are reset when the binding is disposed.
 */
export function bindWindowLayoutContext(contextKeyService: IContextKeyService, state: IWindowLayoutState): IDisposable {
	const layoutMode = LayoutModeContext.bindTo(contextKeyService);
	const splitLayout = SplitLayoutContext.bindTo(contextKeyService);
	const binding = autorun(reader => {
		layoutMode.set(state.layoutMode.read(reader));
		splitLayout.set(state.splitLayout.read(reader));
	});
	return {
		dispose: () => {
			binding.dispose();
			layoutMode.reset();
			splitLayout.reset();
		}
	};
}

/** The state of the part that holds a window's terminals, as its generic context keys describe it. */
export interface IWindowTerminalsState {
	/** Whether the part shows. */
	readonly terminalsVisible: IObservable<boolean>;
	/** Where the part sits. */
	readonly terminalPosition: IObservable<ChatWindowTerminalPosition>;
}

/**
 * Binds the generic per-window terminals keys (`terminalsVisible`, `terminalsPosition`) in `contextKeyService`, the window's
 * own context, to follow `state`. They are reset when the binding is disposed.
 */
export function bindWindowTerminalsContext(contextKeyService: IContextKeyService, state: IWindowTerminalsState): IDisposable {
	const visible = TerminalsVisibleContext.bindTo(contextKeyService);
	const position = TerminalsPositionContext.bindTo(contextKeyService);
	const binding = autorun(reader => {
		visible.set(state.terminalsVisible.read(reader));
		position.set(state.terminalPosition.read(reader));
	});
	return {
		dispose: () => {
			binding.dispose();
			visible.reset();
			position.reset();
		}
	};
}
