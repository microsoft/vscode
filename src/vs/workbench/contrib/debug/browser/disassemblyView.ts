/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPixelRatio, getZoomLevel } from 'vs/base/browser/browser';
import { Dimension, append, $ } from 'vs/base/browser/dom';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { DISASSEMBLY_VIEW_ID, IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import * as icons from 'vs/workbench/contrib/debug/browser/debugIcons';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';

interface IDisassembledInstructionEntry {
	allowBreakpoint: boolean;
	isBreakpointSet: boolean;
	instruction: DebugProtocol.DisassembledInstruction;
}

export class DisassemblyView extends EditorPane {

	private static readonly NUM_INSTRUCTIONS_TO_LOAD = 50;

	// Used in instruction renderer
	fontInfo: BareFontInfo;
	currentInstructionAddress: string = '';

	private _disassembledInstructions: WorkbenchTable<IDisassembledInstructionEntry> | undefined;
	private _debugService: IDebugService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IDebugService debugService: IDebugService
	) {
		super(DISASSEMBLY_VIEW_ID, telemetryService, themeService, storageService);
		this._debugService = debugService;

		this.fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this.fontInfo = BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel(), getPixelRatio());
				this._disassembledInstructions?.rerender();
			}
		}));

		this._disassembledInstructions = undefined;
	}

	protected createEditor(parent: HTMLElement): void {
		const lineHeight = this.fontInfo.lineHeight;
		const delegate = new class implements ITableVirtualDelegate<IDisassembledInstructionEntry>{
			headerRowHeight: number = 0; // No header
			getHeight(row: IDisassembledInstructionEntry): number {
				return lineHeight;
			}
		};

		this._register(this._debugService.getViewModel().onDidFocusStackFrame((stackFrame) => {
			this.currentInstructionAddress = stackFrame.stackFrame?.instructionPointerReference!;

			// TODO: rerender the marker
		}));

		this._disassembledInstructions = this._register(this._instantiationService.createInstance(WorkbenchTable,
			'DisassemblyView', parent, delegate,
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: this.fontInfo.lineHeight,
					maximumWidth: this.fontInfo.lineHeight,
					templateId: BreakpointRenderer.TEMPLATE_ID,
					project(row: IDisassembledInstructionEntry): IDisassembledInstructionEntry { return row; }
				},
				{
					label: 'instructions',
					tooltip: '',
					weight: 0.3,
					templateId: InstructionRenderer.TEMPLATE_ID,
					project(row: IDisassembledInstructionEntry): IDisassembledInstructionEntry { return row; }
				},
			],
			[
				this._instantiationService.createInstance(BreakpointRenderer, this),
				this._instantiationService.createInstance(InstructionRenderer, this),
			],
			{
				identityProvider: { getId: (e: IDisassembledInstructionEntry) => e.instruction.address },
				horizontalScrolling: false,
				overrideStyles: {
					listBackground: editorBackground
				},
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
				accessibilityProvider: new AccessibilityProvider()
			}
		)) as WorkbenchTable<IDisassembledInstructionEntry>;

		this.loadDisassembledInstructions(undefined, -DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD, DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD * 2).then(() => {
			// on load, set the target instruction in the middle of the page.
			if (this._disassembledInstructions!.length > 0) {
				this._disassembledInstructions?.reveal(Math.floor(this._disassembledInstructions!.length / 2), 0.5);
			}
		});

		this._register(this._disassembledInstructions.onDidScroll(e => {
			if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
				const topElement = Math.floor(e.scrollTop / this.fontInfo.lineHeight) + DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD;
				this.scrollUp_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD).then((success) => {
					if (success) {
						this._disassembledInstructions!.reveal(topElement, 0);
					}
				});
			} else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
				this.scrollDown_LoadDisassembledInstructions(DisassemblyView.NUM_INSTRUCTIONS_TO_LOAD);
			}
		}));
	}

	layout(dimension: Dimension): void {
		if (this._disassembledInstructions) {
			this._disassembledInstructions.layout(dimension.height);
		}
	}

	private async scrollUp_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
		const address: string | undefined = this._disassembledInstructions?.row(0).instruction.address;
		return this.loadDisassembledInstructions(address, -instructionCount, instructionCount - 1);
	}

	private async scrollDown_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
		const address: string | undefined = this._disassembledInstructions?.row(this._disassembledInstructions?.length - 1).instruction.address;
		return this.loadDisassembledInstructions(address, 1, instructionCount);
	}

	private async loadDisassembledInstructions(address: string | undefined, instructionOffset: number, instructionCount: number): Promise<boolean> {
		// if address is null, then use current stackframe.
		if (!address) {
			const frame = this._debugService.getViewModel().focusedStackFrame;
			if (frame?.instructionPointerReference) {
				address = frame.instructionPointerReference;
				this.currentInstructionAddress = address;
			}
		}

		const session = this._debugService.getViewModel().focusedSession;
		const resultEntries = await session?.disassemble(address!, 0, instructionOffset, instructionCount);
		if (session && resultEntries && this._disassembledInstructions) {
			const newEntries: IDisassembledInstructionEntry[] = [];

			for (let i = 0; i < resultEntries.length; i++) {
				newEntries.push({ allowBreakpoint: true, isBreakpointSet: false, instruction: resultEntries[i] });
			}

			// request is either at the start or end
			if (instructionOffset >= 0) {
				this._disassembledInstructions.splice(this._disassembledInstructions.length, 0, newEntries);
			}
			else {
				this._disassembledInstructions.splice(0, 0, newEntries);
			}

			return true;
		}

		return false;
	}

}

interface IBreakpointColumnTemplateData {
	container: HTMLElement,
	icon: HTMLElement
}

class BreakpointRenderer implements ITableRenderer<IDisassembledInstructionEntry, IBreakpointColumnTemplateData> {

	static readonly TEMPLATE_ID = 'breakpoint';
	private breakpointIcon = 'codicon-' + icons.breakpoint.regular.id;
	private breakpointHintIcon = 'codicon-' + icons.debugBreakpointHint.id;
	// private debugStackframe = 'codicon-' + icons.debugStackframe.id;
	private debugStackframeFocused = 'codicon-' + icons.debugStackframeFocused.id;

	templateId: string = BreakpointRenderer.TEMPLATE_ID;

	constructor(private readonly disassemblyView: DisassemblyView,
		@IDebugService private readonly debugService: IDebugService) {
	}

	renderTemplate(container: HTMLElement): IBreakpointColumnTemplateData {
		const icon = append(container, $('.disassembly-view'));
		icon.classList.add('codicon');

		icon.style.display = 'flex';
		icon.style.alignItems = 'center';
		icon.style.justifyContent = 'center';

		return { container, icon };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IBreakpointColumnTemplateData, height: number | undefined): void {
		if (element.instruction.address === this.disassemblyView.currentInstructionAddress) {
			templateData.icon.classList.add(this.debugStackframeFocused);
		}
		else {
			templateData.icon.classList.remove(this.debugStackframeFocused);
		}

		// TODO: see getBreakpointMessageAndIcon in vs\workbench\contrib\debug\browser\breakpointEditorContribution.ts
		//       for more types of breakpoint icons
		if (element.allowBreakpoint) {
			if (element.isBreakpointSet) {
				templateData.icon.classList.add(this.breakpointIcon);
			}
			else {
				templateData.icon.classList.remove(this.breakpointIcon);
			}


			templateData.container.onmouseover = () => {
				templateData.icon.classList.add(this.breakpointHintIcon);
			};

			templateData.container.onmouseout = () => {
				templateData.icon.classList.remove(this.breakpointHintIcon);
			};

			templateData.container.onclick = () => {
				if (element.isBreakpointSet) {
					this.debugService.removeInstructionBreakpoints(element.instruction.address).then(() => {
						element.isBreakpointSet = false;
						templateData.icon.classList.remove(this.breakpointIcon);
					});

				} else if (element.allowBreakpoint && !element.isBreakpointSet) {
					this.debugService.addInstructionBreakpoint(element.instruction.address, 0).then(() => {
						element.isBreakpointSet = true;
						templateData.icon.classList.add(this.breakpointIcon);
					});
				}
			};
		}
	}

	disposeTemplate(templateData: IBreakpointColumnTemplateData): void {
		templateData.container.onclick = null;
		templateData.container.onmouseover = null;
		templateData.container.onmouseout = null;
	}

}

interface IInstructionColumnTemplateData {
	// TODO: hover widget?
	instruction: HTMLElement;
}

class InstructionRenderer implements ITableRenderer<IDisassembledInstructionEntry, IInstructionColumnTemplateData> {

	private static readonly INSTRUCTION_ADDR_MIN_LENGTH = 25;
	private static readonly INSTRUCTION_BYTES_MIN_LENGTH = 30;

	static readonly TEMPLATE_ID = 'instruction';

	templateId: string = InstructionRenderer.TEMPLATE_ID;

	constructor(private readonly disassemblyView: DisassemblyView) {
	}

	renderTemplate(container: HTMLElement): IInstructionColumnTemplateData {
		const instruction = append(container, $('.instruction'));
		this.applyFontInfo(instruction);
		return { instruction };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IInstructionColumnTemplateData, height: number | undefined): void {
		const instruction = element.instruction;
		const sb = createStringBuilder(10000);

		sb.appendASCIIString(instruction.address);
		let spacesToAppend = 10;
		if (instruction.address.length < InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH) {
			spacesToAppend = InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH - instruction.address.length;
		}
		for (let i = 0; i < spacesToAppend; i++) {
			sb.appendASCII(0x00A0);
		}

		if (instruction.instructionBytes) {
			sb.appendASCIIString(instruction.instructionBytes);
			spacesToAppend = 10;
			if (instruction.instructionBytes.length < InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH) {
				spacesToAppend = InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH - instruction.instructionBytes.length;
			}
			for (let i = 0; i < spacesToAppend; i++) {
				sb.appendASCII(0x00A0);
			}
		}

		sb.appendASCIIString(instruction.instruction);

		const innerText = sb.build();
		templateData.instruction.innerText = innerText;
	}

	disposeTemplate(templateData: IInstructionColumnTemplateData): void { }

	private applyFontInfo(element: HTMLElement) {
		const fontInfo = this.disassemblyView.fontInfo;
		element.style.fontFamily = fontInfo.getMassagedFontFamily();
		element.style.fontWeight = fontInfo.fontWeight;
		element.style.fontSize = fontInfo.fontSize + 'px';
		element.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
		element.style.letterSpacing = fontInfo.letterSpacing + 'px';
	}

}

export class DisassemblyViewInput extends EditorInput {

	static readonly ID = 'debug.disassemblyView.input';

	override get typeId(): string {
		return DisassemblyViewInput.ID;
	}

	static _instance: DisassemblyViewInput;
	static get instance() {
		if (!DisassemblyViewInput._instance || DisassemblyViewInput._instance.isDisposed()) {
			DisassemblyViewInput._instance = new DisassemblyViewInput();
		}

		return DisassemblyViewInput._instance;
	}

	readonly resource = undefined;

	override getName(): string {
		return localize('disassemblyInputName', "Disassembly");
	}

	override matches(other: unknown): boolean {
		return other instanceof DisassemblyViewInput;
	}

}

class AccessibilityProvider implements IListAccessibilityProvider<IDisassembledInstructionEntry> {

	getWidgetAriaLabel(): string {
		return localize('disassemblyView', "Disassembly View");
	}

	getAriaLabel(element: IDisassembledInstructionEntry): string | null {
		let label = '';

		if (element.isBreakpointSet) {
			label += localize('breakpointIsSet', "Breakpoint is set");
		} else if (element.allowBreakpoint) {
			label += localize('breakpointAllowed', "Can set breakpoint");
		}

		const instruction = element.instruction;
		label += `, ${localize('instructionAddress', "Instruction address")}: ${instruction.address}`;
		if (instruction.instructionBytes) {
			label += `, ${localize('instructionBytes', "Instruction bytes")}: ${instruction.instructionBytes}`;
		}
		label += `, ${localize(`instructionText`, "Instruction")}: ${instruction.instruction}`;

		return label;
	}

}
