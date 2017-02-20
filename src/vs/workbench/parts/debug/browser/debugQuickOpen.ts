/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
	private debugService: IDebugService;
	private configurationName: string;

	constructor(debugService: IDebugService, config: string, highlights: Model.IHighlight[] = []) {
		super(highlights);
		this.debugService = debugService;
		this.configurationName = config;
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
		this.debugService.createProcess(this.configurationName).done(undefined, errors.onUnexpectedError);
		this.debugService.getViewModel().setSelectedConfigurationName(this.configurationName);

		return true;
	}
}

export class QuickOpenHandler extends Quickopen.QuickOpenHandler {

	private debugService: IDebugService;
	private quickOpenService: IQuickOpenService;

	constructor(
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IDebugService debugService: IDebugService
	) {
		super();

		this.quickOpenService = quickOpenService;
		this.debugService = debugService;
	}

	public getAriaLabel(): string {
		return nls.localize('debugAriaLabel', "Type the name of a launch configuration to run");
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		const configurationNames = this.debugService.getConfigurationManager().getConfigurationNames()
			.sort((a, b) => a.localeCompare(b))
			.map(config => ({ config: config, highlights: Filters.matchesContiguousSubString(input, config) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ config, highlights }) => new DebugEntry(this.debugService, config, highlights));

		return TPromise.as(new Model.QuickOpenModel(configurationNames));
	}

	public getClass(): string {
		return null;
	}

	public canRun(): boolean {
		return true;
	}

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: !!input
		};
	}

	public onClose(cancelled: boolean): void {
		return;
	}

	public getGroupLabel(): string {
		return null;
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noConfigurationsMatching', "No debug configurations matching");
		}

		return nls.localize('noConfigurationsFound', "No debug configurations found");
	}
}