/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Retains the last successful document's favicon while a failed navigation is displayed. */
export class BrowserViewFavicon {

	private _documentFavicon: string | undefined;
	private _value: string | undefined;
	private _failedLoad = false;

	constructor(
		private _lastSuccessfulUrl: string,
		private readonly onDidChange: (favicon: string | undefined) => void,
	) { }

	get value(): string | undefined {
		return this._value;
	}

	didNavigate(url: string): void {
		if (URL.parse(url)?.host !== URL.parse(this._lastSuccessfulUrl)?.host) {
			this._documentFavicon = undefined;
		}
		this._lastSuccessfulUrl = url;
		this._failedLoad = false;
		this._setValue(this._documentFavicon);
	}

	didFailLoad(url: string): void {
		this._failedLoad = true;
		this._setValue(URL.parse(url)?.host === URL.parse(this._lastSuccessfulUrl)?.host ? this._documentFavicon : undefined);
	}

	update(favicon: string | undefined): boolean {
		if (this._failedLoad) {
			return false;
		}
		this._documentFavicon = favicon;
		this._setValue(favicon);
		return true;
	}

	private _setValue(favicon: string | undefined): void {
		if (this._value !== favicon) {
			this._value = favicon;
			this.onDidChange(favicon);
		}
	}
}
