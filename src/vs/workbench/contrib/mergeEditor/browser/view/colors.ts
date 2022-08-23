/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';

export const diff = registerColor(
	'mergeEditor.change.background',
	{ dark: '#40A6FF33', light: '#40A6FF33', hcDark: '#40A6FF33', hcLight: '#40A6FF33', },
	localize('mergeEditor.change.background', 'The background color for changes.')
);

export const diffWord = registerColor(
	'mergeEditor.change.word.background',
	{ dark: '#9bb9551e', light: '#9bb9551e', hcDark: null, hcLight: null, },
	localize('mergeEditor.change.word.background', 'The background color for word changes.')
);

export const conflictBorderUnhandledUnfocused = registerColor(
	'mergeEditor.conflict.unhandledUnfocused.border',
	{ dark: '#ffa6007a', light: '#ffa6007a', hcDark: '#ffa60080', hcLight: '#ffa60080', },
	localize('mergeEditor.conflict.unhandledUnfocused.border', 'The border color of unhandled unfocused conflicts.')
);

export const conflictBackgroundUnhandledUnfocused = registerColor(
	'mergeEditor.conflict.unhandledUnfocused.background',
	{ dark: '#ffa60026', light: '#ffa60080', hcDark: '#ffa60026', hcLight: '#ffa6007a', },
	localize('mergeEditor.conflict.unhandledUnfocused.background', 'The background color of unhandled unfocused conflicts.')
);

export const conflictBorderUnhandledFocused = registerColor(
	'mergeEditor.conflict.unhandledFocused.border',
	{ dark: '#ffa600BF', light: '#ffa600', hcDark: '#ffa600', hcLight: '#ffa600', },
	localize('mergeEditor.conflict.unhandledFocused.border', 'The border color of unhandled focused conflicts.')
);

export const conflictBorderHandledUnfocused = registerColor(
	'mergeEditor.conflict.handledUnfocused.border',
	{ dark: '#40C8AE49', light: '#40C8AE49', hcDark: '#40C8AE', hcLight: '#40C8AE', },
	localize('mergeEditor.conflict.handledUnfocused.border', 'The border color of handled unfocused conflicts.')
);

export const conflictBackgroundHandledUnfocused = registerColor(
	'mergeEditor.conflict.handledUnfocused.background',
	{ dark: '#40C8AE33', light: '#40C8AE33', hcDark: '#40C8AE33', hcLight: '#40C8AE33', },
	localize('mergeEditor.conflict.handledUnfocused.background', 'The background color of handled unfocused conflicts.')
);

export const conflictBackgroundHandledFocused = registerColor(
	'mergeEditor.conflict.handledFocused.background',
	{ dark: '#40C8AE33', light: '#40C8AE33', hcDark: '#40C8AE33', hcLight: '#40C8AE33', },
	localize('mergeEditor.conflict.handledFocused.background', 'The background color of handled focused conflicts.')
);

export const conflictBorderHandledFocused = registerColor(
	'mergeEditor.conflict.handledFocused.border',
	{ dark: '#40C8AEBF', light: '#40C8AEBF', hcDark: '#40C8AE', hcLight: '#40C8AE', },
	localize('mergeEditor.conflict.handledFocused.border', 'The border color of handled focused conflicts.')
);

export const handledConflictMinimapOverViewRulerColor = registerColor(
	'mergeEditor.conflict.handled.minimapOverViewRuler',
	{ dark: '#adaca8ee', light: '#adaca8ee', hcDark: '#adaca8ee', hcLight: '#adaca8ee', },
	localize('mergeEditor.conflict.handled.minimapOverViewRuler', 'The foreground color for changes in input 1.')
);

export const unhandledConflictMinimapOverViewRulerColor = registerColor(
	'mergeEditor.conflict.unhandled.minimapOverViewRuler',
	{ dark: '#fcba03FF', light: '#fcba03FF', hcDark: '#fcba03FF', hcLight: '#fcba03FF', },
	localize('mergeEditor.conflict.unhandled.minimapOverViewRuler', 'The foreground color for changes in input 1.')
);

export const conflictingLinesBackground = registerColor(
	'mergeEditor.conflictingLines.background',
	{ dark: '#ffea0047', light: '#ffea0047', hcDark: '#ffea0047', hcLight: '#ffea0047', },
	localize('mergeEditor.conflictingLines.background', 'The background of the "Conflicting Lines" text.')
);
