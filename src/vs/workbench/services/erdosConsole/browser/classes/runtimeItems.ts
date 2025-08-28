/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatOutputLinesForClipboard } from '../utils/clipboardUtils.js';
import { ANSIOutput, ANSIOutputLine } from '../../../../../base/common/ansiOutput.js';
import { SessionAttachMode } from '../interfaces/erdosConsoleService.js';
import { RuntimeExitReason } from '../../../languageRuntime/common/languageRuntimeService.js';
import { IConsoleCodeAttribution } from '../../common/erdosConsoleCodeExecution.js';
import { ActivityItem, ActivityItemInput, ActivityItemInputState, ActivityItemStream } from './activityItems.js';

export class RuntimeItem {
	protected _isHidden = false;

	constructor(readonly id: string) {
	}

	public get isHidden(): boolean {
		return this._isHidden;
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return [];
	}

	public optimizeScrollback(scrollbackSize: number) {
		if (!scrollbackSize) {
			this._isHidden = true;
			return 0;
		}

		this._isHidden = false;
		return scrollbackSize - 1;
	}
}

export class RuntimeItemStandard extends RuntimeItem {
	readonly outputLines: readonly ANSIOutputLine[];

	constructor(id: string, message: string) {
		super(id);
		this.outputLines = ANSIOutput.processOutput(message);
	}

	public override getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this.outputLines, commentPrefix);
	}
}

const isSameActivityItemStream = (
	activityItemStream1: ActivityItemStream,
	activityItemStream2: ActivityItemStream
) =>
	activityItemStream1.type === activityItemStream2.type &&
	activityItemStream1.parentId === activityItemStream2.parentId;

export class RuntimeItemActivity extends RuntimeItem {
	private _activityItems: ActivityItem[] = [];

	public get activityItems() {
		return this._activityItems;
	}

	constructor(id: string, activityItem: ActivityItem) {
		super(id);
		this.addActivityItem(activityItem);
	}

	public addActivityItem(activityItem: ActivityItem) {
		if (this._activityItems.length) {
			if (activityItem instanceof ActivityItemStream) {
				const lastActivityItem = this._activityItems[this._activityItems.length - 1];
				if (lastActivityItem instanceof ActivityItemStream) {
					if (isSameActivityItemStream(lastActivityItem, activityItem)) {
						const activityItemStream = lastActivityItem.addActivityItemStream(activityItem);
						if (!activityItemStream) {
							return;
						}

						activityItem = activityItemStream;
					}
				}
			} else if (activityItem instanceof ActivityItemInput && activityItem.state !== ActivityItemInputState.Provisional) {
				for (let i = this._activityItems.length - 1; i >= 0; --i) {
					const activityItemToCheck = this._activityItems[i];
					if (activityItemToCheck instanceof ActivityItemInput) {
						if (activityItemToCheck.state === ActivityItemInputState.Provisional &&
							activityItemToCheck.parentId === activityItem.parentId) {
							this._activityItems[i] = activityItem;
							return;
						}
						break;
					}
				}
			}
		}

		this._activityItems.push(activityItem);
	}

	public override getClipboardRepresentation(commentPrefix: string): string[] {
		return this._activityItems.flatMap(activityItem =>
			activityItem.getClipboardRepresentation(commentPrefix)
		);
	}

	public override optimizeScrollback(scrollbackSize: number) {
		if (scrollbackSize === 0) {
			this._isHidden = true;
			return 0;
		}

		this._isHidden = false;

		for (let i = this._activityItems.length - 1; i >= 0; i--) {
			scrollbackSize = this._activityItems[i].optimizeScrollback(scrollbackSize);
		}

		return scrollbackSize;
	}
}

export class RuntimeItemStarting extends RuntimeItemStandard {
	constructor(id: string, message: string, public attachMode: SessionAttachMode) {
		super(id, message);
	}
}

export class RuntimeItemStarted extends RuntimeItemStandard {
	constructor(id: string, message: string) {
		super(id, message);
	}
}

export class RuntimeItemExited extends RuntimeItemStandard {
	constructor(
		id: string,
		readonly reason: RuntimeExitReason,
		message: string
	) {
		super(id, message);
	}
}



export class RuntimeItemStartup extends RuntimeItemStandard {
	constructor(
		id: string,
		banner: string,
		readonly implementationVersion: string,
		readonly languageVersion: string
	) {
		super(id, banner);
	}
}

export class RuntimeItemOffline extends RuntimeItemStandard {
	constructor(id: string, message: string) {
		super(id, message);
	}
}

export class RuntimeItemReconnected extends RuntimeItemStandard {
	constructor(id: string, message: string) {
		super(id, message);
	}
}

export class RuntimeItemPendingInput extends RuntimeItemStandard {
	constructor(
		id: string,
		readonly inputPrompt: string,
		readonly attribution: IConsoleCodeAttribution,
		readonly executionId: string | undefined,
		readonly code: string
	) {
		super(id, code);
	}
}

export class RuntimeItemStartupFailure extends RuntimeItemStandard {
	constructor(
		id: string,
		readonly message: string,
		details: string,
	) {
		super(id, details);
	}
}

export class RuntimeItemRestartButton extends RuntimeItem {
	constructor(
		id: string,
		readonly languageName: string,
		readonly onRestartRequested: () => void
	) {
		super(id);
	}
}
