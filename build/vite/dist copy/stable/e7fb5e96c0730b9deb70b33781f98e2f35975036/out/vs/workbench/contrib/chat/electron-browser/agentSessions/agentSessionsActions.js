import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { ProductQualityContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { URI } from '../../../../../base/common/uri.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../../base/common/network.js';
export class OpenAgentsWindowAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openAgentsWindow',
            title: localize2('openAgentsWindow', "Open Agents Application"),
            category: CHAT_CATEGORY,
            precondition: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatEntitlementContextKeys.Setup.hidden.negate(), IsSessionsWindowContext.negate()),
            f1: true,
            menu: [{
                    id: MenuId.ChatTitleBarMenu,
                    group: 'c_sessions',
                    order: 1,
                    when: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatEntitlementContextKeys.Setup.hidden.negate(), IsSessionsWindowContext.negate())
                }]
        });
    }
    async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const productService = accessor.get(IProductService);
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        if (environmentService.isBuilt && (isMacintosh || isWindows)) {
            const scheme = productService.quality === 'stable'
                ? 'vscode-agents'
                : productService.quality === 'exploration'
                    ? 'vscode-agents-exploration'
                    : 'vscode-agents-insiders';
            await openerService.open(URI.from({ scheme, authority: Schemas.file }), { openExternal: true });
        }
        else {
            const nativeHostService = accessor.get(INativeHostService);
            await nativeHostService.openAgentsWindow();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2VsZWN0cm9uLWJyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFLQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDbEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDckYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDN0csT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxPQUFPO0lBQ2xEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLG1DQUFtQztZQUN2QyxLQUFLLEVBQUUsU0FBUyxDQUFDLGtCQUFrQixFQUFFLHlCQUF5QixDQUFDO1lBQy9ELFFBQVEsRUFBRSxhQUFhO1lBQ3ZCLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSwwQkFBMEIsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pLLEVBQUUsRUFBRSxJQUFJO1lBQ1IsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7b0JBQzNCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsQ0FBQztvQkFDUixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsMEJBQTBCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsRUFBRSx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQztpQkFDekosQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkQsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV0RSxJQUFJLGtCQUFrQixDQUFDLE9BQU8sSUFBSSxDQUFDLFdBQVcsSUFBSSxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzlELE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxPQUFPLEtBQUssUUFBUTtnQkFDakQsQ0FBQyxDQUFDLGVBQWU7Z0JBQ2pCLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxLQUFLLGFBQWE7b0JBQ3pDLENBQUMsQ0FBQywyQkFBMkI7b0JBQzdCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztZQUU3QixNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNqRyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzNELE1BQU0saUJBQWlCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUM1QyxDQUFDO0lBQ0YsQ0FBQztDQUNEIn0=