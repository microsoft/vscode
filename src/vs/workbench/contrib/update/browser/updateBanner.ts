import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { localize } from '../../../../nls.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Codicon } from '../../../../base/common/codicons.js';

const UPDATE_BANNER_ID = 'update.banner';

export class UpdateBannerContribution extends Disposable implements IWorkbenchContribution {

    constructor(
        @IBannerService private readonly bannerService: IBannerService,
        @IUpdateService private readonly updateService: IUpdateService,
        @IProductService private readonly productService: IProductService
    ) {
        super();

        // Check initial state
        if (this.updateService.state.type === StateType.AvailableForDownload) {
            this.showUpdateBanner();
        }

        // Listen for state changes
        this._register(this.updateService.onStateChange(state => {
            if (state.type === StateType.AvailableForDownload) {
                this.showUpdateBanner();
            } else {
                // Hide banner for other states
                this.bannerService.hide(UPDATE_BANNER_ID);
            }
        }));
    }

    private showUpdateBanner(): void {
        const banner = {
            id: UPDATE_BANNER_ID,
            icon: Codicon.sync,
            message: localize('updateAvailable', "An update for {0} is available.", this.productService.nameLong),
        };

        this.bannerService.show(banner);
    }
}
