/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IBracketPairColorizationOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';

export interface IInteractiveSessionConfiguration {
	editor: {
		readonly fontSize: number;
		readonly fontFamily: string;
		readonly lineHeight: number;
		readonly fontWeight: string;
		readonly wordWrap: 'off' | 'on';
	};
}

export interface IInteractiveSessionEditorConfiguration {
	readonly foreground: Color | undefined;
	readonly inputEditor: IInteractiveSessionInputEditorOptions;
	readonly resultEditor: IInteractiveSessionResultEditorOptions;
}

export interface IInteractiveSessionInputEditorOptions {
	readonly backgroundColor: Color | undefined;
	readonly accessibilitySupport: string;
}

export interface IInteractiveSessionResultEditorOptions {
	readonly fontSize: number;
	readonly fontFamily: string | undefined;
	readonly lineHeight: number;
	readonly fontWeight: string;
	readonly backgroundColor: Color | undefined;
	readonly bracketPairColorization: IBracketPairColorizationOptions;
	readonly fontLigatures: boolean | string | undefined;
	readonly wordWrap: 'off' | 'on';

	// Bring these back if we make the editors editable
	// readonly cursorBlinking: string;
	// readonly accessibilitySupport: string;
}


export class InteractiveSessionEditorOptions extends Disposable {
	private static readonly lineHeightEm = 1.4;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _config!: IInteractiveSessionEditorConfiguration;
	public get configuration(): IInteractiveSessionEditorConfiguration {
		return this._config;
	}

	private static readonly relevantSettingIds = [
		'interactiveSession.editor.lineHeight',
		'interactiveSession.editor.fontSize',
		'interactiveSession.editor.fontFamily',
		'interactiveSession.editor.fontWeight',
		'interactiveSession.editor.wordWrap',
		'editor.cursorBlinking',
		'editor.fontLigatures',
		'editor.accessibilitySupport',
		'editor.bracketPairColorization.enabled',
		'editor.bracketPairColorization.independentColorPoolPerBracketType',
	];

	constructor(
		viewId: string | undefined,
		private readonly foreground: string,
		private readonly inputEditorBackgroundColor: string,
		private readonly resultEditorBackgroundColor: string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService
	) {
		super();

		this._register(this.themeService.onDidColorThemeChange(e => this.update()));
		this._register(this.viewDescriptorService.onDidChangeLocation(e => {
			if (e.views.some(v => v.id === viewId)) {
				this.update();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (InteractiveSessionEditorOptions.relevantSettingIds.some(id => e.affectsConfiguration(id))) {
				this.update();
			}
		}));
		this.update();
	}

	private update() {
		const editorConfig = this.configurationService.getValue<IEditorOptions>('editor');

		// TODO shouldn't the setting keys be more specific?
		const interactiveSessionEditorConfig = this.configurationService.getValue<IInteractiveSessionConfiguration>('interactiveSession').editor;
		const accessibilitySupport = this.configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');
		this._config = {
			foreground: this.themeService.getColorTheme().getColor(this.foreground),
			inputEditor: {
				backgroundColor: this.themeService.getColorTheme().getColor(this.inputEditorBackgroundColor),
				accessibilitySupport,
			},
			resultEditor: {
				backgroundColor: this.themeService.getColorTheme().getColor(this.resultEditorBackgroundColor),
				fontSize: interactiveSessionEditorConfig.fontSize,
				fontFamily: interactiveSessionEditorConfig.fontFamily === 'default' ? editorConfig.fontFamily : interactiveSessionEditorConfig.fontFamily,
				fontWeight: interactiveSessionEditorConfig.fontWeight,
				lineHeight: interactiveSessionEditorConfig.lineHeight ? interactiveSessionEditorConfig.lineHeight : InteractiveSessionEditorOptions.lineHeightEm * interactiveSessionEditorConfig.fontSize,
				bracketPairColorization: {
					enabled: this.configurationService.getValue<boolean>('editor.bracketPairColorization.enabled'),
					independentColorPoolPerBracketType: this.configurationService.getValue<boolean>('editor.bracketPairColorization.independentColorPoolPerBracketType'),
				},
				wordWrap: interactiveSessionEditorConfig.wordWrap,
				fontLigatures: editorConfig.fontLigatures,
			}

		};
		this._onDidChange.fire();
	}
}
