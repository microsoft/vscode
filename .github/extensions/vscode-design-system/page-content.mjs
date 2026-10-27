/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const placeholders = {
	patterns: [
		{ title: 'Choose and confirm', text: 'Example: open a picker, make a selection, and return to the original task. Shared behavior and examples are TBD.' },
		{ title: 'Show work and request input', text: 'Example: distinguish running, waiting for a response, and completed states. Cross-surface coordination is TBD.' },
		{ title: 'Reveal supporting detail', text: 'Example: disclose detail without losing focus or context. Reusable hover and disclosure recipes are TBD.' },
	],
	accessibility: [
		{ title: 'Keyboard and focus', text: 'Example: open a control, move between choices, and return focus when it closes. Design-system coverage is TBD.' },
		{ title: 'Understandable state', text: 'Example: expose selection, progress, and errors without relying on color alone. Shared examples are TBD.' },
		{ title: 'Reduced motion', text: 'Example: retain status and meaning when animation is removed. Product-wide validation is TBD.' },
	],
	content: [
		{ title: 'Labels and actions', text: 'Example: describe the action clearly and consistently. A concise design-system writing guide is TBD.' },
		{ title: 'Errors and recovery', text: 'Example: explain what happened and what to do next. Recommended message patterns are TBD.' },
		{ title: 'Localization', text: 'Example: use localizable strings and allow room for translated text. Audited examples are TBD.' },
	],
};

export const values = [
	{ title: 'Calm', text: 'Quiet at rest, room to breathe, and plain language.' },
	{ title: 'Focused', text: 'One thing leads; supporting content stays secondary.' },
	{ title: 'Consistent', text: 'Equivalent roles use the same named scales and behaviors.' },
	{ title: 'Delightful', text: 'Motion and finishing touches earn their place by helping the task.' },
];

export const readingGuidance = {
	principles: 'Calm, Focused, Consistent, and Delightful are the values behind the system. Use them to explain why a design choice helps the task.',
	typography: 'Start with the platform font, choose a role for hierarchy, then apply emphasis and reading rhythm. Keep registered UI tokens separate from editor settings and unstandardized recipes.',
	spacing: 'Use the shared spacing ramp to group related content and leave room to breathe. Padding owns the space inside a container; gap owns the space between items.',
	shape: 'Choose roundness by the surface role: controls, inner containers, and floating overlays. Equivalent roles should use equivalent corners.',
	size: 'Use registered sizes for the roles they describe. Icon size is not a control’s hit target, and no shared control-height scale is implied here.',
	colors: 'Choose colors by semantic role, not by a matching hex value. Let the active theme provide the value; use terminal ANSI colors for the terminal’s named palette.',
	tokens: 'Look up an existing named decision before adding a new value. The visual pages explain the roles; this page supplies precise values and source locations.',
	theming: 'Preserve the hierarchy and legibility across themes. These shell illustrations show the overall balance, not a live preview of every widget or syntax color.',
	components: 'Choose a reusable control and its theme variant in the Storybook sidebar. Examples use the live Component Explorer renderer; usage, accessibility, and API details come from the source.',
	patterns: 'A pattern should connect controls to a task without losing context or focus. The examples below are audit topics, not finalized recipes.',
	motion: 'Use motion only when it explains change, guides attention, or confirms a result. Keep it bounded and interruptible, and preserve meaning with reduced motion.',
	iconography: 'Use an icon with a clear meaning and an accessible name. Choose the base or compact glyph for its context, not an arbitrary size.',
	layout: 'Make the primary task lead. Use spacing and grouping before adding separators, and keep the layout readable as available space changes.',
	accessibility: 'Make meaning and actions available without depending on vision, color, motion, or a pointing device. Validate behavior, not just attributes.',
	content: 'Use plain language that explains the task or next action. Keep labels meaningful, consistent, and ready for localization.',
};
