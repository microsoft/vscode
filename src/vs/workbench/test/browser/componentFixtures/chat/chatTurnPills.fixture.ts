/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditSessionEntryDiff } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatResponseFileChangesService, IChatResponseFileEdit } from '../../../../contrib/chat/browser/chatResponseFileChangesService.js';
import { ChatTurnPillsContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatTurnPillsPart.js';
import { IChatContentPartRenderContext } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { ChatTurnStatusPillsSetting } from '../../../../contrib/chat/browser/widget/chatTurnPills.js';
import { IChatTurnPillsPart } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

// ============================================================================
// Mock helpers
// ============================================================================

/**
 * A per-request file diff. A created file has no before-content, so the agent
 * host provider maps its `originalURI` to the `modifiedURI` (equal URIs); an
 * edited file keeps a distinct original.
 */
function fileDiff(name: string, added: number, removed: number, created: boolean): IEditSessionEntryDiff {
	const modifiedURI = URI.file(`/repo/${name}`);
	const originalURI = created ? modifiedURI : URI.file(`/repo/.original/${name}`);
	return { originalURI, modifiedURI, added, removed, quitEarly: false, identical: false, isFinal: true, isBusy: false };
}

function externalFileDiff(name: string, added: number, removed: number, created: boolean): IEditSessionEntryDiff {
	const modifiedURI = URI.file(`/home/user/${name}`);
	const originalURI = created ? modifiedURI : URI.file(`/home/user/.original/${name}`);
	return { originalURI, modifiedURI, added, removed, quitEarly: false, identical: false, isFinal: true, isBusy: false };
}

function stubFileChangesService(diffs: readonly IEditSessionEntryDiff[], externalDiffs: readonly IEditSessionEntryDiff[]): IChatResponseFileChangesService {
	const fileEdits: readonly IChatResponseFileEdit[] = [
		...diffs.map(diff => ({ ...diff, isOutsideWorkspace: false })),
		...externalDiffs.map(diff => ({ ...diff, isOutsideWorkspace: true })),
	];
	return new class extends mock<IChatResponseFileChangesService>() {
		override getChangesForRequest() {
			return constObservable(diffs);
		}
		override getFileEditsForRequest() {
			return constObservable(fileEdits);
		}
	}();
}

// ============================================================================
// Render helper (standalone content part)
// ============================================================================

interface IRenderTurnPillsOptions {
	readonly diffs: readonly IEditSessionEntryDiff[];
	readonly externalDiffs?: readonly IEditSessionEntryDiff[];
	readonly setting?: ChatTurnStatusPillsSetting;
	/** When `true`, the changed-files disclosure is expanded. */
	readonly expanded?: boolean;
}

function renderTurnPills(ctx: ComponentFixtureContext, options: IRenderTurnPillsOptions): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Broad chat service graph: IContextMenuService, IEditorService and the
			// ResourceLabels dependencies the preview action needs.
			registerChatFixtureServices(reg);
			reg.defineInstance(IChatResponseFileChangesService, stubFileChangesService(options.diffs, options.externalDiffs ?? []));
		},
	});

	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, options.setting ?? true);

	const content: IChatTurnPillsPart = {
		kind: 'turnPills',
		requestId: 'request-1',
		sessionResource: URI.parse('vscode-chat-session://agent-host/session-1'),
		isLastTurn: true,
	};
	const partContext = upcastPartial<IChatContentPartRenderContext>({ container });

	const part = disposableStore.add(instantiationService.createInstance(ChatTurnPillsContentPart, content, partContext));

	if (options.expanded) {
		part.domNode.querySelector<HTMLDetailsElement>('.checkpoint-file-changes-disclosure')!.open = true;
	}

	// The turn changes summary reuses the checkpoint summary styling, which is
	// scoped under `.interactive-session` (and relies on `.monaco-workbench` for
	// codicon sizing custom properties).
	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.appendChild(part.domNode);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/' }, {

	// --- Standalone content part in each of its states ---

	part: defineThemedFixtureGroup({
		ChangesOnly_SingleFile: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, { diffs: [fileDiff('app.ts', 12, 5, false)] }),
		}),

		ChangesOnly_MultipleFiles: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				diffs: [
					fileDiff('app.ts', 42, 7, false),
					fileDiff('util.ts', 118, 64, false),
					fileDiff('index.ts', 5, 0, true),
				],
			}),
		}),

		ChangesOnly_Expanded: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				expanded: true,
				diffs: [
					fileDiff('app.ts', 42, 7, false),
					fileDiff('util.ts', 118, 64, false),
					fileDiff('index.ts', 5, 0, true),
				],
			}),
		}),

		WorkspaceMarkdown_NoPreview: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				diffs: [
					fileDiff('README.md', 20, 0, true),
					fileDiff('app.ts', 8, 3, false),
				],
			}),
		}),

		ChangesAndExternalPreview_Markdown: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				diffs: [fileDiff('app.ts', 8, 3, false)],
				externalDiffs: [externalFileDiff('README.md', 20, 0, true)],
			}),
		}),

		// The external README remains in the preview pill and out of the expanded
		// workspace changes list.
		ChangesAndExternalPreview_Expanded: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				expanded: true,
				diffs: [
					fileDiff('index.html', 30, 4, true),
					fileDiff('app.ts', 8, 3, false),
					fileDiff('styles.css', 4, 1, false),
				],
				externalDiffs: [externalFileDiff('README.md', 20, 0, true)],
			}),
		}),

		// With several external Markdown files, the created file is primary.
		ChangesAndExternalPreview_MultipleMarkdown: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				diffs: [
					fileDiff('app.ts', 8, 3, false),
					fileDiff('index.html', 30, 4, true),
				],
				externalDiffs: [
					externalFileDiff('README.md', 20, 0, true),
					externalFileDiff('CHANGELOG.md', 6, 1, false),
				],
			}),
		}),

		LegacyPreviewOptionEnablesAll: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, {
				setting: { preview: true },
				diffs: [fileDiff('app.ts', 8, 3, false)],
				externalDiffs: [externalFileDiff('README.md', 20, 0, true)],
			}),
		}),

		NoChanges_Hidden: defineComponentFixture({
			render: (ctx) => renderTurnPills(ctx, { diffs: [] }),
		}),
	}),

	// --- Turn changes summary inside the entire chat ---

	inChat: defineThemedFixtureGroup({
		Changes: defineComponentFixture({
			render: (ctx) => renderChatWidget(ctx, {
				turnStatusPills: true,
				messages: [
					{
						user: 'Refactor the fibonacci helper to be iterative',
						assistant: [
							{ kind: 'markdown', text: 'I rewrote `fibonacci(n)` to use an iterative loop and updated its callers, avoiding the exponential recursion.' },
						],
						fileChanges: [
							{ name: 'fibon.ts', added: 12, removed: 8, created: false },
							{ name: 'app.ts', added: 3, removed: 1, created: false },
						],
					},
				],
			}),
		}),

		ChangesAndExternalPreview: defineComponentFixture({
			render: (ctx) => renderChatWidget(ctx, {
				turnStatusPills: true,
				messages: [
					{
						user: 'Create a Markdown handoff note in my home folder',
						assistant: [
							{ kind: 'markdown', text: 'I added `/home/user/session-notes.md` with the handoff details and updated `app.ts` in the workspace.' },
						],
						fileChanges: [
							{ name: 'session-notes.md', added: 42, removed: 0, created: true, isOutsideWorkspace: true },
							{ name: 'app.ts', added: 4, removed: 1, created: false },
						],
					},
				],
			}),
		}),
	}),
});
