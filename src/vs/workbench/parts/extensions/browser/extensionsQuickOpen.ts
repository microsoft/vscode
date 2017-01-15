/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAutoFocus, Mode, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IExtensionsViewlet, VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

class SimpleEntry extends QuickOpenEntry {

	constructor(private label: string, private action: Function) {
		super();
	}

	getLabel(): string {
		return this.label;
	}

	getAriaLabel(): string {
		return this.label;
	}

	run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.action();

		return true;
	}
}

export class ExtensionsHandler extends QuickOpenHandler {

	constructor( @IViewletService private viewletService: IViewletService) {
		super();
	}

	getResults(text: string): TPromise<IModel<any>> {
		const label = nls.localize('manage', "Press Enter to manage your extensions.");
		const action = () => {
			this.viewletService.openViewlet(VIEWLET_ID, true)
				.then(viewlet => viewlet as IExtensionsViewlet)
				.done(viewlet => {
					viewlet.search('');
					viewlet.focus();
				});
		};

		return TPromise.as(new QuickOpenModel([new SimpleEntry(label, action)]));
	}

	getEmptyLabel(input: string): string {
		return '';
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}

export class GalleryExtensionsHandler extends QuickOpenHandler {

	constructor( @IViewletService private viewletService: IViewletService) {
		super();
	}

	getResults(text: string): TPromise<IModel<any>> {
		const entries: SimpleEntry[] = [];

		if (text) {
			const label = nls.localize('searchFor', "Press Enter to search for '{0}' in the Marketplace.", text);
			const action = () => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.done(viewlet => {
						viewlet.search(text);
						viewlet.focus();
					});
			};

			entries.push(new SimpleEntry(label, action));
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