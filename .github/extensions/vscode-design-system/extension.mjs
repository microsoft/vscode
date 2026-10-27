/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fileURLToPath } from 'node:url';
import { createCanvas, CanvasError, joinSession } from '@github/copilot-sdk/extension';
import { loadSystem, sections } from './system.mjs';
import { createStorybookPanel } from './storybook-host.mjs';
import { motionTopics } from './motion-reference.mjs';
import { buildNavigation, pageJumps } from './navigation-model.mjs';
import { readProvenance } from './provenance.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const instances = new Map();
const viewSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		section: { type: 'string', enum: sections.map(section => section.id) },
		theme: { type: 'string', description: 'A theme ID returned by inspect_system.' },
		compareTheme: { type: 'string', description: 'Legacy comparison data retained for compatibility; the theme gallery always shows every built-in theme.' },
		controlId: { type: 'string', description: 'Curated reusable control identifier from inspect_system.' },
		fixtureId: { type: 'string', maxLength: 1024, description: 'Actual fixture variant ID returned by the connected Component Explorer. Empty selects the default variant.' },
		query: { type: 'string', maxLength: 200 },
		explorerUrl: { type: 'string', maxLength: 2048, description: 'Local Component Explorer URL, for example http://localhost:5123/___explorer. Empty disconnects it.' },
		anchor: { type: 'string', description: 'An anchor from inspect_system pageAnchors, or empty for the page overview.' },
		expandedNodes: { type: 'array', items: { type: 'string' }, uniqueItems: true, maxItems: 100, description: 'Expanded branch IDs from inspect_system navigation. Expansion does not change the page.' },
	},
};

await joinSession({
	canvases: [createCanvas({
		id: 'vscode-design-system',
		displayName: 'VS Code Design System',
		description: 'Browse live source-backed Storybook docs and real Component Explorer fixtures.',
		actions: [{
			name: 'inspect_system',
			description: 'Read the current worktree inventory, available themes and sections, and live panel state.',
			handler: async () => {
				try {
					const system = loadSystem(root);
					return {
						themes: system.themes, sections,
						provenance: readProvenance(root),
						typographyTokenCount: system.typography.tokens.length,
						sizeTokenCount: system.sizes.length,
						themeColorCount: system.colors.length,
						iconCount: system.icons.length,
						controls: system.controls.map(control => ({ id: control.id, name: control.name, reason: control.reason })),
						controlGaps: system.controlGaps,
						motionSourceCount: system.motion.length,
						motionStatus: 'Outline and illustrative previews; no centralized product motion system or token values are defined.',
						motionTopics: motionTopics.map(topic => ({ id: topic.id, title: topic.title })),
						navigation: buildNavigation(system),
						pageAnchors: Object.fromEntries(sections.map(section => [section.id, pageJumps({ section: section.id })])),
						limitations: system.limitations,
						panels: [...instances].map(([instanceId, panel]) => ({ instanceId, url: panel.url, view: panel.view })),
					};
				} catch (error) {
					throw new CanvasError('DESIGN_READ_FAILED', error.message);
				}
			},
		}, {
			name: 'set_view',
			description: 'Change page, child-section anchor, expanded navigation branches, token-preview theme, component or variant, collection search, or renderer URL. Omitted fields keep their current values.',
			inputSchema: viewSchema,
			handler: async ({ instanceId, input }) => {
				const panel = instances.get(instanceId);
				if (!panel) {
					throw new CanvasError('PANEL_NOT_OPEN', 'Open the explorer before changing its view.');
				}
				try {
					return panel.setView(input);
				} catch (error) {
					throw new CanvasError('INVALID_VIEW', error.message);
				}
			},
		}],
		open: async ({ instanceId }) => {
			try {
				loadSystem(root);
				if (!instances.has(instanceId)) {
					const panel = await createStorybookPanel(root);
					instances.set(instanceId, panel);
				}
				return { title: 'VS Code Design System', url: instances.get(instanceId).url };
			} catch (error) {
				throw new CanvasError('DESIGN_OPEN_FAILED', error.message);
			}
		},
		onClose: async ({ instanceId }) => {
			const panel = instances.get(instanceId);
			if (panel) {
				await panel.close();
				instances.delete(instanceId);
			}
		},
	})],
});
