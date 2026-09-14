/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { z } from 'zod';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDiffEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

interface IDiffEditorFixtureOptions {
	readonly compactMode: boolean;
	readonly renderSideBySide: boolean;
}

const originalCode = `export interface SyncSettings {
	retryLimit: number;
	batchSize: number;
	validateBeforeApply: boolean;
}

const defaultSettings: SyncSettings = {
	retryLimit: 3,
	batchSize: 25,
	validateBeforeApply: true,
};

export class WorkspaceSyncCoordinator {
	private readonly pendingResources = new Map<string, string>();

	constructor(private readonly settings = defaultSettings) {}

	async synchronize(resources: readonly string[]): Promise<number> {
		const candidates = resources
			.filter(resource => resource.length > 0)
			.map(resource => resource.trim());

		for (const resource of candidates) {
			this.pendingResources.set(resource, 'queued');
		}

		if (this.settings.validateBeforeApply) {
			this.validateSnapshot(candidates);
		}

		let applied = 0;
		for (const batch of this.createBatches(candidates)) {
			applied += await this.applyBatch(batch);
		}

		return applied;
	}

	private validateSnapshot(resources: readonly string[]): void {
		if (new Set(resources).size !== resources.length) {
			throw new Error('Duplicate resources are not supported');
		}
	}

	private createBatches(resources: readonly string[]): readonly string[][] {
		const batches: string[][] = [];
		for (let index = 0; index < resources.length; index += this.settings.batchSize) {
			batches.push(resources.slice(index, index + this.settings.batchSize));
		}
		return batches;
	}

	private async applyBatch(resources: readonly string[]): Promise<number> {
		for (const resource of resources) {
			this.pendingResources.set(resource, 'applied');
		}
		return resources.length;
	}
}

export function createWorkspaceSyncCoordinator(): WorkspaceSyncCoordinator {
	return new WorkspaceSyncCoordinator();
}`;

const modifiedCode = `export interface SyncSettings {
	retryLimit: number;
	batchSize: number;
	validateBeforeApply: boolean;
}

const defaultSettings: SyncSettings = {
	retryLimit: 5,
	batchSize: 50,
	validateBeforeApply: true,
};

export class WorkspaceSyncCoordinator {
	private readonly pendingResources = new Map<string, string>();

	constructor(private readonly settings = defaultSettings) {}

	async synchronize(resources: readonly string[]): Promise<number> {
		const candidates = resources
			.filter(resource => resource.length > 0)
			.map(resource => resource.trim());

		for (const resource of candidates) {
			this.pendingResources.set(resource, 'queued');
		}

		if (this.settings.validateBeforeApply) {
			this.validateSnapshot(candidates);
		}

		let applied = 0;
		for (const batch of this.createBatches(candidates)) {
			applied += await this.applyBatch(batch);
		}

		return applied;
	}

	private validateSnapshot(resources: readonly string[]): void {
		if (resources.some(resource => resource.includes('..'))) {
			throw new Error('Parent paths are not supported');
		}
	}

	private createBatches(resources: readonly string[]): readonly string[][] {
		const batches: string[][] = [];
		for (let index = 0; index < resources.length; index += this.settings.batchSize) {
			batches.push(resources.slice(index, index + this.settings.batchSize));
		}
		return batches;
	}

	private async applyBatch(resources: readonly string[]): Promise<number> {
		for (const resource of resources) {
			this.pendingResources.set(resource, 'synchronized');
		}
		return resources.length;
	}
}

export function createWorkspaceSyncCoordinator(): WorkspaceSyncCoordinator {
	return new WorkspaceSyncCoordinator();
}`;

const fixtureOptions = {
	inputControls: {
		compactMode: { placement: 'sidebar', label: 'Compact Mode' },
		renderSideBySide: { placement: 'sidebar', label: 'Side by Side' },
	},
	themes: ['dark'],
	labels: { kind: 'screenshot' },
} as const;

function createInputSchema(defaults: IDiffEditorFixtureOptions) {
	return z.object({
		compactMode: z.boolean().default(defaults.compactMode).describe('Use the diff editor compact presentation.'),
		renderSideBySide: z.boolean().default(defaults.renderSideBySide).describe('Render original and modified editors side by side.'),
	});
}

function fixture(defaults: IDiffEditorFixtureOptions) {
	const inputSchema = createInputSchema(defaults);
	return defineComponentFixture({
		...fixtureOptions,
		inputSchema,
		expectedVisualDescriptions: [
			defaults.compactMode
				? 'The native compact diff presentation uses thin collapsed markers for internal unchanged regions.'
				: 'The native regular diff presentation shows expandable controls for unchanged regions.',
			defaults.renderSideBySide
				? 'Original and modified TypeScript are shown side by side.'
				: 'Original and modified TypeScript are shown in one inline editor.',
		],
		render: context => renderDiffEditor(context, inputSchema),
	});
}

async function renderDiffEditor(context: ComponentFixtureContext, inputSchema: ReturnType<typeof createInputSchema>): Promise<void> {
	const { container, disposableStackStore, disposableStore, theme } = context;
	const width = 880;
	const height = 620;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const input = inputSchema.parse(context.input);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			registration.definePartialInstance(IEditorProgressService, {
				show: () => ({ total: () => { }, worked: () => { }, done: () => { } }),
			});
		},
	});
	const original = disposableStackStore.add(createTextModel(
		instantiationService,
		originalCode,
		URI.parse('inmemory://diff-editor/original/workspaceSync.ts'),
		'typescript'
	));
	const modified = disposableStackStore.add(createTextModel(
		instantiationService,
		modifiedCode,
		URI.parse('inmemory://diff-editor/modified/workspaceSync.ts'),
		'typescript'
	));
	const options: IDiffEditorOptions = {
		automaticLayout: false,
		readOnly: true,
		renderSideBySide: input.renderSideBySide,
		useInlineViewWhenSpaceIsLimited: false,
		compactMode: input.compactMode,
		hideUnchangedRegions: {
			enabled: true,
			contextLineCount: 2,
			minimumLineCount: 4,
			revealLineCount: 10,
		},
	};
	const widget = disposableStackStore.add(instantiationService.createInstance(
		DiffEditorWidget,
		container,
		options,
		{}
	));
	const viewModel = disposableStackStore.add(RefCounted.create(widget.createViewModel({ original, modified })));
	widget.setDiffModel(viewModel);
	disposableStackStore.add(toDisposable(() => widget.setDiffModel(null)));
	widget.layout(new Dimension(width, height));
	await widget.waitForDiff();
	context.focus(widget.getModifiedEditor());
}

export default defineThemedFixtureGroup({ path: 'editor/diffEditor' }, {
	HiddenUnchangedRegions: defineThemedFixtureGroup({
		RegularSideBySide: fixture({ compactMode: false, renderSideBySide: true }),
		CompactSideBySide: fixture({ compactMode: true, renderSideBySide: true }),
		RegularInline: fixture({ compactMode: false, renderSideBySide: false }),
		CompactInline: fixture({ compactMode: true, renderSideBySide: false }),
	}),
});
