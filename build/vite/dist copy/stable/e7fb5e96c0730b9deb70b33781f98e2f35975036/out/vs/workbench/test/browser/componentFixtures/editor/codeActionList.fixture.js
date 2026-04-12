/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { ActionList } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import '../../../../../platform/actionWidget/browser/actionWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
function renderCodeActionList(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = options.width ?? '300px';
    const instantiationService = createEditorServices(disposableStore, {
        colorTheme: theme,
        additionalServices: (reg) => {
            registerWorkbenchServices(reg);
            reg.defineInstance(ILayoutService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.mainContainerOffset = { top: 0, quickPickTop: 0 };
                    this.onDidLayoutMainContainer = Event.None;
                    this.onDidLayoutActiveContainer = Event.None;
                    this.onDidLayoutContainer = Event.None;
                    this.onDidChangeActiveContainer = Event.None;
                    this.onDidAddContainer = Event.None;
                }
                get mainContainer() { return container; }
                get activeContainer() { return container; }
                get mainContainerDimension() { return { width: 300, height: 600 }; }
                get activeContainerDimension() { return { width: 300, height: 600 }; }
                get containers() { return [container]; }
                getContainer() { return container; }
                whenContainerStylesLoaded() { return undefined; }
            });
        },
    });
    const delegate = {
        onHide: () => { },
        onSelect: () => { },
    };
    const anchor = container;
    const list = disposableStore.add(instantiationService.createInstance(ActionList, 'codeActionWidget', false, options.items, delegate, undefined, undefined, anchor));
    // Render the list directly into the container instead of using context view
    const wrapper = document.createElement('div');
    wrapper.classList.add('action-widget');
    wrapper.appendChild(list.domNode);
    container.appendChild(wrapper);
    list.layout(0);
    list.focus();
}
const quickFixItems = [
    { kind: "header" /* ActionListItemKind.Header */, group: { title: 'Quick Fix' } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-import', label: 'Add missing import for \'useState\'', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-typo', label: 'Change spelling to \'initialCount\'', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-type', label: 'Add explicit type annotation', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
    { kind: "header" /* ActionListItemKind.Header */, group: { title: 'Extract', icon: Codicon.wrench } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'extract-const', label: 'Extract to constant in enclosing scope', group: { title: 'Extract', icon: Codicon.wrench } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'extract-fn', label: 'Extract to function in module scope', group: { title: 'Extract', icon: Codicon.wrench } },
    { kind: "header" /* ActionListItemKind.Header */, group: { title: 'Source Action', icon: Codicon.symbolFile } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'organize-imports', label: 'Organize Imports', group: { title: 'Source Action', icon: Codicon.symbolFile } },
];
const simpleFixes = [
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-1', label: 'Convert to arrow function', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-2', label: 'Remove unused variable', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
    { kind: "action" /* ActionListItemKind.Action */, item: 'fix-3', label: 'Add \'await\' to async call', group: { title: 'Quick Fix', icon: Codicon.lightBulb } },
];
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    GroupedCodeActions: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (context) => renderCodeActionList({ ...context, items: quickFixItems }),
    }),
    SimpleQuickFixes: defineComponentFixture({
        labels: { kind: 'screenshot' },
        render: (context) => renderCodeActionList({ ...context, items: simpleFixes }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbkxpc3QuZml4dHVyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2NvZGVBY3Rpb25MaXN0LmZpeHR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUEyQixvQkFBb0IsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hLLE9BQU8sRUFBRSxVQUFVLEVBQTRELE1BQU0sNERBQTRELENBQUM7QUFDbEosT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRXpGLE9BQU8sK0RBQStELENBQUM7QUFDdkUsT0FBTywwREFBMEQsQ0FBQztBQUNsRSxPQUFPLGtFQUFrRSxDQUFDO0FBTzFFLFNBQVMsb0JBQW9CLENBQUMsT0FBaUM7SUFDOUQsTUFBTSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsS0FBSyxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQ3RELFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLElBQUksT0FBTyxDQUFDO0lBRWpELE1BQU0sb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsZUFBZSxFQUFFO1FBQ2xFLFVBQVUsRUFBRSxLQUFLO1FBQ2pCLGtCQUFrQixFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDM0IseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDL0IsR0FB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