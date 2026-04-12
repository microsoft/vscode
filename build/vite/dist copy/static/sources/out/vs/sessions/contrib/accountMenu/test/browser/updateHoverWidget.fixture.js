/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { State } from '../../../../../platform/update/common/update.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { UpdateHoverWidget } from '../../browser/updateHoverWidget.js';
const mockUpdate = { version: 'a1b2c3d4e5f6', productVersion: '1.100.0', timestamp: Date.now() - 2 * 60 * 60 * 1000 };
const mockUpdateSameVersion = { version: 'a1b2c3d4e5f6', productVersion: '1.99.0', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 };
function createMockUpdateService(state) {
    const onStateChange = new Emitter();
    const service = {
        _serviceBrand: undefined,
        state,
        onStateChange: onStateChange.event,
        checkForUpdates: async () => { },
        downloadUpdate: async () => { },
        applyUpdate: async () => { },
        quitAndInstall: async () => { },
        isLatestVersion: async () => true,
        _applySpecificUpdate: async () => { },
        setInternalOrg: async () => { },
    };
    return service;
}
function renderHoverWidget(ctx, state) {
    ctx.container.style.backgroundColor = 'var(--vscode-editorHoverWidget-background)';
    const instantiationService = createEditorServices(ctx.disposableStore, {
        colorTheme: ctx.theme,
    });
    const updateService = createMockUpdateService(state);
    const productService = new class extends mock() {
        constructor() {
            super(...arguments);
            this.version = '1.99.0';
            this.nameShort = 'VS Code Insiders';
            this.commit = 'f0e1d2c3b4a5';
            this.date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        }
    };
    const hoverService = instantiationService.get(IHoverService);
    const widget = new UpdateHoverWidget(updateService, productService, hoverService);
    ctx.container.appendChild(widget.createHoverContent(state));
}
export default defineThemedFixtureGroup({ path: 'sessions/' }, {
    UpdateHoverReady: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.Ready(mockUpdate, true, false)),
    }),
    UpdateHoverAvailableForDownload: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.AvailableForDownload(mockUpdate)),
    }),
    UpdateHoverDownloading30Percent: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.Downloading(mockUpdate, true, false, 30_000_000, 100_000_000)),
    }),
    UpdateHoverInstalling: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.Downloaded(mockUpdate, true, false)),
    }),
    UpdateHoverUpdating: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.Updating(mockUpdate, true, 40, 100)),
    }),
    UpdateHoverSameVersion: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: ctx => renderHoverWidget(ctx, State.Ready(mockUpdateSameVersion, true, false)),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlSG92ZXJXaWRnZXQuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvYWNjb3VudE1lbnUvdGVzdC9icm93c2VyL3VwZGF0ZUhvdmVyV2lkZ2V0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFL0UsT0FBTyxFQUFrQixLQUFLLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQTJCLG9CQUFvQixFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDMUwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdkUsTUFBTSxVQUFVLEdBQUcsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUUsQ0FBQztBQUN0SCxNQUFNLHFCQUFxQixHQUFHLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDO0FBRXJJLFNBQVMsdUJBQXVCLENBQUMsS0FBWTtJQUM1QyxNQUFNLGFBQWEsR0FBRyxJQUFJLE9BQU8sRUFBUyxDQUFDO0lBQzNDLE1B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