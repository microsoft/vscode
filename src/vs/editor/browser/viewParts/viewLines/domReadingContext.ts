/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class DomReadingContext {

	private _didDomLayout: boolean = false;
	private _clientRectDeltaLeft: number = 0;
	private _clientRectScale: number = 1;
	private _clientRectRead: boolean = false;

	public get didDomLayout(): boolean {
		return this._didDomLayout;
	}

	private readClientRect(): void {
		if (!this._clientRectRead) {
			this._clientRectRead = true;
			const rect = this._domNode.getBoundingClientRect();
			this.markDidDomLayout();
			this._clientRectDeltaLeft = rect.left;
			const offsetWidth = this._domNode.offsetWidth;
			this._clientRectScale = offsetWidth > 0 ? rect.width / offsetWidth : 1;
		}
	}

	public get clientRectDeltaLeft(): number {
		if (!this._clientRectRead) {
			this.readClientRect();
		}
		return this._clientRectDeltaLeft;
	}

	public get clientRectScale(): number {
		if (!this._clientRectRead) {
			this.readClientRect();
		}
		return this._clientRectScale;
	}

	constructor(
		private readonly _domNode: HTMLElement,
		public readonly endNode: HTMLElement
	) {
	}

	public markDidDomLayout(): void {
		this._didDomLayout = true;
	}
}
