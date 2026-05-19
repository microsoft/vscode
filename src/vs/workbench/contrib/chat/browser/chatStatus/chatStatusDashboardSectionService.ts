/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IChatStatusDashboardSectionService = createDecorator<IChatStatusDashboardSectionService>('chatStatusDashboardSectionService');

/**
 * A contributed, collapsible section rendered at the bottom of the Copilot
 * status dashboard (the hover/popup shown from the status bar).
 */
export interface IChatStatusDashboardSection {
	readonly id: string;
	readonly title: string;
	/** When true (default) the section starts expanded. */
	readonly initialOpen?: boolean;
	/** Called to render the section body. The returned disposable cleans up listeners/widgets. */
	render(container: HTMLElement): IDisposable;
}

export interface IChatStatusDashboardSectionService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	registerSection(section: IChatStatusDashboardSection): IDisposable;

	getSections(): readonly IChatStatusDashboardSection[];
}

class ChatStatusDashboardSectionService implements IChatStatusDashboardSectionService {
	readonly _serviceBrand: undefined;

	private readonly _sections = new Map<string, IChatStatusDashboardSection>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	registerSection(section: IChatStatusDashboardSection): IDisposable {
		this._sections.set(section.id, section);
		this._onDidChange.fire();
		return {
			dispose: () => {
				if (this._sections.delete(section.id)) {
					this._onDidChange.fire();
				}
			}
		};
	}

	getSections(): readonly IChatStatusDashboardSection[] {
		return [...this._sections.values()];
	}
}

registerSingleton(IChatStatusDashboardSectionService, ChatStatusDashboardSectionService, InstantiationType.Delayed);
