/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { Registry } from 'vs/platform/registry/common/platform';
import { Mode, IEntryRunContext, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IQuickOpenRegistry, Extensions, QuickOpenHandler, QuickOpenHandlerDescriptor, QuickOpenHandlerHelpEntry } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';

export const HELP_PREFIX = '?';

class HelpEntry extends QuickOpenEntryGroup {
	private prefixLabel: string;
	private prefix: string;
	private description: string;
	private quickOpenService: IQuickOpenService;
	private openOnPreview: boolean;

	constructor(prefix: string, description: string, quickOpenService: IQuickOpenService, openOnPreview: boolean) {
		super();

		if (!prefix) {
			this.prefix = '';
			this.prefixLabel = '\u2026' /* ... */;
		} else {
			this.prefix = this.prefixLabel = prefix;
		}

		this.description = description;
		this.quickOpenService = quickOpenService;
		this.openOnPreview = openOnPreview;
	}

	getLabel(): string {
		return this.prefixLabel;
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, picker help", this.getLabel());
	}

	getDescription(): string {
		return this.description;
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN || this.openOnPreview) {
			this.quickOpenService.show(this.prefix);
		}

		return false;
	}
}

export class HelpHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.help';

	constructor(@IQuickOpenService private readonly quickOpenService: IQuickOpenService) {
		super();
	}

	getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel> {
		searchValue = searchValue.trim();

		const registry = (Registry.as<IQuickOpenRegistry>(Extensions.Quickopen));
		const handlerDescriptors = registry.getQuickOpenHandlers();

		const defaultHandler = registry.getDefaultQuickOpenHandler();
		if (defaultHandler) {
			handlerDescriptors.push(defaultHandler);
		}

		const workbenchScoped: HelpEntry[] = [];
		const editorScoped: HelpEntry[] = [];

		const matchingHandlers: Array<QuickOpenHandlerHelpEntry | QuickOpenHandlerDescriptor> = [];
		handlerDescriptors.sort((h1, h2) => h1.prefix.localeCompare(h2.prefix)).forEach(handlerDescriptor => {
			if (handlerDescriptor.prefix !== HELP_PREFIX) {

				// Descriptor has multiple help entries
				if (types.isArray(handlerDescriptor.helpEntries)) {
					for (const helpEntry of handlerDescriptor.helpEntries) {
						if (helpEntry.prefix.indexOf(searchValue) === 0) {
							matchingHandlers.push(helpEntry);
						}
					}
				}

				// Single Help entry for descriptor
				else if (handlerDescriptor.prefix.indexOf(searchValue) === 0) {
					matchingHandlers.push(handlerDescriptor);
				}
			}
		});

		matchingHandlers.forEach(handler => {
			if (handler instanceof QuickOpenHandlerDescriptor) {
				workbenchScoped.push(new HelpEntry(handler.prefix, handler.description, this.quickOpenService, matchingHandlers.length === 1));
			} else {
				const entry = new HelpEntry(handler.prefix, handler.description, this.quickOpenService, matchingHandlers.length === 1);
				if (handler.needsEditor) {
					editorScoped.push(entry);
				} else {
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

		return Promise.resolve(new QuickOpenModel([...workbenchScoped, ...editorScoped]));
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		searchValue = searchValue.trim();
		return {
			autoFocusFirstEntry: searchValue.length > 0,
			autoFocusPrefixMatch: searchValue
		};
	}
}
