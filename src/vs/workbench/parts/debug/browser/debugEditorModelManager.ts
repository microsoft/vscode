/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import * as lifecycle from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { IModel, TrackedRangeStickiness, IRange, IModelDeltaDecoration, IModelDecorationsChangedEvent, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDebugService, IBreakpoint, IRawBreakpoint, State } from 'vs/workbench/parts/debug/common/debug';
import { IModelService } from 'vs/editor/common/services/modelService';

interface IDebugEditorModelData {
	model: IModel;
	toDispose: lifecycle.IDisposable[];
	breakpointDecorationIds: string[];
	breakpointLines: number[];
	breakpointDecorationsAsMap: { [decorationId: string]: boolean; };
	currentStackDecorations: string[];
	topStackFrameRange: IRange;
	dirty: boolean;
}

const stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

export class DebugEditorModelManager implements IWorkbenchContribution {
	static ID = 'breakpointManager';

	private modelData: {
		[modelUrl: string]: IDebugEditorModelData;
	};
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IModelService private modelService: IModelService,
		@IDebugService private debugService: IDebugService
	) {
		this.modelData = Object.create(null);
		this.toDispose = [];
		this.registerListeners();
	}

	public getId(): string {
		return DebugEditorModelManager.ID;
	}

	public dispose(): void {
		Object.keys(this.modelData).forEach(modelUriStr => {
			lifecycle.dispose(this.modelData[modelUriStr].toDispose);
			this.modelData[modelUriStr].model.deltaDecorations(this.modelData[modelUriStr].breakpointDecorationIds, []);
			this.modelData[modelUriStr].model.deltaDecorations(this.modelData[modelUriStr].currentStackDecorations, []);
		});
		this.toDispose = lifecycle.dispose(this.toDispose);

		this.modelData = null;
	}

	private registerListeners(): void {
		this.toDispose.push(this.modelService.onModelAdded(this.onModelAdded, this));
		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this.toDispose.push(this.modelService.onModelRemoved(this.onModelRemoved, this));

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() => this.onFocusStackFrame()));
		this.toDispose.push(this.debugService.onDidChangeState(() => {
			if (this.debugService.state === State.Inactive) {
				Object.keys(this.modelData).forEach(key => this.modelData[key].dirty = false);
			}
		}));
	}

	private onModelAdded(model: IModel): void {
		const modelUrlStr = model.uri.toString();
		const breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr);

		const currentStackDecorations = model.deltaDecorations([], this.createCallStackDecorations(modelUrlStr));
		const breakPointDecorations = model.deltaDecorations([], this.createBreakpointDecorations(breakpoints));

		const toDispose: lifecycle.IDisposable[] = [model.onDidChangeDecorations((e) => this.onModelDecorationsChanged(modelUrlStr, e))];

		this.modelData[modelUrlStr] = {
			model: model,
			toDispose: toDispose,
			breakpointDecorationIds: breakPointDecorations,
			breakpointLines: breakpoints.map(bp => bp.lineNumber),
			breakpointDecorationsAsMap: objects.toObject(breakPointDecorations, key => key, key => true),
			currentStackDecorations: currentStackDecorations,
			topStackFrameRange: null,
			dirty: false
		};
	}

	private onModelRemoved(model: IModel): void {
		const modelUriStr = model.uri.toString();
		if (this.modelData[modelUriStr]) {
			lifecycle.dispose(this.modelData[modelUriStr].toDispose);
			delete this.modelData[modelUriStr];
		}
	}

	// call stack management. Represent data coming from the debug service.

	private onFocusStackFrame(): void {
		Object.keys(this.modelData).forEach(modelUrlStr => {
			const modelData = this.modelData[modelUrlStr];
			modelData.currentStackDecorations = modelData.model.deltaDecorations(modelData.currentStackDecorations, this.createCallStackDecorations(modelUrlStr));
		});
	}

	private createCallStackDecorations(modelUrlStr: string): IModelDeltaDecoration[] {
		const result: IModelDeltaDecoration[] = [];
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		if (!stackFrame || stackFrame.source.uri.toString() !== modelUrlStr) {
			return result;
		}

		// only show decorations for the currently focussed thread.
		const wholeLineRange = new Range(stackFrame.lineNumber, stackFrame.column, stackFrame.lineNumber, Number.MAX_VALUE);
		const range = new Range(stackFrame.lineNumber, stackFrame.column, stackFrame.lineNumber, stackFrame.column + 1);

		// compute how to decorate the editor. Different decorations are used if this is a top stack frame, focussed stack frame,
		// an exception or a stack frame that did not change the line number (we only decorate the columns, not the whole line).
		if (stackFrame === stackFrame.thread.getCallStack()[0]) {
			result.push({
				options: DebugEditorModelManager.TOP_STACK_FRAME_MARGIN,
				range
			});

			if (stackFrame.thread.stoppedDetails && stackFrame.thread.stoppedDetails.reason === 'exception') {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_EXCEPTION_DECORATION,
					range: wholeLineRange
				});
			} else {
				result.push({
					options: DebugEditorModelManager.TOP_STACK_FRAME_DECORATION,
					range: wholeLineRange
				});

				if (this.modelData[modelUrlStr]) {
					if (this.modelData[modelUrlStr].topStackFrameRange && this.modelData[modelUrlStr].topStackFrameRange.startLineNumber === wholeLineRange.startLineNumber &&
						this.modelData[modelUrlStr].topStackFrameRange.startColumn !== wholeLineRange.startColumn) {
						result.push({
							options: DebugEditorModelManager.TOP_STACK_FRAME_COLUMN_DECORATION,
							range: wholeLineRange
						});
					}
					this.modelData[modelUrlStr].topStackFrameRange = wholeLineRange;
				}
			}
		} else {
			result.push({
				options: DebugEditorModelManager.FOCUSED_STACK_FRAME_MARGIN,
				range
			});

			result.push({
				options: DebugEditorModelManager.FOCUSED_STACK_FRAME_DECORATION,
				range: wholeLineRange
			});
		}

		return result;
	}

	// breakpoints management. Represent data coming from the debug service and also send data back.
	private onModelDecorationsChanged(modelUrlStr: string, e: IModelDecorationsChangedEvent): void {
		const modelData = this.modelData[modelUrlStr];
		let myDecorationsCount = Object.keys(modelData.breakpointDecorationsAsMap).length;
		if (myDecorationsCount === 0) {
			// I have no decorations
			return;
		}
		if (!e.changedDecorations.some(decorationId => modelData.breakpointDecorationsAsMap[decorationId])) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data: IRawBreakpoint[] = [];

		const lineToBreakpointDataMap: { [key: number]: IBreakpoint } = {};
		this.debugService.getModel().getBreakpoints().filter(bp => bp.uri.toString() === modelUrlStr).forEach(bp => {
			lineToBreakpointDataMap[bp.lineNumber] = bp;
		});

		const modelUri = modelData.model.uri;
		for (let i = 0, len = modelData.breakpointDecorationIds.length; i < len; i++) {
			const decorationRange = modelData.model.getDecorationRange(modelData.breakpointDecorationIds[i]);
			const lineNumber = modelData.breakpointLines[i];
			// check if the line got deleted.
			if (decorationRange.endColumn - decorationRange.startColumn > 0) {
				// since we know it is collapsed, it cannot grow to multiple lines
				data.push({
					lineNumber: decorationRange.startLineNumber,
					enabled: lineToBreakpointDataMap[lineNumber].enabled,
					condition: lineToBreakpointDataMap[lineNumber].condition,
					hitCondition: lineToBreakpointDataMap[lineNumber].hitCondition,
					column: lineToBreakpointDataMap[lineNumber].column
				});
			}
		}
		modelData.dirty = this.debugService.state !== State.Inactive && this.debugService.state !== State.Disabled;

		const toRemove = this.debugService.getModel().getBreakpoints()
			.filter(bp => bp.uri.toString() === modelUri.toString());

		TPromise.join(toRemove.map(bp => this.debugService.removeBreakpoints(bp.getId()))).then(() => {
			this.debugService.addBreakpoints(modelUri, data);
		});
	}

	private onBreakpointsChange(): void {
		const breakpointsMap: { [key: string]: IBreakpoint[] } = Object.create(null);
		this.debugService.getModel().getBreakpoints().forEach(bp => {
			const uriStr = bp.uri.toString();
			if (breakpointsMap[uriStr]) {
				breakpointsMap[uriStr].push(bp);
			} else {
				breakpointsMap[uriStr] = [bp];
			}
		});

		Object.keys(breakpointsMap).forEach(modelUriStr => {
			if (this.modelData[modelUriStr]) {
				this.updateBreakpoints(this.modelData[modelUriStr], breakpointsMap[modelUriStr]);
			}
		});
		Object.keys(this.modelData).forEach(modelUriStr => {
			if (!breakpointsMap[modelUriStr]) {
				this.updateBreakpoints(this.modelData[modelUriStr], []);
			}
		});
	}

	private updateBreakpoints(modelData: IDebugEditorModelData, newBreakpoints: IBreakpoint[]): void {
		modelData.breakpointDecorationIds = modelData.model.deltaDecorations(modelData.breakpointDecorationIds, this.createBreakpointDecorations(newBreakpoints));
		modelData.breakpointDecorationsAsMap = objects.toObject(modelData.breakpointDecorationIds, key => key, (key) => true);
		modelData.breakpointLines = newBreakpoints.map(bp => bp.lineNumber);
	}

	private createBreakpointDecorations(breakpoints: IBreakpoint[]): IModelDeltaDecoration[] {
		return breakpoints.map((breakpoint) => {
			return {
				options: this.getBreakpointDecorationOptions(breakpoint),
				range: new Range(breakpoint.lineNumber, 1, breakpoint.lineNumber, Number.MAX_VALUE)
			};
		});
	}

	private getBreakpointDecorationOptions(breakpoint: IBreakpoint): IModelDecorationOptions {
		const activated = this.debugService.getModel().areBreakpointsActivated();
		const state = this.debugService.state;
		const debugActive = state === State.Running || state === State.Stopped || state === State.Initializing;
		const modelData = this.modelData[breakpoint.uri.toString()];

		let result = (!breakpoint.enabled || !activated) ? DebugEditorModelManager.BREAKPOINT_DISABLED_DECORATION :
			debugActive && modelData && modelData.dirty && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_DIRTY_DECORATION :
				debugActive && !breakpoint.verified ? DebugEditorModelManager.BREAKPOINT_UNVERIFIED_DECORATION :
					!breakpoint.condition && !breakpoint.hitCondition ? DebugEditorModelManager.BREAKPOINT_DECORATION : null;

		if (result && breakpoint.message) {
			result = objects.clone(result);
			result.glyphMarginHoverMessage = breakpoint.message;
		}

		if (result) {
			return result;
		}

		const process = this.debugService.getViewModel().focusedProcess;
		if (process && !process.session.configuration.capabilities.supportsConditionalBreakpoints) {
			return DebugEditorModelManager.BREAKPOINT_UNSUPPORTED_DECORATION;
		}

		const mode = modelData ? modelData.model.getMode() : null;
		const modeId = mode ? mode.getId() : '';
		let condition: string;
		if (breakpoint.condition && breakpoint.hitCondition) {
			condition = `Expression: ${breakpoint.condition}\nHitCount: ${breakpoint.hitCondition}`;
		} else {
			condition = breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition;
		}
		const glyphMarginHoverMessage = `\`\`\`${modeId}\n${condition}\`\`\``;

		return {
			glyphMarginClassName: 'debug-breakpoint-conditional-glyph',
			glyphMarginHoverMessage,
			stickiness
		};
	}

	// editor decorations

	private static BREAKPOINT_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointHover', "Breakpoint"),
		stickiness
	};

	private static BREAKPOINT_DISABLED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-disabled-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDisabledHover', "Disabled Breakpoint"),
		stickiness
	};

	private static BREAKPOINT_UNVERIFIED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnverifieddHover', "Unverified Breakpoint"),
		stickiness
	};

	private static BREAKPOINT_DIRTY_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unverified-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session."),
		stickiness
	};

	private static BREAKPOINT_UNSUPPORTED_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-unsupported-glyph',
		glyphMarginHoverMessage: nls.localize('breakpointUnsupported', "Conditional breakpoints not supported by this debug type"),
		stickiness
	};

	// we need a separate decoration for glyph margin, since we do not want it on each line of a multi line statement.
	private static TOP_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-top-stack-frame-glyph',
		stickiness
	};

	private static FOCUSED_STACK_FRAME_MARGIN: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-focused-stack-frame-glyph',
		stickiness
	};

	private static TOP_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-line',
		stickiness
	};

	private static TOP_STACK_FRAME_EXCEPTION_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-top-stack-frame-exception-line',
		stickiness
	};

	private static TOP_STACK_FRAME_COLUMN_DECORATION: IModelDecorationOptions = {
		isWholeLine: false,
		className: 'debug-top-stack-frame-column',
		stickiness
	};

	private static FOCUSED_STACK_FRAME_DECORATION: IModelDecorationOptions = {
		isWholeLine: true,
		className: 'debug-focused-stack-frame-line',
		stickiness
	};
}
