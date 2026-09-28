/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { ISessionComparisonService } from '../../common/comparison.js';
import { ComparisonView } from '../../browser/comparisonView.js';
import { createComparisonTestData } from './comparisonTestUtils.js';

export default defineThemedFixtureGroup({ path: 'sessions/comparison/' }, {
	Setup: defineComponentFixture({ render: context => render(context, 'setup') }),
	Finished: defineComponentFixture({ render: context => render(context, 'finished') }),
	Preferred: defineComponentFixture({ render: context => render(context, 'preferred') }),
	Working: defineComponentFixture({ render: context => render(context, 'working') }),
	FourAttempts: defineComponentFixture({ render: context => render(context, 'four') }),
	Narrow: defineComponentFixture({ render: context => render(context, 'narrow') }),
});

function render({ container, disposableStore, theme }: ComponentFixtureContext, state: 'setup' | 'finished' | 'preferred' | 'working' | 'four' | 'narrow'): void {
	const width = state === 'narrow' ? 600 : 1300;
	container.style.width = `${width}px`;
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const data = createComparisonTestData(state === 'working' ? [SessionStatus.InProgress, SessionStatus.NeedsInput]
		: state === 'four' ? Array<SessionStatus>(4).fill(SessionStatus.Completed) : undefined);
	if (state === 'preferred') { data.service.prefer('comparison-1', 'attempt-0'); }
	if (state === 'setup') { data.service.selectRun(undefined); }
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IMarkdownRendererService, MarkdownRendererService);
			registration.defineInstance(ISessionComparisonService, data.service);
			registration.defineInstance(IChatService, data.chatService);
			registration.defineInstance(ISessionsService, new class extends mock<ISessionsService>() { });
			registration.defineInstance(ISessionChangesService, new class extends mock<ISessionChangesService>() { });
			registration.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { });
			registration.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() { });
			registration.defineInstance(ISessionsRecentWorkspacesService, new class extends mock<ISessionsRecentWorkspacesService>() { });
			registration.defineInstance(IEditorService, new class extends mock<IEditorService>() { });
			registration.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() { });
			registration.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { });
			registration.defineInstance(IFileService, new class extends mock<IFileService>() { });
		},
	});
	const view = disposableStore.add(instantiation.createInstance(ComparisonView));
	view.render(container);
	view.layout(width);
}
