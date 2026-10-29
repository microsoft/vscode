/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { NotificationTelemetryId } from '../../../../platform/notification/common/notificationTelemetry.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { NotificationsToasts } from '../../../browser/parts/notifications/notificationsToasts.js';
import { NotificationsModel } from '../../../common/notifications.js';
import { CustomizationMigrationCategoryId, getCustomizationMigrationCategory } from '../../../contrib/chat/browser/aiCustomization/customizationMigrationCategories.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { TestLifecycleService } from '../../common/workbenchTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureDomCondition } from './fixtureUtils.js';

interface IMigrationProgressNotificationFixtureOptions {
	readonly categoryId: CustomizationMigrationCategoryId;
	readonly count: number;
}

export default defineThemedFixtureGroup({ path: 'workbench/notifications/' }, {
	NoNotification: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => renderProgressNotification(ctx),
	}),
	PluginMarketplacesBatch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A standard VS Code information notification shows indeterminate progress and the message Migrating 4 plugin marketplaces.'],
		render: ctx => renderProgressNotification(ctx, {
			categoryId: CustomizationMigrationCategoryId.PluginMarketplaces,
			count: 4,
		}),
	}),
	PromptFilesBatch: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A standard VS Code information notification shows indeterminate progress and the message Converting 3 prompt files to skills.'],
		render: ctx => renderProgressNotification(ctx, {
			categoryId: CustomizationMigrationCategoryId.PromptFiles,
			count: 3,
		}),
	}),
	McpServerSingle: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A standard VS Code information notification shows indeterminate progress and the message Migrating 1 MCP server.'],
		render: ctx => renderProgressNotification(ctx, {
			categoryId: CustomizationMigrationCategoryId.McpServers,
			count: 1,
		}),
	}),
});

async function renderProgressNotification(ctx: ComponentFixtureContext, options?: IMigrationProgressNotificationFixtureOptions): Promise<void> {
	const { container, disposableStore, theme } = ctx;
	container.classList.add('monaco-workbench', 'monaco-reduce-motion');
	container.style.width = '720px';
	container.style.height = '180px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.background = 'var(--vscode-editor-background)';

	const activeGroup = new class extends mock<IEditorGroup>() {
		override focus(): void { }
	}();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.define(IListService, ListService);
			registration.defineInstance(ILifecycleService, disposableStore.add(new TestLifecycleService()));
			registration.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly mainContainer = container;
				override readonly onDidLayoutMainContainer = Event.None;
				override isVisible(_part: Parts): boolean { return false; }
			}());
			registration.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly activeGroup = activeGroup;
			}());
			registration.defineInstance(IHostService, new class extends mock<IHostService>() {
				override readonly hasFocus = true;
				override readonly onDidChangeFocus = Event.None;
			}());
			registration.defineInstance(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly enableSmokeTestDriver = false;
			}());
		},
	});
	const model = disposableStore.add(new NotificationsModel());
	disposableStore.add(toDisposable(() => {
		for (const notification of [...model.notifications]) {
			notification.close();
		}
	}));
	const toasts = disposableStore.add(instantiationService.createInstance(NotificationsToasts, container, model));
	toasts.layout(new DOM.Dimension(720, 180));
	if (!options) {
		return;
	}
	model.addNotification({
		severity: Severity.Info,
		message: getCustomizationMigrationCategory(options.categoryId).getProgressTitle(options.count),
		progress: { infinite: true },
		telemetry: NotificationTelemetryId.CustomizationMigration,
	});
	await waitForFixtureDomCondition(
		container,
		() => container.querySelector('.notification-toast-container') !== null,
		disposableStore,
	);
}
