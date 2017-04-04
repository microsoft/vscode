/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import { Registry } from 'vs/platform/platform';
import { Mode, IEntryRunContext, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IQuickOpenRegistry, Extensions, QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

export const HELP_PREFIX = '?';

class HelpEntry extends QuickOpenEntryGroup {
	private prefix: string;
	private description: string;
	private quickOpenService: IQuickOpenService;
	private openOnPreview: boolean;

	constructor(prefix: string, description: string, quickOpenService: IQuickOpenService, openOnPreview: boolean) {
		super();

		this.prefix = prefix || '\u2026';
		this.description = description;
		this.quickOpenService = quickOpenService;
		this.openOnPreview = openOnPreview;
	}

	public getLabel(): string {
		return this.prefix;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, picker help", this.getLabel());
	}

	public getDescription(): string {
		return this.description;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN || this.openOnPreview) {
			this.quickOpenService.show(this.prefix);
		}

		return false;
	}
}

export class HelpHandler extends QuickOpenHandler {

	constructor( @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		const registry = (<IQuickOpenRegistry>Registry.as(Extensions.Quickopen));
		const handlerDescriptors = registry.getQuickOpenHandlers();

		const defaultHandler = registry.getDefaultQuickOpenHandler();
		if (defaultHandler) {
			handlerDescriptors.push(defaultHandler);
		}

		const workbenchScoped: HelpEntry[] = [];
		const editorScoped: HelpEntry[] = [];
		let entry: HelpEntry;

		handlerDescriptors.sort((h1, h2) => h1.prefix.localeCompare(h2.prefix)).forEach((handlerDescriptor) => {
			if (handlerDescriptor.prefix !== HELP_PREFIX) {

				// Descriptor has multiple help entries
				if (types.isArray(handlerDescriptor.helpEntries)) {
					for (let j = 0; j < handlerDescriptor.helpEntries.length; j++) {
						const helpEntry = handlerDescriptor.helpEntries[j];

						if (helpEntry.prefix.indexOf(searchValue) === 0) {
							entry = new HelpEntry(helpEntry.prefix, helpEntry.description, this.quickOpenService, searchValue.length > 0);
							if (helpEntry.needsEditor) {
								editorScoped.push(entry);
							} else {
								workbenchScoped.push(entry);
							}
						}
					}
				}

				// Single Help entry for descriptor
				else if (handlerDescriptor.prefix.indexOf(searchValue) === 0) {
					entry = new HelpEntry(handlerDescriptor.prefix, handlerDescriptor.description, this.quickOpenService, searchValue.length > 0);
					workbenchScoped.push(entry);
				}
			}
		});

		// Add separator for workbench scoped handlers
		if (workbenchScoped.length > 0) {
			workbenchScoped[0].setGroupLabel(nls.localize('globalCommands', "global commands"));
		}

		// Add separator for editor scoped handlers
		if (editorScoped.length > 0) {
			editorScoped[0].setGroupLabel(nls.localize('editorCommands', "editor commands"));
			if (workbenchScoped.length > 0) {
				editorScoped[0].setShowBorder(true);
			}
		}

		return TPromise.as(new QuickOpenModel([...workbenchScoped, ...editorScoped]));
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		searchValue = searchValue.trim();
		return {
			autoFocusFirstEntry: searchValue.length > 0,
			autoFocusPrefixMatch: searchValue
		};
	}
}
