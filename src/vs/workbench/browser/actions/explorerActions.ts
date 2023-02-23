/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

import { IListService } from 'vs/platform/list/browser/listService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { AbstractTree, TreeFindMatchType } from 'vs/base/browser/ui/tree/abstractTree';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';

const explorerCategory = { value: localize('explorerCategory', "Explorer"), original: 'Explorer' };

class ToggleFindMatchType extends Action2 {
	static readonly ID = 'workbench.action.toggleFindMatchType';

	constructor() {
		super({
			id: ToggleFindMatchType.ID,
			title: { value: localize('toggleFindMatchType', 'Toggle Find Match Type'), original: 'Toggle Find Match Type' },
			category: explorerCategory,
			f1: true,
			precondition: undefined
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const widget = accessor.get(IListService).lastFocusedList;
		if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
			const tree = widget;
			tree.findMatchType = tree.findMatchType === TreeFindMatchType.Fuzzy ? TreeFindMatchType.Contiguous : TreeFindMatchType.Fuzzy;
		}
	}
}

class SwitchToFuzzyFindMatchType extends Action2 {
	static readonly ID = 'workbench.action.fuzzyFindMatchType';

	constructor() {
		super({
			id: SwitchToFuzzyFindMatchType.ID,
			title: { value: localize('fuzzyFindMatchType', 'Switch to Fuzzy Find Match Type'), original: 'Switch to Fuzzy Find Match Type' },
			category: explorerCategory,
			f1: true,
			precondition: undefined
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const widget = accessor.get(IListService).lastFocusedList;
		if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
			const tree = widget;
			tree.findMatchType = TreeFindMatchType.Fuzzy;
		}
	}
}

class SwitchToContigiousFindMatchType extends Action2 {
	static readonly ID = 'workbench.action.contiguousFindMatchType';

	constructor() {
		super({
			id: SwitchToContigiousFindMatchType.ID,
			title: { value: localize('contiguousFindMatchType', 'Switch to Contiguous Find Match Type'), original: 'Switch to Contiguous Find Match Type' },
			category: explorerCategory,
			f1: true,
			precondition: undefined
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const widget = accessor.get(IListService).lastFocusedList;
		if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
			const tree = widget;
			tree.findMatchType = TreeFindMatchType.Contiguous;
		}
	}
}

registerAction2(ToggleFindMatchType);
registerAction2(SwitchToFuzzyFindMatchType);
registerAction2(SwitchToContiguousFindMatchType);
