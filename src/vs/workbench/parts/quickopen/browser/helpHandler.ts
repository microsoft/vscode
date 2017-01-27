/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Builder, $ } from 'vs/base/browser/builder';
import types = require('vs/base/common/types');
import { Registry } from 'vs/platform/platform';
import { Mode, IEntryRunContext, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntryItem, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { ITree, IElementCallback } from 'vs/base/parts/tree/browser/tree';
import { IQuickOpenRegistry, Extensions, QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

export const HELP_PREFIX = '?';

class HelpEntry extends QuickOpenEntryItem {
	private prefix: string;
	private description: string;
	private groupLabel: string;
	private useBorder: boolean;
	private quickOpenService: IQuickOpenService;
	private openOnPreview: boolean;

	constructor(prefix: string, description: string, quickOpenService: IQuickOpenService, openOnPreview: boolean) {
		super();

		this.prefix = prefix;
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

	public getHeight(): number {
		return 22;
	}

	public getGroupLabel(): string {
		return this.groupLabel;
	}

	public setGroupLabel(groupLabel: string): void {
		this.groupLabel = groupLabel;
	}

	public showBorder(): boolean {
		return this.useBorder;
	}

	public setShowBorder(showBorder: boolean): void {
		this.useBorder = showBorder;
	}

	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		let builder = $(container);

		builder.div({ class: 'quick-open-entry' }, builder => {
			// Support border
			if (this.showBorder()) {
				$(container).addClass('results-group-separator');
			} else {
				$(container).removeClass('results-group-separator');
			}

			// Add a container for the group
			if (this.getGroupLabel()) {
				$(container).div((div: Builder) => {
					div.addClass('results-group');
					div.attr({
						text: this.getGroupLabel()
					});
				});
			}

			builder.div({ class: 'row' }, builder => {
				// Prefix
				let label = builder.clone().div({
					text: this.prefix,
					'class': 'quick-open-help-entry-label'
				});

				if (!this.prefix) {
					label.text('\u2026');
				}

				// Description
				builder.span({
					text: this.description,
					'class': 'quick-open-entry-description'
				});
			});
		});

		return null;
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

		let registry = (<IQuickOpenRegistry>Registry.as(Extensions.Quickopen));
		let handlerDescriptors = registry.getQuickOpenHandlers();

		let defaultHandler = registry.getDefaultQuickOpenHandler();
		if (defaultHandler) {
			handlerDescriptors.push(defaultHandler);
		}

		let workbenchScoped: HelpEntry[] = [];
		let editorScoped: HelpEntry[] = [];
		let entry: HelpEntry;

		handlerDescriptors.sort((h1, h2) => h1.prefix.localeCompare(h2.prefix)).forEach((handlerDescriptor) => {
			if (handlerDescriptor.prefix !== HELP_PREFIX) {

				// Descriptor has multiple help entries
				if (types.isArray(handlerDescriptor.helpEntries)) {
					for (let j = 0; j < handlerDescriptor.helpEntries.length; j++) {
						let helpEntry = handlerDescriptor.helpEntries[j];

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
