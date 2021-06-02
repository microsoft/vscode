/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, append, $ } from 'vs/base/browser/dom';
import { ITableRenderer, ITableVirtualDelegate } from 'vs/base/browser/ui/table/table';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTable } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { EditorInput } from 'vs/workbench/common/editor';
import { DISASSEMBLY_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';

interface IDisassembledInstructionEntry {
	allowBreakpoint: boolean;
	isBreakpointSet: boolean;
	instruction: DebugProtocol.DisassembledInstruction;
}

export class DisassemblyView extends EditorPane {

	private _editorOptions: IEditorOptions;
	private _disassembledInstructions: WorkbenchTable<IDisassembledInstructionEntry> | null;


	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(DISASSEMBLY_VIEW_ID, telemetryService, themeService, storageService);

		this._editorOptions = configurationService.getValue<IEditorOptions>('editor');
		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this._editorOptions = configurationService.getValue<IEditorOptions>('editor');
				// TODO: refresh view
			}
		});

		this._disassembledInstructions = null;
	}

	protected createEditor(parent: HTMLElement): void {
		const lineHeight = this._editorOptions.lineHeight!;
		const delegate = new class implements ITableVirtualDelegate<IDisassembledInstructionEntry>{
			headerRowHeight: number = 0; // No header
			getHeight(row: IDisassembledInstructionEntry): number {
				return lineHeight;
			}
		};

		this._disassembledInstructions = this._register(this._instantiationService.createInstance(WorkbenchTable,
			'DisassemblyView', parent, delegate,
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 40,
					maximumWidth: 40,
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
				this._instantiationService.createInstance(BreakpointRenderer),
				this._instantiationService.createInstance(InstructionRenderer),
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
			}
		)) as WorkbenchTable<IDisassembledInstructionEntry>;

		this.loadDisassembledInstructions('0x00005000');
	}

	layout(dimension: Dimension): void {
		if (this._disassembledInstructions) {
			this._disassembledInstructions.layout(dimension.height);
		}
	}

	private loadDisassembledInstructions(address: string): void {
		const newEntries: IDisassembledInstructionEntry[] = [];
		for (let i = 0; i < 50; i++) {
			newEntries.push({ allowBreakpoint: true, isBreakpointSet: false, instruction: { address, instruction: 'instruction instruction, instruction' } });
		}
		if (this._disassembledInstructions) {
			// TODO: append/insert
			this._disassembledInstructions.splice(0, this._disassembledInstructions.length, newEntries);
		}
	}

}

interface IBreakpointColumnTemplateData {
	icon: HTMLImageElement
}

class BreakpointRenderer implements ITableRenderer<IDisassembledInstructionEntry, IBreakpointColumnTemplateData> {

	static readonly TEMPLATE_ID = 'breakpoint';

	templateId: string = BreakpointRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IBreakpointColumnTemplateData {
		const icon = append(container, $<HTMLImageElement>('img.icon'));
		return { icon };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IBreakpointColumnTemplateData, height: number | undefined): void {
		if (element.isBreakpointSet) {
			// TODO: breakpoint icon
		}
	}
	disposeTemplate(templateData: IBreakpointColumnTemplateData): void { }

}

interface IInstructionColumnTemplateData {
	// TODO: hover widget?
	instruction: HTMLElement;
}

class InstructionRenderer implements ITableRenderer<IDisassembledInstructionEntry, IInstructionColumnTemplateData> {

	static readonly TEMPLATE_ID = 'instruction';

	templateId: string = InstructionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IInstructionColumnTemplateData {
		const instruction = append(container, $('instruction'));
		return { instruction };
	}

	renderElement(element: IDisassembledInstructionEntry, index: number, templateData: IInstructionColumnTemplateData, height: number | undefined): void {
		const instruction = element.instruction;
		templateData.instruction.innerText = `${instruction.address}\t${instruction.instructionBytes}\t${instruction.instruction}`;
	}

	disposeTemplate(templateData: IInstructionColumnTemplateData): void { }

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
		return localize('extensionsInputName', "Running Extensions");
	}

	override canSplit(): boolean {
		return false;
	}

	override matches(other: unknown): boolean {
		return other instanceof DisassemblyViewInput;
	}
}
