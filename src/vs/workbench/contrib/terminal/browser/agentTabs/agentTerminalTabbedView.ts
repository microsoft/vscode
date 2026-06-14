/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork — agent-aware terminal selector (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalTabsView } from './ITerminalTabsView.js';
import { AgentTerminalSelectorModel } from './agentTerminalSelectorModel.js';

/**
 * Phase-2 skeleton replacement for `TerminalTabbedView`, created by
 * {@link TerminalViewPane} when `terminal.integrated.agentTabs.enabled` is on.
 *
 * It is deliberately a thin shell: it owns the {@link AgentTerminalSelectorModel}
 * and renders its sectioned rows into a basic list so that terminals AND agent
 * terminals appear together end-to-end through the single seam (Phase 2 exit
 * criterion — "rough is fine"). The full widget (WorkbenchList, drag-and-drop,
 * status column, inline approval) is layered on in later phases, all additively
 * within this folder. The stock view remains byte-identical and is used whenever
 * the flag is off.
 */
export class AgentTerminalTabbedView extends Disposable implements ITerminalTabsView {

	private readonly _listContainer: HTMLElement;
	private readonly _model: AgentTerminalSelectorModel;

	constructor(
		parentElement: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._listContainer = dom.append(parentElement, dom.$('.agent-terminal-tabs'));
		this._model = this._register(instantiationService.createInstance(AgentTerminalSelectorModel));
		this._register(this._model.onDidChange(() => this.rerenderTabs()));
		this.rerenderTabs();
	}

	rerenderTabs(): void {
		dom.clearNode(this._listContainer);
		for (const row of this._model.rows) {
			switch (row.kind) {
				case 'group-header': {
					const header = dom.append(this._listContainer, dom.$('.agent-tabs-section-header'));
					header.textContent = `${row.section} (${row.count})`;
					break;
				}
				case 'terminal': {
					const el = dom.append(this._listContainer, dom.$('.agent-tabs-row.terminal'));
					el.textContent = row.instance.title || `Terminal ${row.instance.instanceId}`;
					break;
				}
				case 'agent': {
					const el = dom.append(this._listContainer, dom.$('.agent-tabs-row.agent'));
					el.textContent = `${row.meta.sessionTitle} [${row.meta.runState}]`;
					break;
				}
			}
		}
	}

	layout(width: number, height: number): void {
		this._listContainer.style.width = `${width}px`;
		this._listContainer.style.height = `${height}px`;
	}

	setEditable(_isEditing: boolean): void {
		// No inline-rename in the skeleton; lands with the real list widget (Phase 3).
	}

	focusTabs(): void {
		this._listContainer.focus();
	}

	focus(): void {
		this._listContainer.focus();
	}

	focusHover(): void {
		// Hover surface lands with the real renderer (Phase 3).
	}
}
