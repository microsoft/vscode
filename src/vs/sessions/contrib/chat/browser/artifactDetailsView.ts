/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { ArtifactDetailsItem } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';

export interface IArtifactActionViewData {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	readonly iconOnly?: boolean;
	readonly primary?: boolean;
	readonly enabled?: boolean;
	readonly description?: string;
	readonly ariaLabel?: string;
	run(): void;
}

export interface IArtifactListViewData {
	readonly id: string;
	readonly title: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly message: string;
	readonly loading: boolean;
	readonly items: readonly ArtifactDetailsItem[];
	/** Row actions by item ID; items without an entry have no actions. */
	readonly itemActions: ReadonlyMap<string, readonly IArtifactActionViewData[]>;
	readonly more?: IArtifactActionViewData;
	openItem(item: ArtifactDetailsItem): void;
}

export interface IArtifactAutopilotRuleViewData {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly disabled: boolean;
	readonly pending: boolean;
	readonly policy?: {
		readonly label: string;
		choose(): Promise<void>;
	};
	setEnabled(enabled: boolean): Promise<void>;
}

export interface IArtifactAutopilotGroupViewData {
	readonly id: string;
	readonly title: string;
	readonly expanded: boolean;
	readonly checked: boolean;
	readonly disabled: boolean;
	readonly summary: string;
	readonly toggleLabel: string;
	readonly description: string;
	readonly rules: readonly IArtifactAutopilotRuleViewData[];
	setExpanded(expanded: boolean): void;
	setEnabled(enabled: boolean): Promise<void>;
}

export interface IArtifactActivityViewData {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
	readonly action?: IArtifactActionViewData;
	readonly reveal?: () => void;
}

export interface IArtifactActivitiesViewData {
	readonly expanded: boolean;
	readonly loading: boolean;
	readonly items: readonly IArtifactActivityViewData[];
	readonly summary: string;
	readonly message: string;
	readonly more?: IArtifactActionViewData;
	setExpanded(expanded: boolean): void;
}

export type ArtifactDetailsSelection = readonly [string, string?] | 'autopilot';

export interface IArtifactSectionTarget {
	readonly id: string;
	readonly target?: { readonly kind: 'list' | 'action'; readonly id: string };
	readonly pending: boolean;
}

/** Presentation-ready data and error-reporting commands, independent of the rendering widgets. */
export interface IArtifactDetailsViewData {
	readonly title: string;
	readonly resource: string;
	readonly icon?: ThemeIcon;
	readonly titleDescription: string;
	readonly description: string;
	readonly message: string;
	readonly loading: boolean;
	readonly lists: readonly IArtifactListViewData[];
	/** The expanded state list; `undefined` when all lists are collapsed. */
	readonly selectedList: string | undefined;
	readonly stateActions: readonly IArtifactActionViewData[];
	readonly generalActions: readonly IArtifactActionViewData[];
	readonly autopilot: readonly IArtifactAutopilotGroupViewData[];
	readonly activities: IArtifactActivitiesViewData;
	readonly sections: readonly IArtifactSectionTarget[];
	readonly accessibleText: string;
	openResource(): void;
	selectList(id: string | undefined): void;
}

/** Kept by the artifact presentation across detail-model lifetimes, separately from saved consent. */
export class ArtifactDetailsViewState {
	selectedList: string | undefined;
	readonly expandedAutopilot = new Set<string>();
	readonly preparedPolicies = new Map<string, string>();
	activitiesExpanded = false;
}

export function artifactViewKey(integrationId: string, id?: string): string {
	return JSON.stringify([integrationId, id]);
}
