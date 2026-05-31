/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule, resolveAmdNodeModulePath } from '../../../amdX.js';
import { WindowIntervalTimer } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { memoize } from '../../../base/common/decorators.js';
import { IProductService } from '../../product/common/productService.js';
import { AbstractSignService, IVsdaValidator } from '../common/abstractSignService.js';
import { ISignService } from '../common/sign.js';

declare namespace vsdaWeb {
	export function sign(salted_message: string): string;

	// eslint-disable-next-line @typescript-eslint/naming-convention
	export class validator {
		free(): void;
		constructor();
		createNewMessage(original: string): string;
		validate(signed_message: string): 'ok' | 'error';
	}

	export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
	export function init(module_or_path?: InitInput | Promise<InitInput>): Promise<unknown>;
}

// Initialized if/when vsda is loaded
declare const vsda_web: {
	default: typeof vsdaWeb.init;
	sign: typeof vsdaWeb.sign;
	validator: typeof vsdaWeb.validator;
};

const KEY_SIZE = 32;
const IV_SIZE = 16;
const STEP_SIZE = KEY_SIZE + IV_SIZE;

export class SignService extends AbstractSignService implements ISignService {
	constructor(@IProductService private readonly productService: IProductService) {
		super();
	}
	protected override getValidator(): Promise<IVsdaValidator> {
		return this.vsda().then(vsda => {
			const v = new vsda.validator();
			return {
				createNewMessage: arg => v.createNewMessage(arg),
				validate: arg => v.validate(arg),
				dispose: () => v.free(),
			};
		});
	}

	protected override signValue(arg: string): Promise<string> {
		return this.vsda().then(vsda => vsda.sign(arg));
	}

	@memoize
	private async vsda(): Promise<typeof vsda_web> {
		const checkInterval = new WindowIntervalTimer();
		let [wasm] = await Promise.all([
			this.getWasmBytes(),
			new Promise<void>((resolve, reject) => {
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

	private async getWasmBytes(): Promise<ArrayBuffer> {
		const url = resolveAmdNodeModulePath('vsda', 'rust/web/vsda_bg.wasm');
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error('error loading vsda');
		}

		return response.arrayBuffer();
	}
}
