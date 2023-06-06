/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sash, Orientation, ISashEvent, IBoundarySashes, SashState } from 'vs/base/browser/ui/sash/sash';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, autorun, derived, observableValue } from 'vs/base/common/observable';

export class DiffEditorSash extends Disposable {
	private readonly _sashRatio = observableValue<number | undefined>('sashRatio', undefined);

	public readonly sashLeft = derived('sashLeft', reader => {
		const ratio = this._sashRatio.read(reader) ?? this._defaultSashRatio.read(reader);
		return this._computeSashLeft(ratio, reader);
	});

	private readonly _sash = this._register(new Sash(this._domNode, {
		getVerticalSashTop: (_sash: Sash): number => 0,
		getVerticalSashLeft: (_sash: Sash): number => this.sashLeft.get(),
		getVerticalSashHeight: (_sash: Sash): number => this._dimensions.height.get(),
	}, { orientation: Orientation.VERTICAL }));

	private _startSashPosition: number | undefined = undefined;

	constructor(
		private readonly _enableSplitViewResizing: IObservable<boolean>,
		private readonly _defaultSashRatio: IObservable<number>,
		private readonly _domNode: HTMLElement,
		private readonly _dimensions: { height: IObservable<number>; width: IObservable<number> },
	) {
		super();

		this._register(this._sash.onDidStart(() => {
			this._startSashPosition = this.sashLeft.get();
		}));
		this._register(this._sash.onDidChange((e: ISashEvent) => {
			const contentWidth = this._dimensions.width.get();
			const sashPosition = this._computeSashLeft((this._startSashPosition! + (e.currentX - e.startX)) / contentWidth, undefined);
			this._sashRatio.set(sashPosition / contentWidth, undefined);
		}));
		this._register(this._sash.onDidEnd(() => this._sash.layout()));
		this._register(this._sash.onDidReset(() => this._sashRatio.set(undefined, undefined)));

		this._register(autorun('update sash layout', (reader) => {
			const enabled = this._enableSplitViewResizing.read(reader);
			this._sash.state = enabled ? SashState.Enabled : SashState.Disabled;
			this.sashLeft.read(reader);
			this._sash.layout();
		}));
	}

	setBoundarySashes(sashes: IBoundarySashes): void {
		this._sash.orthogonalEndSash = sashes.bottom;
	}

	private _computeSashLeft(desiredRatio: number, reader: IReader | undefined): number {
		const contentWidth = this._dimensions.width.read(reader);
		const midPoint = Math.floor(this._defaultSashRatio.read(reader) * contentWidth);
		const sashLeft = this._enableSplitViewResizing.read(reader) ? Math.floor(desiredRatio * contentWidth) : midPoint;

		const MINIMUM_EDITOR_WIDTH = 100;
		if (contentWidth <= MINIMUM_EDITOR_WIDTH * 2) {
			return midPoint;
		}
		if (sashLeft < MINIMUM_EDITOR_WIDTH) {
			return MINIMUM_EDITOR_WIDTH;
		}
		if (sashLeft > contentWidth - MINIMUM_EDITOR_WIDTH) {
			return contentWidth - MINIMUM_EDITOR_WIDTH;
		}
		return sashLeft;
	}
}
