/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Whether a session created by the `create_session` server tool starts at its
 * parent session's permission level.
 */
export const enum SubsessionPermissionInheritance {
	/** Ask on every `create_session`; an approved inheritance applies only to that subsession. */
	Once = 'once',
	/** Always start the subsession at its parent's permission level. */
	Always = 'always',
	/** Never carry the parent's permission level over. */
	Never = 'never',
}

/** VS Code setting governing {@link SubsessionPermissionInheritance}. */
export const SUBSESSION_PERMISSION_INHERITANCE_SETTING_ID = 'chat.subsessions.inheritPermissions';

/** Host root-config key mirroring {@link SUBSESSION_PERMISSION_INHERITANCE_SETTING_ID}. */
export const AgentHostSubsessionPermissionInheritanceConfigKey = 'subsessionPermissionInheritance';

export const SUBSESSION_PERMISSION_INHERITANCE_VALUES: readonly SubsessionPermissionInheritance[] = [
	SubsessionPermissionInheritance.Once,
	SubsessionPermissionInheritance.Always,
	SubsessionPermissionInheritance.Never,
];

export const DEFAULT_SUBSESSION_PERMISSION_INHERITANCE = SubsessionPermissionInheritance.Once;

export function isSubsessionPermissionInheritance(value: unknown): value is SubsessionPermissionInheritance {
	return SUBSESSION_PERMISSION_INHERITANCE_VALUES.includes(value as SubsessionPermissionInheritance);
}

export function toSubsessionPermissionInheritance(value: unknown): SubsessionPermissionInheritance {
	return isSubsessionPermissionInheritance(value) ? value : DEFAULT_SUBSESSION_PERMISSION_INHERITANCE;
}

/**
 * Id of the question asked when a subsession would inherit an elevated
 * permission level. Well-known so the client can recognize the answer and
 * persist the user's choice.
 */
export const SUBSESSION_INHERITANCE_QUESTION_ID = 'subsession-permission-inheritance';

/**
 * Ids of the options offered while the user has not settled on an inheritance
 * behavior.
 */
export const enum SubsessionInheritanceOptionId {
	/** Create the subsession at the default permission level, and ask again next time. */
	AllowWithoutInheriting = 'subsession-allow-without-inheriting',
	/** Inherit for this subsession only, and ask again next time. */
	InheritOnce = 'subsession-inherit-once',
	/** Inherit for this and every future subsession. */
	InheritAlways = 'subsession-inherit-always',
	/** Never inherit, now or in future. */
	InheritNever = 'subsession-inherit-never',
}

/** What a selected {@link SubsessionInheritanceOptionId} means for the subsession being created. */
export interface ISubsessionInheritanceChoice {
	/** Whether this subsession starts at its parent's permission level. */
	readonly inherit: boolean;
	/** The behavior to persist to {@link SUBSESSION_PERMISSION_INHERITANCE_SETTING_ID}, when the choice settles it. */
	readonly persist?: SubsessionPermissionInheritance;
}

/** Resolves what a selected option means, or `undefined` when it is not an inheritance option. */
export function getSubsessionInheritanceChoice(optionId: string | undefined): ISubsessionInheritanceChoice | undefined {
	switch (optionId) {
		case SubsessionInheritanceOptionId.AllowWithoutInheriting:
			return { inherit: false };
		case SubsessionInheritanceOptionId.InheritOnce:
			return { inherit: true };
		case SubsessionInheritanceOptionId.InheritAlways:
			return { inherit: true, persist: SubsessionPermissionInheritance.Always };
		case SubsessionInheritanceOptionId.InheritNever:
			return { inherit: false, persist: SubsessionPermissionInheritance.Never };
		default:
			return undefined;
	}
}
