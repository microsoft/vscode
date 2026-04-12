import { register } from './codiconsUtil.js';
import { codiconsLibrary } from './codiconsLibrary.js';
/**
 * Only to be used by the iconRegistry.
 */
export function getAllCodicons() {
    return Object.values(Codicon);
}
/**
 * Derived icons, that could become separate icons.
 * These mappings should be moved into the mapping file in the vscode-codicons repo at some point.
 */
export const codiconsDerived = {
    dialogError: register('dialog-error', 'error'),
    dialogWarning: register('dialog-warning', 'warning'),
    dialogInfo: register('dialog-info', 'info'),
    dialogClose: register('dialog-close', 'close'),
    treeItemExpanded: register('tree-item-expanded', 'chevron-down'), // collapsed is done with rotation
    treeFilterOnTypeOn: register('tree-filter-on-type-on', 'list-filter'),
    treeFilterOnTypeOff: register('tree-filter-on-type-off', 'list-selection'),
    treeFilterClear: register('tree-filter-clear', 'close'),
    treeItemLoading: register('tree-item-loading', 'loading'),
    menuSelection: register('menu-selection', 'check'),
    menuSubmenu: register('menu-submenu', 'chevron-right'),
    menuBarMore: register('menubar-more', 'more'),
    scrollbarButtonLeft: register('scrollbar-button-left', 'triangle-left'),
    scrollbarButtonRight: register('scrollbar-button-right', 'triangle-right'),
    scrollbarButtonUp: register('scrollbar-button-up', 'triangle-up'),
    scrollbarButtonDown: register('scrollbar-button-down', 'triangle-down'),
    toolBarMore: register('toolbar-more', 'more'),
    quickInputBack: register('quick-input-back', 'arrow-left'),
    dropDownButton: register('drop-down-button', 0xeab4),
    symbolCustomColor: register('symbol-customcolor', 0xeb5c),
    exportIcon: register('export', 0xebac),
    workspaceUnspecified: register('workspace-unspecified', 0xebc3),
    newLine: register('newline', 0xebea),
    thumbsDownFilled: register('thumbsdown-filled', 0xec13),
    thumbsUpFilled: register('thumbsup-filled', 0xec14),
    gitFetch: register('git-fetch', 0xec1d),
    lightbulbSparkleAutofix: register('lightbulb-sparkle-autofix', 0xec1f),
    debugBreakpointPending: register('debug-breakpoint-pending', 0xebd9),
    chatImport: register('chat-import', 0xec86),
    chatExport: register('chat-export', 0xec87),
};
/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export const Codicon = {
    ...codiconsLibrary,
    ...codiconsDerived
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kaWNvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9jb2RpY29ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFLQSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBR3ZEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGNBQWM7SUFDN0IsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQy9CLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUc7SUFDOUIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsT0FBTyxDQUFDO0lBQzlDLGFBQWEsRUFBRSxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDO0lBQ3BELFVBQVUsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQztJQUMzQyxXQUFXLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxPQUFPLENBQUM7SUFDOUMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGNBQWMsQ0FBQyxFQUFFLGtDQUFrQztJQUNwRyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsYUFBYSxDQUFDO0lBQ3JFLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxnQkFBZ0IsQ0FBQztJQUMxRSxlQUFlLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQztJQUN2RCxlQUFlLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLFNBQVMsQ0FBQztJQUN6RCxhQUFhLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQztJQUNsRCxXQUFXLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7SUFDdEQsV0FBVyxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDO0lBQzdDLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxlQUFlLENBQUM7SUFDdkUsb0JBQW9CLEVBQUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGdCQUFnQixDQUFDO0lBQzFFLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxhQUFhLENBQUM7SUFDakUsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLGVBQWUsQ0FBQztJQUN2RSxXQUFXLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUM7SUFDN0MsY0FBYyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUM7SUFDMUQsY0FBYyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxNQUFNLENBQUM7SUFDcEQsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLE1BQU0sQ0FBQztJQUN6RCxVQUFVLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUM7SUFDdEMsb0JBQW9CLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLE1BQU0sQ0FBQztJQUMvRCxPQUFPLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUM7SUFDcEMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQztJQUN2RCxjQUFjLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQztJQUNuRCxRQUFRLEVBQUUsUUFBUSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUM7SUFDdkMsdUJBQXVCLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLE1BQU0sQ0FBQztJQUN0RSxzQkFBc0IsRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsTUFBTSxDQUFDO0lBQ3BFLFVBQVUsRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQztJQUMzQyxVQUFVLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUM7Q0FFbEMsQ0FBQztBQUVYOzs7Ozs7R0FNRztBQUNILE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBRztJQUN0QixHQUFHLGVBQWU7SUFDbEIsR0FBRyxlQUFlO0NBRVQsQ0FBQyJ9