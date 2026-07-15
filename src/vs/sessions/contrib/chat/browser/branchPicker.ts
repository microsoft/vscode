/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { BranchPickerWidget, IBranchPickerModel } from '../../../../workbench/contrib/chat/browser/widget/input/branchPickerWidget.js';
import { reportNewChatPickerClosed } from './newChatPickerTelemetry.js';

export { IBranchPickerModel } from '../../../../workbench/contrib/chat/browser/widget/input/branchPickerWidget.js';

/**
 * Sessions-layer wrapper around the core {@link BranchPickerWidget} that adds
 * picker-closed telemetry via {@link reportNewChatPickerClosed}.
 */
export class BranchPicker extends Disposable {

	private readonly _widget: BranchPickerWidget;

	constructor(
		model: IObservable<IBranchPickerModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._widget = this._register(instantiationService.createInstance(BranchPickerWidget, model));
		this._register(this._widget.onDidSelectBranch(e => {
			reportNewChatPickerClosed(this.telemetryService, {
				id: 'NewChatBranchPicker',
				name: 'NewChatBranchPicker',
				optionIdBefore: e.branchBefore,
				optionIdAfter: e.branchAfter,
				optionLabelBefore: e.branchBefore,
				optionLabelAfter: e.branchAfter,
				isPII: true,
			});
		}));
	}

	render(container: HTMLElement): void {
		this._widget.render(container);
	}

	showPicker(): void {
		this._widget.showPicker();
	}
}
