/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import scorer = require('vs/base/common/scorer');
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWindowsService, IWindowService } from "vs/platform/windows/common/windows";
import { stripWildcards } from "vs/base/common/strings";

export const SWITCH_WINDOWS_PREFIX = 'windows ';

export class WindowPickerEntry extends QuickOpenEntry {

	constructor(
		private windowId: number,
		private label: string,
		private resource: URI,
		private isCurrentWindow: boolean,
		private hasFolderOpened: boolean,
		@IWindowsService private windowsService: IWindowsService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService
	) {
		super();
	}

	public getLabelOptions(): IIconLabelOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.resource, !this.resource && this.hasFolderOpened /* isFolder */)
		};
	}

	public getLabel(): string {
		return this.label;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, window picker", this.getLabel());
	}

	public getDescription(): string {
		return this.isCurrentWindow ? nls.localize('current', "Current Window") : void 0;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			setTimeout(() => {
				// Bug: somehow when not running this code in a timeout, it is not possible to use this picker
				// with quick navigate keys (not able to trigger quick navigate once running it once).
				this.windowsService.showWindow(this.windowId).done(null, errors.onUnexpectedError);
			});

			return true;
		}

		return super.run(mode, context);
	}
}

export class WindowPicker extends QuickOpenHandler {

	constructor(
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		const normalizedSearchValueLowercase = stripWildcards(searchValue).toLowerCase();
		const currentWindowId = this.windowService.getCurrentWindowId();

		return this.windowsService.getWindows().then(windows => {
			let entries = windows.map(win => {
				return this.instantiationService.createInstance(WindowPickerEntry, win.id, win.title, win.filename ? URI.file(win.filename) : void 0, currentWindowId === win.id, !!win.path);
			});

			entries = entries.filter(e => {
				if (!searchValue) {
					return true;
				}

				if (!scorer.matches(e.getLabel(), normalizedSearchValueLowercase)) {
					return false;
				}

				const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(e, searchValue, true /* fuzzy highlight */);
				e.setHighlights(labelHighlights, descriptionHighlights);

				return true;
			});

			return new QuickOpenModel(entries);
		});
	}

	public getEmptyLabel(searchString: string): string {
		return nls.localize('noWindowResults', "No matching opened windows found");
	}
}