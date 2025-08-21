/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Emitter } from '../../../../../base/common/event.js';
import { formatOutputLinesForClipboard } from '../utils/clipboardUtils.js';
import { ANSIOutput, ANSIOutputLine } from '../../../../../base/common/ansiOutput.js';
import { ILanguageRuntimeMessageOutputData } from '../../../languageRuntime/common/languageRuntimeService.js';

export abstract class ActivityItemBase {
	private _isHidden = false;

	constructor(readonly id: string, readonly parentId: string, readonly when: Date) {
	}

	public get isHidden(): boolean {
		return this._isHidden;
	}

	public abstract getClipboardRepresentation(commentPrefix: string): string[];

	public optimizeScrollback(scrollbackSize: number): number {
		if (!scrollbackSize) {
			this._isHidden = true;
			return 0;
		}

		this._isHidden = false;
		return scrollbackSize - 1;
	}
}

export const enum ActivityItemInputState {
	Provisional = 'provisional',
	Executing = 'executing',
	Completed = 'completed',
	Cancelled = 'cancelled'
}

export class ActivityItemInput extends ActivityItemBase {
	private _state: ActivityItemInputState;
	private readonly _codeOutputLines: readonly ANSIOutputLine[] = [];
	private readonly _onStateChangedEmitter = new Emitter<void>();

	get state() {
		return this._state;
	}

	set state(state: ActivityItemInputState) {
		if (state !== this._state) {
			this._state = state;
			this._onStateChangedEmitter.fire();
		}
	}

	get codeOutputLines(): readonly ANSIOutputLine[] {
		return this._codeOutputLines;
	}

	public onStateChanged = this._onStateChangedEmitter.event;

	constructor(
		id: string,
		parentId: string,
		when: Date,
		state: ActivityItemInputState,
		readonly inputPrompt: string,
		readonly continuationPrompt: string,
		readonly code: string
	) {
		super(id, parentId, when);
		this._state = state;
		this._codeOutputLines = ANSIOutput.processOutput(code);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this._codeOutputLines);
	}
}

export const enum ActivityItemPromptState {
	Unanswered = 'Unanswered',
	Answered = 'Answered',
	Interrupted = 'Interrupted'
}

export class ActivityItemPrompt extends ActivityItemBase {
	readonly outputLines: readonly ANSIOutputLine[];
	state = ActivityItemPromptState.Unanswered;
	answer?: string = undefined;

	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly prompt: string,
		readonly password: boolean
	) {
		super(id, parentId, when);
		this.outputLines = ANSIOutput.processOutput(prompt);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this.outputLines, commentPrefix);
	}
}

export enum ActivityItemStreamType {
	OUTPUT = 'output',
	ERROR = 'error'
}

export class ActivityItemStream extends ActivityItemBase {
	private _terminated = false;
	private _activityItemStreams: ActivityItemStream[] = [];
	private _ansiOutput = new ANSIOutput();
	private _scrollbackSize?: number;

	get outputLines(): readonly ANSIOutputLine[] {
		this.processActivityItemStreams();

		if (this._scrollbackSize === undefined) {
			return this._ansiOutput.outputLines;
		}

		return this._ansiOutput.truncatedOutputLines(this._scrollbackSize);
	}

	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly type: ActivityItemStreamType,
		readonly text: string
	) {
		super(id, parentId, when);
		this._activityItemStreams.push(this);
	}

	public addActivityItemStream(activityItemStream: ActivityItemStream): ActivityItemStream | undefined {
		if (this._terminated) {
			activityItemStream._ansiOutput.copyStylesFrom(this._ansiOutput);
			return activityItemStream;
		}

		const newlineIndex = activityItemStream.text.lastIndexOf('\n');
		if (newlineIndex === -1) {
			this._activityItemStreams.push(activityItemStream);
			return undefined;
		}

		const textWithNewline = activityItemStream.text.substring(0, newlineIndex + 1);
		const remainderText = activityItemStream.text.substring(newlineIndex + 1);

		this._activityItemStreams.push(activityItemStream.clone(textWithNewline));

		this.processActivityItemStreams();

		this._terminated = !this._ansiOutput.isBuffering;

		if (!remainderText.length) {
			return undefined;
		}

		activityItemStream = activityItemStream.clone(remainderText);

		if (!this._terminated) {
			this._activityItemStreams.push(activityItemStream);
			return undefined;
		}

		activityItemStream._ansiOutput.copyStylesFrom(this._ansiOutput);
		return activityItemStream;
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this._ansiOutput.outputLines, commentPrefix);
	}

	public override optimizeScrollback(scrollbackSize: number) {
		this.processActivityItemStreams();

		if (this._ansiOutput.outputLines.length <= scrollbackSize) {
			this._scrollbackSize = undefined;
			return scrollbackSize - this._ansiOutput.outputLines.length;
		}

		this._scrollbackSize = scrollbackSize;
		return 0;
	}

	private clone(text: string) {
		return new ActivityItemStream(
			this.id,
			this.parentId,
			this.when,
			this.type,
			text
		);
	}

	private processActivityItemStreams() {
		if (!this._activityItemStreams.length) {
			return;
		}

		for (const activityItemStream of this._activityItemStreams) {
			this._ansiOutput.processOutput(activityItemStream.text);
		}

		this._activityItemStreams = [];
	}
}

export class ActivityItemOutputMessage extends ActivityItemBase {
	private readonly _outputLines: readonly ANSIOutputLine[];
	private _scrollbackSize?: number;

	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly data: ILanguageRuntimeMessageOutputData,
		readonly outputId?: string
	) {
		super(id, parentId, when);

		const output = data['text/plain'];
		this._outputLines = !output ? [] : ANSIOutput.processOutput(output);
	}

	get outputLines(): readonly ANSIOutputLine[] {
		if (this._scrollbackSize === undefined) {
			return this._outputLines;
		}

		return this._outputLines.slice(-this._scrollbackSize);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this._outputLines, commentPrefix);
	}

	public override optimizeScrollback(scrollbackSize: number) {
		if (this._outputLines.length <= scrollbackSize) {
			this._scrollbackSize = undefined;
			return scrollbackSize - this._outputLines.length;
		}

		this._scrollbackSize = scrollbackSize;
		return 0;
	}
}

export class ActivityItemOutputHtml extends ActivityItemBase {
	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly html: string,
		readonly text: string | undefined,
		readonly outputId?: string
	) {
		super(id, parentId, when);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		const erdosHTMLOutput = localize('erdosHTMLOutput', "[HTML output]");
		return [commentPrefix + (this.text ?? erdosHTMLOutput)];
	}
}

export class ActivityItemOutputPlot extends ActivityItemBase {
	private readonly _outputLines: readonly ANSIOutputLine[];
	private _scrollbackSize?: number;
	readonly plotUri: string;
	readonly mimeType: string;

	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly data: ILanguageRuntimeMessageOutputData,
		readonly onSelected: () => void,
		readonly outputId?: string,
	) {
		super(id, parentId, when);

		const output = data['text/plain'];

		const imageKey = Object.keys(data).find(key => key.startsWith('image/'));

		this.mimeType = imageKey!;
		if (this.mimeType === 'image/svg+xml') {
			const svgData = encodeURIComponent(data[this.mimeType]!);
			this.plotUri = `data:${this.mimeType};utf8,${svgData}`;
		} else {
			this.plotUri = `data:${this.mimeType};base64,${data[this.mimeType]!}`;
		}

		this._outputLines = !output ? [] : ANSIOutput.processOutput(output);
	}

	get outputLines(): readonly ANSIOutputLine[] {
		if (this._scrollbackSize === undefined) {
			return this._outputLines;
		}

		return this._outputLines.slice(-this._scrollbackSize);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return formatOutputLinesForClipboard(this._outputLines, commentPrefix);
	}

	public override optimizeScrollback(scrollbackSize: number) {
		if (this._outputLines.length <= scrollbackSize) {
			this._scrollbackSize = undefined;
			return scrollbackSize - this._outputLines.length;
		}

		this._scrollbackSize = scrollbackSize;
		return 0;
	}
}

export class ActivityItemErrorMessage extends ActivityItemBase {
	private _messageOutputLines: ANSIOutputLine[];
	private _tracebackOutputLines: ANSIOutputLine[];
	private _scrollbackSize?: number;

	constructor(
		id: string,
		parentId: string,
		when: Date,
		readonly name: string,
		readonly message: string,
		readonly traceback: string[]
	) {
		super(id, parentId, when);

		const detailedMessage = !name ? message : `\x1b[31m${name}\x1b[0m: ${message}`;

		this._messageOutputLines = ANSIOutput.processOutput(detailedMessage);
		this._tracebackOutputLines = !traceback.length ?
			[] :
			ANSIOutput.processOutput(traceback.join('\n'));
	}

	get messageOutputLines(): ANSIOutputLine[] {
		if (this._scrollbackSize === undefined) {
			return this._messageOutputLines;
		}

		const scrollbackSize = Math.max(0, this._scrollbackSize - this._tracebackOutputLines.length);

		if (!scrollbackSize) {
			return [];
		}

		if (this._messageOutputLines.length <= scrollbackSize) {
			return this._messageOutputLines;
		}

		return this._messageOutputLines.slice(-scrollbackSize);
	}

	get tracebackOutputLines(): ANSIOutputLine[] {
		if (this._scrollbackSize === undefined) {
			return this._tracebackOutputLines;
		}

		if (this._tracebackOutputLines.length <= this._scrollbackSize) {
			return this._tracebackOutputLines;
		}

		return this._tracebackOutputLines.slice(-this._scrollbackSize);
	}

	public getClipboardRepresentation(commentPrefix: string): string[] {
		return [
			...formatOutputLinesForClipboard(this._messageOutputLines, commentPrefix),
			...formatOutputLinesForClipboard(this._tracebackOutputLines, commentPrefix)
		];
	}

	public override optimizeScrollback(scrollbackSize: number) {
		const outputLines = this._messageOutputLines.length + this._tracebackOutputLines.length;

		if (outputLines <= scrollbackSize) {
			this._scrollbackSize = undefined;
			return scrollbackSize - outputLines;
		}

		this._scrollbackSize = scrollbackSize;
		return 0;
	}
}

export type ActivityItemOutput =
	ActivityItemOutputHtml |
	ActivityItemOutputMessage |
	ActivityItemOutputPlot;

export type ActivityItem =
	ActivityItemStream |
	ActivityItemErrorMessage |
	ActivityItemInput |
	ActivityItemOutput |
	ActivityItemPrompt;
