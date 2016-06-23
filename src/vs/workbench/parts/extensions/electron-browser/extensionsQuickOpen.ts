/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IAutoFocus, Mode, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionsViewlet } from './extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';

class SearchExtensionEntry extends QuickOpenEntry {

	constructor(
		private text: string,
		@IViewletService private viewletService: IViewletService
	) {
		super();
	}

	getLabel(): string {
		return nls.localize('searchFor', "Press Enter to search for '{0}' in the Marketplace.", this.text);
	}

	getAriaLabel(): string {
		return this.getLabel();
	}

	run(mode:Mode):boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.viewletService.openViewlet('workbench.viewlet.extensions', true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.done(viewlet => {
				viewlet.search(this.text, true);
				viewlet.focus();
			});

		return true;
	}
}

export class GalleryExtensionsHandler extends QuickOpenHandler {

	private delayer: ThrottledDelayer<any>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();
		this.delayer = new ThrottledDelayer(500);
	}

	getResults(text: string): TPromise<IModel<any>> {
		const entries = [];

		if (text) {
			entries.push(this.instantiationService.createInstance(SearchExtensionEntry, text));
		}

		return TPromise.as(new QuickOpenModel(entries));
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noExtensionsToInstall', "Type an extension name");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}