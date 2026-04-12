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
import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../amdX.js';
import { WindowIntervalTimer } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { memoize } from '../../../base/common/decorators.js';
import { IProductService } from '../../product/common/productService.js';
import { AbstractSignService } from '../common/abstractSignService.js';
const KEY_SIZE = 32;
const IV_SIZE = 16;
const STEP_SIZE = KEY_SIZE + IV_SIZE;
let SignService = class SignService extends AbstractSignService {
    constructor(productService) {
        super();
        this.productService = productService;
    }
    getValidator() {
        return this.vsda().then(vsda => {
            const v = new vsda.validator();
            return {
                createNewMessage: arg => v.createNewMessage(arg),
                validate: arg => v.validate(arg),
                dispose: () => v.free(),
            };
        });
    }
    signValue(arg) {
        return this.vsda().then(vsda => vsda.sign(arg));
    }
    async vsda() {
        const checkInterval = new WindowIntervalTimer();
        let [wasm] = await Promise.all([
            this.getWasmBytes(),
            new Promise((resolve, reject) => {
                importAMDNodeModule('vsda', 'rust/web/vsda.js').then(() => resolve(), reject);
                // todo@connor4312: there seems to be a bug(?) in vscode-loader with
                // require() not resolving in web once the script loads, so check manually
                checkInterval.cancelAndSet(() => {
                    if (typeof vsda_web !== 'undefined') {
                        resolve();
                    }
                }, 50, mainWindow);
            }).finally(() => checkInterval.dispose()),
        ]);
        const keyBytes = new TextEncoder().encode(this.productService.serverLicense?.join('\n') || '');
        for (let i = 0; i + STEP_SIZE < keyBytes.length; i += STEP_SIZE) {
            const key = await crypto.subtle.importKey('raw', keyBytes.slice(i + IV_SIZE, i + IV_SIZE + KEY_SIZE), { name: 'AES-CBC' }, false, ['decrypt']);
            wasm = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: keyBytes.slice(i, i + IV_SIZE) }, key, wasm);
        }
        await vsda_web.default(wasm);
        return vsda_web;
    }
    async getWasmBytes() {
        const url = resolveAmdNodeModulePath('vsda', 'rust/web/vsda_bg.wasm');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('error loading vsda');
        }
        return response.arrayBuffer();
    }
};
__decorate([
    memoize
], SignService.prototype, "vsda", null);
SignService = __decorate([
    __param(0, IProductService)
], SignService);
export { SignService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zaWduL2Jyb3dzZXIvc2lnblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDakYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUFrQixNQUFNLGtDQUFrQyxDQUFDO0FBeUJ2RixNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUM7QUFDcEIsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0FBQ25CLE1BQU0sU0FBUyxHQUFHLFFBQVEsR0FBRyxPQUFPLENBQUM7QUFFOUIsSUFBTSxXQUFXLEdBQWpCLE1BQU0sV0FBWSxTQUFRLG1CQUFtQjtJQUNuRCxZQUE4QyxjQUErQjtRQUM1RSxLQUFLLEVBQUUsQ0FBQztRQURxQyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7SUFFN0UsQ0FBQztJQUNrQixZQUFZO1FBQzlCLE9BQU8sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM5QixNQUFNLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvQixPQUFPO2dCQUNOLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQztn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