/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { first } from '../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IProductService } from '../../product/common/productService.js';
export class AbstractURLService extends Disposable {
    constructor() {
        super(...arguments);
        this.handlers = new Set();
    }
    open(uri, options) {
        const handlers = [...this.handlers.values()];
        return first(handlers.map(h => () => h.handleURL(uri, options)), undefined, false).then(val => val || false);
    }
    registerHandler(handler) {
        this.handlers.add(handler);
        return toDisposable(() => this.handlers.delete(handler));
    }
}
let NativeURLService = class NativeURLService extends AbstractURLService {
    constructor(productService) {
        super();
        this.productService = productService;
    }
    create(options) {
        let { authority, path, query, fragment } = options ? options : { authority: undefined, path: undefined, query: undefined, fragment: undefined };
        if (authority && path && path.indexOf('/') !== 0) {
            path = `/${path}`; // URI validation requires a path if there is an authority
        }
        return URI.from({ scheme: this.productService.urlProtocol, authority, path, query, fragment });
    }
};
NativeURLService = __decorate([
    __param(0, IProductService)
], NativeURLService);
export { NativeURLService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VybC9jb21tb24vdXJsU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUd6RSxNQUFNLE9BQWdCLGtCQUFtQixTQUFRLFVBQVU7SUFBM0Q7O1FBSVMsYUFBUSxHQUFHLElBQUksR0FBRyxFQUFlLENBQUM7SUFhM0MsQ0FBQztJQVRBLElBQUksQ0FBQyxHQUFRLEVBQUUsT0FBeUI7UUFDdkMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUM3QyxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQzlHLENBQUM7SUFFRCxlQUFlLENBQUMsT0FBb0I7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0IsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUMxRCxDQUFDO0NBQ0Q7QUFFTSxJQUFNLGdCQUFnQixHQUF0QixNQUFNLGdCQUFpQixTQUFRLGtCQUFrQjtJQUV2RCxZQUNxQyxjQUErQjtRQUVuRSxLQUFLLEVBQUUsQ0FBQztRQUY0QixtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7SUFHcEUsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFnQztRQUN0QyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDO1FBRWhKLElBQUksU0FBUyxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2xELElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsMERBQTBEO1FBQzlFLENBQUM7UUFFRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNoRyxDQUFDO0NBQ0QsQ0FBQTtBQWpCWSxnQkFBZ0I7SUFHMUIsV0FBQSxlQUFlLENBQUE7R0FITCxnQkFBZ0IsQ0FpQjVCIn0=