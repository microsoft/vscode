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
import { IChatResponseFileChangesService } from '../../../../contrib/chat/browser/chatResponseFileChangesService.js';
import { ChatTurnPillsContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatTurnPillsPart.js';
import { IChatContentPartRenderContext } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IChatTurnPillsPart } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

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

function stubFileChangesService(diffs: readonly IEditSessionEntryDiff[]): IChatResponseFileChangesService {
	return new class extends mock<IChatResponseFileChangesService>() {
		override getChangesForRequest() {
			return constObservable(diffs);
		}
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderTurnPills(ctx: ComponentFixtureContext, diffs: readonly IEditSessionEntryDiff[]): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Broad chat service graph: IContextMenuService, IEditorService and the
			// ResourceLabels dependencies the preview pill needs.
			registerChatFixtureServices(reg);
			reg.defineInstance(IChatResponseFileChangesService, stubFileChangesService(diffs));
		},
	});

	// Both pills are off by default; enable them so the fixture renders.
	(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, { changes: true, preview: true });

	const content: IChatTurnPillsPart = {
		kind: 'turnPills',
		requestId: 'request-1',
		sessionResource: URI.parse('vscode-chat-session://agent-host/session-1'),
	};
	const context = upcastPartial<IChatContentPartRenderContext>({ container });

	const part = disposableStore.add(instantiationService.createInstance(ChatTurnPillsContentPart, content, context));

	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.appendChild(part.domNode);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/' }, {

	ChangesSingleFile: defineComponentFixture({
		render: (ctx) => renderTurnPills(ctx, [fileDiff('app.ts', 12, 5, false)]),
	}),

	ChangesMultipleFiles: defineComponentFixture({
		render: (ctx) => renderTurnPills(ctx, [
			fileDiff('app.ts', 42, 7, false),
			fileDiff('util.ts', 118, 64, false),
			fileDiff('index.ts', 5, 0, true),
		]),
	}),

	PreviewMarkdown: defineComponentFixture({
		render: (ctx) => renderTurnPills(ctx, [
			fileDiff('README.md', 20, 0, true),
			fileDiff('app.ts', 8, 3, false),
		]),
	}),

	PreviewMultiple: defineComponentFixture({
		render: (ctx) => renderTurnPills(ctx, [
			fileDiff('app.ts', 8, 3, false),
			fileDiff('README.md', 20, 0, true),
			fileDiff('index.html', 30, 4, true),
			fileDiff('CHANGELOG.md', 6, 1, false),
		]),
	}),

	NoChanges_Hidden: defineComponentFixture({
		render: (ctx) => renderTurnPills(ctx, []),
	}),
});
