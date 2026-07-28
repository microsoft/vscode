/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';

export interface IAICustomizationManagementSectionWidget extends IDisposable {
	layout?(dimension: Dimension): void;
	focus?(): void;
}

export interface IAICustomizationManagementSectionContribution {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly supportsHarness: (harnessId: string) => boolean;
	create(instantiationService: IInstantiationService, container: HTMLElement): IAICustomizationManagementSectionWidget;
}

class AICustomizationManagementSectionRegistry {
	private readonly contributions = new Map<AICustomizationManagementSection, IAICustomizationManagementSectionContribution[]>();

	register(contribution: IAICustomizationManagementSectionContribution): IDisposable {
		const contributions = this.contributions.get(contribution.id) ?? [];
		contributions.push(contribution);
		this.contributions.set(contribution.id, contributions);
		return toDisposable(() => {
			const index = contributions.indexOf(contribution);
			if (index !== -1) {
				contributions.splice(index, 1);
			}
			if (contributions.length === 0) {
				this.contributions.delete(contribution.id);
			}
		});
	}

	has(id: AICustomizationManagementSection): boolean {
		return this.contributions.has(id);
	}

	getDefault(id: AICustomizationManagementSection): IAICustomizationManagementSectionContribution | undefined {
		return this.contributions.get(id)?.[0];
	}

	get(id: AICustomizationManagementSection, harnessId: string): IAICustomizationManagementSectionContribution | undefined {
		return this.contributions.get(id)?.find(contribution => contribution.supportsHarness(harnessId));
	}
}

export const aiCustomizationManagementSectionRegistry = new AICustomizationManagementSectionRegistry();
