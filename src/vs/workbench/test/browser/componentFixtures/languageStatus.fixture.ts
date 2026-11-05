/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorType } from '../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { nativeHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { HoverWidget } from '../../../../platform/hover/browser/hoverWidget.js';
import { getSingletonServiceDescriptors } from '../../../../platform/instantiation/common/extensions.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { StatusbarEntryItem } from '../../../browser/parts/statusbar/statusbarItem.js';
import { LanguageStatusContribution } from '../../../contrib/languageStatus/browser/languageStatus.js';
import { IEditorGroupsService, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ILanguageStatus, ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from './fixtureUtils.js';

import '../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../platform/hover/browser/hover.css';
import '../../../browser/parts/statusbar/media/statusbarpart.css';

const combinedEntryId = 'status.languageStatus';

interface ILanguageStatusScenario {
	readonly statuses: readonly ILanguageStatus[];
	/** Items pinned through the hover's real pin action before the fixture is captured. */
	readonly pinned?: readonly string[];
}

// ============================================================================
// Scenario data
// ============================================================================

function languageStatus(status: Pick<ILanguageStatus, 'id' | 'name' | 'label' | 'source'> & Partial<ILanguageStatus>): ILanguageStatus {
	return {
		selector: '*',
		severity: Severity.Info,
		detail: '',
		busy: false,
		command: undefined,
		accessibilityInfo: undefined,
		...status,
	};
}

function command(title: string): ILanguageStatus['command'] {
	return { id: 'fixture.languageStatusCommand', title };
}

const typeScriptSource = 'TypeScript and JavaScript Language Features';

const typeScriptVersion = languageStatus({
	id: 'typescript.version',
	name: 'TypeScript Version',
	source: typeScriptSource,
	label: { value: '5.6.3', shortValue: 'TS 5.6.3' },
	detail: 'TypeScript',
	command: command('Select Version'),
});

const typeScriptProject = languageStatus({
	id: 'typescript.projectStatus',
	name: 'TypeScript Project',
	source: typeScriptSource,
	label: 'tsconfig.json',
	detail: 'Project configuration',
	command: command('Open Config File'),
});

const typeScriptBusy = languageStatus({
	id: 'typescript.projectLoading',
	name: 'TypeScript Project Loading',
	source: typeScriptSource,
	label: 'Initializing JS/TS language features',
	busy: true,
});

const typeScriptProjectError = languageStatus({
	id: 'typescript.projectStatus',
	name: 'TypeScript Project',
	source: typeScriptSource,
	severity: Severity.Error,
	label: 'tsconfig.json',
	detail: 'Unable to load the project configuration. [Show Log](command:fixture.showLog)',
	command: command('Open Config File'),
});

const jsonSchema = languageStatus({
	id: 'json.schema',
	name: 'JSON Schema',
	source: 'JSON Language Features',
	label: 'Schema validated',
	detail: '[package.json](https://json.schemastore.org/package)',
});

const eslint = languageStatus({
	id: 'eslint.status',
	name: 'ESLint',
	source: 'ESLint',
	label: 'ESLint',
	detail: 'Linting is enabled',
	command: command('Show Output'),
});

const prettier = languageStatus({
	id: 'prettier.status',
	name: 'Prettier',
	source: 'Prettier',
	label: 'Prettier',
});

const formatOnSave = languageStatus({
	id: 'prettier.formatOnSave',
	name: 'Format on Save',
	source: 'Prettier',
	label: 'Format on save',
	command: command('Configure'),
});

const iconLabel = languageStatus({
	id: 'fixture.iconLabel',
	name: 'Language Server',
	source: 'Language Server',
	label: '$(check) Ready',
	detail: '$(sync) Watching 1,284 files',
	command: command('Restart'),
});

const iconOnlyLabel = languageStatus({
	id: 'fixture.iconOnlyLabel',
	name: 'Inlay Hints',
	source: 'Inlay Hints',
	label: '$(eye)',
	detail: 'Inlay hints are shown while holding Ctrl+Alt',
});

const foldingLimit = languageStatus({
	id: 'foldingLimitInfo',
	name: 'Folding Status',
	source: 'Folding',
	severity: Severity.Warning,
	label: 'Folding ranges',
	detail: 'only 5000 shown for performance reasons',
	command: command('Configure'),
});

const colorDecoratorLimit = languageStatus({
	id: 'decoratorsLimitInfo',
	name: 'Color Decorator Status',
	source: 'Color Decorators',
	severity: Severity.Warning,
	label: 'Color decorators',
	detail: 'only 500 shown for performance reasons',
	command: command('Configure'),
});

const diagnosticsLimit = languageStatus({
	id: 'diagnosticsLimitInfo',
	name: 'Diagnostic Highlight Status',
	source: 'Diagnostics',
	severity: Severity.Warning,
	label: 'Diagnostic highlights',
	detail: 'Some diagnostics are not shown, and only 5000 diagnostics are highlighted in the editor for performance reasons.',
});

const spellCheckerLimit = languageStatus({
	id: 'spellChecker.limit',
	name: 'Spell Checker',
	source: 'Spell Checker',
	label: 'Spell checker',
	detail: 'This document exceeds the 500 KB limit, so only its first 500 KB are checked for spelling errors.',
	command: command('Configure Limit'),
});

// ============================================================================
// Rendering
// ============================================================================

/** Captures the entries `LanguageStatus` contributes so they can be rendered like the real status bar. */
class FixtureStatusbarService extends mock<IStatusbarService>() {

	readonly entries = new Map<string, IStatusbarEntry>();

	override readonly onDidChangeEntryVisibility = Event.None;

	override addEntry(entry: IStatusbarEntry, id: string): IStatusbarEntryAccessor {
		this.entries.set(id, entry);
		return {
			update: entry => this.entries.set(id, entry),
			dispose: () => this.entries.delete(id),
		};
	}

	override updateEntryVisibility(): void { }
}

function createLanguageStatusServiceCtor(): new () => ILanguageStatusService {
	const descriptor = getSingletonServiceDescriptors().find(([id]) => id === ILanguageStatusService)?.[1];
	if (!descriptor) {
		throw new Error('The language status service is not registered');
	}
	return descriptor.ctor;
}

function createActiveEditor(model: ITextModel, container: HTMLElement): ICodeEditor {
	return new class extends mock<ICodeEditor>() {
		override readonly onDidChangeModelLanguage = Event.None;
		override getEditorType() { return EditorType.ICodeEditor; }
		override hasModel(): this is IActiveCodeEditor { return true; }
		override getModel() { return model; }
		override getContainerDomNode() { return container; }
	};
}

function getHoverRows(tooltip: HTMLElement): HTMLElement[] {
	return Array.from(tooltip.querySelectorAll<HTMLElement>('.hover-language-status'));
}

/**
 * Renders the real language status contribution for one editor part: its status bar
 * entries in a status bar strip and its combined hover content in a real hover widget.
 */
async function renderLanguageStatus({ container, disposableStore, theme }: ComponentFixtureContext, scenario: ILanguageStatusScenario): Promise<void> {
	container.style.width = '760px';
	container.style.padding = '16px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';

	// Added before the services so the language status is disposed while they are still alive.
	const store = disposableStore.add(new DisposableStore());

	const statusbarService = new FixtureStatusbarService();
	const onWillDisposePart = new Emitter<void>();
	store.add(toDisposable(() => {
		onWillDisposePart.fire();
		onWillDisposePart.dispose();
	}));

	const part = new class extends mock<IEditorPart>() {
		override readonly onWillDispose = onWillDisposePart.event;
	};

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.define(ILanguageStatusService, createLanguageStatusServiceCtor());
			registration.defineInstance(IStatusbarService, statusbarService);
			registration.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
				override get activeTextEditorControl() { return editor; }
			});
			registration.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly parts = [part];
				override readonly onDidCreateAuxiliaryEditorPart = Event.None;
				override getScopedInstantiationService() { return instantiationService; }
			});
		},
	});

	const workbench = dom.append(container, dom.$('.monaco-workbench'));
	workbench.style.display = 'flex';
	workbench.style.flexDirection = 'column';
	workbench.style.alignItems = 'flex-start';
	workbench.style.gap = '8px';
	workbench.style.backgroundColor = 'var(--vscode-editor-background)';
	workbench.style.color = 'var(--vscode-foreground)';

	const statusbar = dom.append(workbench, dom.$('.part.statusbar'));
	statusbar.style.width = '100%';
	statusbar.style.height = '22px';
	statusbar.style.backgroundColor = 'var(--vscode-statusBar-background)';
	statusbar.style.color = 'var(--vscode-statusBar-foreground)';
	const statusbarItems = dom.append(statusbar, dom.$('.left-items.items-container'));
	const hoverHost = dom.append(workbench, dom.$('.language-status-fixture-hover'));

	const model = store.add(createTextModel(instantiationService, 'export const answer = 42;\n', URI.file('/workspace/src/index.ts')));
	const editor = createActiveEditor(model, workbench);

	const languageStatusService = instantiationService.get(ILanguageStatusService);
	for (const status of scenario.statuses) {
		store.add(languageStatusService.addStatus(status));
	}
	store.add(instantiationService.createInstance(LanguageStatusContribution));

	const tooltip = statusbarService.entries.get(combinedEntryId)?.tooltip;
	if (!dom.isHTMLElement(tooltip)) {
		throw new Error('The language status hover content was not contributed');
	}

	const hover = store.add(instantiationService.createInstance(HoverWidget, {
		content: tooltip,
		target: statusbar,
		position: { hoverPosition: HoverPosition.BELOW },
		appearance: { maxHeightRatio: 0.9, skipFadeInAnimation: true },
	}));
	hover.domNode.style.position = 'static';
	hoverHost.appendChild(hover.domNode);

	const ordered = languageStatusService.getLanguageStatus(model);
	for (const id of scenario.pinned ?? []) {
		const pinAction = getHoverRows(tooltip)[ordered.findIndex(status => status.id === id)]?.querySelector<HTMLElement>('.monaco-action-bar .action-item');
		if (!pinAction) {
			throw new Error(`No pin action for language status item '${id}'`);
		}
		pinAction.click();
	}

	await waitForFixtureCondition(() => {
		const rows = getHoverRows(tooltip);
		return rows.length === scenario.statuses.length
			&& (scenario.pinned ?? []).every(id => rows[ordered.findIndex(status => status.id === id)]?.querySelector('.codicon-pinned'))
			&& (scenario.pinned ?? []).every(id => statusbarService.entries.has(id));
	}, 'The language status hover did not reach the expected state');

	// The combined entry is contributed first, so it precedes the dedicated (pinned) entries as in the workbench.
	for (const entry of statusbarService.entries.values()) {
		const itemContainer = dom.append(statusbarItems, dom.$('.statusbar-item.left'));
		store.add(instantiationService.createInstance(StatusbarEntryItem, itemContainer, entry, nativeHoverDelegate));
	}

	hover.layout();
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'workbench/' }, {
	SingleItem: defineComponentFixture({
		expectedVisualDescriptions: ['A status bar with the language status braces icon above a hover containing one row: the TypeScript version "5.6.3", a separator dash, the detail "TypeScript", and a "Select Version" link next to a pin action.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion] }),
	}),
	LabelsWithoutDetails: defineComponentFixture({
		expectedVisualDescriptions: ['A hover with two rows that only have labels and therefore no separator dash: "Format on save" with a "Configure" link, and "Prettier" without a command. Each row ends with a pin action.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [prettier, formatOnSave] }),
	}),
	Information: defineComponentFixture({
		expectedVisualDescriptions: ['A hover with four informational rows without severity icons: ESLint, a JSON schema row whose detail is a "package.json" link, and two TypeScript rows. Labels, separator dashes, and details share one baseline; command links and pin actions are right-aligned.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion, typeScriptProject, jsonSchema, eslint] }),
	}),
	IconsInLabels: defineComponentFixture({
		expectedVisualDescriptions: ['A hover whose rows render codicons inline: a check icon before "Ready" with a sync icon in its detail, and an eye icon used as the entire label. Icons are vertically centered with their text.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [iconLabel, iconOnlyLabel, typeScriptVersion] }),
	}),
	Busy: defineComponentFixture({
		expectedVisualDescriptions: ['The status bar shows a loading spinner instead of the braces icon. In the hover, "Initializing JS/TS language features" is followed by a spinner icon, above the TypeScript version row.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptBusy, typeScriptVersion] }),
	}),
	Warnings: defineComponentFixture({
		expectedVisualDescriptions: ['The status bar braces icon has a dot. The hover shows a severity icon column: two warning rows for color decorator and folding limits with "Configure" links come first, followed by informational rows with check icons.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion, foldingLimit, colorDecoratorLimit, eslint] }),
	}),
	Errors: defineComponentFixture({
		expectedVisualDescriptions: ['The status bar braces icon shows an error. The hover starts with an error row for tsconfig.json whose detail contains a "Show Log" link, followed by a folding-limit warning and an informational TypeScript version row.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion, foldingLimit, typeScriptProjectError] }),
	}),
	Pinned: defineComponentFixture({
		expectedVisualDescriptions: ['The TypeScript version and ESLint items are pinned: the status bar shows "TS 5.6.3" and "ESLint" entries after the braces icon, and their hover rows show filled pinned icons while the tsconfig.json row keeps an unfilled pin.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion, typeScriptProject, eslint], pinned: [typeScriptVersion.id, eslint.id] }),
	}),
	LongDetails: defineComponentFixture({
		expectedVisualDescriptions: ['A hover at its maximum width with two details longer than one line: a diagnostic highlights warning without a command and a spell checker row with a "Configure Limit" link, alongside a folding warning and the TypeScript version row. All long text remains visible and the links and pin actions remain visible on the right.'],
		render: ctx => renderLanguageStatus(ctx, { statuses: [typeScriptVersion, foldingLimit, diagnosticsLimit, spellCheckerLimit] }),
	}),
	ManyItems: defineComponentFixture({
		expectedVisualDescriptions: ['A tall hover with an error row, three warning rows, and several informational rows including links, codicons, a busy spinner, and long text, all sharing one severity icon column.'],
		render: ctx => renderLanguageStatus(ctx, {
			statuses: [typeScriptVersion, typeScriptProjectError, jsonSchema, eslint, iconLabel, typeScriptBusy, foldingLimit, colorDecoratorLimit, diagnosticsLimit, spellCheckerLimit],
			pinned: [typeScriptVersion.id],
		}),
	}),
});
