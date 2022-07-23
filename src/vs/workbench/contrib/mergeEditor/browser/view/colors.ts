/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';

export const diff = registerColor(
	'mergeEditor.change.background',
	{ dark: '#9bb95533', light: '#9bb95533', hcDark: '#9bb95533', hcLight: '#9bb95533', },
	localize('mergeEditor.change.background', 'The background color for changes.')
);

export const diffWord = registerColor(
	'mergeEditor.change.word.background',
	{ dark: '#9ccc2c33', light: '#9ccc2c66', hcDark: '#9ccc2c33', hcLight: '#9ccc2c66', },
	localize('mergeEditor.change.word.background', 'The background color for word changes.')
);

export const diffBase = registerColor(
	'mergeEditor.changeBase.background',
	{ dark: '#4B1818FF', light: '#FFCCCCFF', hcDark: '#4B1818FF', hcLight: '#FFCCCCFF', },
	localize('mergeEditor.changeBase.background', 'The background color for changes in base.')
);

export const diffWordBase = registerColor(
	'mergeEditor.changeBase.word.background',
	{ dark: '#6F1313FF', light: '#FFA3A3FF', hcDark: '#6F1313FF', hcLight: '#FFA3A3FF', },
	localize('mergeEditor.changeBase.word.background', 'The background color for word changes in base.')
);

export const conflictBorderUnhandledUnfocused = registerColor(
	'mergeEditor.conflict.unhandledUnfocused.border',
	{ dark: '#ffa6007a', light: '#ffa6007a', hcDark: '#ffa6007a', hcLight: '#ffa6007a', },
	localize('mergeEditor.conflict.unhandledUnfocused.border', 'The border color of unhandled unfocused conflicts.')
);

export const conflictBorderUnhandledFocused = registerColor(
	'mergeEditor.conflict.unhandledFocused.border',
	{ dark: '#ffa600', light: '#ffa600', hcDark: '#ffa600', hcLight: '#ffa600', },
	localize('mergeEditor.conflict.unhandledFocused.border', 'The border color of unhandled focused conflicts.')
);

export const conflictBorderHandledUnfocused = registerColor(
	'mergeEditor.conflict.handledUnfocused.border',
	{ dark: '#86868649', light: '#86868649', hcDark: '#86868649', hcLight: '#86868649', },
	localize('mergeEditor.conflict.handledUnfocused.border', 'The border color of handled unfocused conflicts.')
);

export const conflictBorderHandledFocused = registerColor(
	'mergeEditor.conflict.handledFocused.border',
	{ dark: '#c1c1c1cc', light: '#c1c1c1cc', hcDark: '#c1c1c1cc', hcLight: '#c1c1c1cc', },
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
