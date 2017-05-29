/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Filters = require('vs/base/common/filters');
import { TPromise } from 'vs/base/common/winjs.base';
import Quickopen = require('vs/workbench/browser/quickopen');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import * as errors from 'vs/base/common/errors';

class DebugEntry extends Model.QuickOpenEntry {

	constructor(private debugService: IDebugService, private configurationName: string, highlights: Model.IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.configurationName;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, debug", this.getLabel());
	}

	public run(mode: QuickOpen.Mode, context: Model.IContext): boolean {
		if (mode === QuickOpen.Mode.PREVIEW) {
			return false;
		}
		// Run selected debug configuration
		this.debugService.getViewModel().setSelectedConfigurationName(this.configurationName);
		this.debugService.startDebugging().done(undefined, errors.onUnexpectedError);

		return true;
	}
}

export class DebugQuickOpenHandler extends Quickopen.QuickOpenHandler {

	constructor(
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IDebugService private debugService: IDebugService
	) {
		super();
	}

	public getAriaLabel(): string {
		return nls.localize('debugAriaLabel', "Type a name of a launch configuration to run.");
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		const configurationNames = this.debugService.getConfigurationManager().getConfigurationNames()
			.map(config => ({ config: config, highlights: Filters.matchesContiguousSubString(input, config) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ config, highlights }) => new DebugEntry(this.debugService, config, highlights));

		return TPromise.as(new Model.QuickOpenModel(configurationNames));
	}

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: !!input
		};
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noConfigurationsMatching', "No debug configurations matching");
		}

		return nls.localize('noConfigurationsFound', "No debug configurations found. Please create a 'launch.json' file.");
	}
}
