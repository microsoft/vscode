/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class MarkdownPreviewConfiguration {
	public static getForResource(resource: vscode.Uri) {
		return new MarkdownPreviewConfiguration(resource);
	}

	public readonly scrollBeyondLastLine: boolean;
	public readonly wordWrap: boolean;
	public readonly breaks: boolean;
	public readonly linkify: boolean;
	public readonly doubleClickToSwitchToEditor: boolean;
	public readonly scrollEditorWithPreview: boolean;
	public readonly scrollPreviewWithEditor: boolean;
	public readonly markEditorSelection: boolean;

	public readonly lineHeight: number;
	public readonly fontSize: number;
	public readonly fontFamily: string | undefined;
	public readonly styles: string[];
	public readonly zoomLevel: number;

	private constructor(resource: vscode.Uri) {
		const windowConfig = vscode.workspace.getConfiguration('window', resource);
		const editorConfig = vscode.workspace.getConfiguration('editor', resource);
		const markdownConfig = vscode.workspace.getConfiguration('markdown', resource);
		const markdownEditorConfig = vscode.workspace.getConfiguration('[markdown]', resource);

		this.scrollBeyondLastLine = editorConfig.get<boolean>('scrollBeyondLastLine', false);

		this.wordWrap = editorConfig.get<string>('wordWrap', 'off') !== 'off';
		if (markdownEditorConfig && markdownEditorConfig['editor.wordWrap']) {
			this.wordWrap = markdownEditorConfig['editor.wordWrap'] !== 'off';
		}

		this.zoomLevel = windowConfig.get<number>('zoomLevel', 0);

		this.scrollPreviewWithEditor = !!markdownConfig.get<boolean>('preview.scrollPreviewWithEditor', true);
		this.scrollEditorWithPreview = !!markdownConfig.get<boolean>('preview.scrollEditorWithPreview', true);
		this.breaks = !!markdownConfig.get<boolean>('preview.breaks', false);
		this.linkify = !!markdownConfig.get<boolean>('preview.linkify', false);
		this.doubleClickToSwitchToEditor = !!markdownConfig.get<boolean>('preview.doubleClickToSwitchToEditor', true);
		this.markEditorSelection = !!markdownConfig.get<boolean>('preview.markEditorSelection', true);

		this.fontFamily = markdownConfig.get<string | undefined>('preview.fontFamily', undefined);
		this.fontSize = Math.max(8, +markdownConfig.get<number>('preview.fontSize', NaN));
		this.lineHeight = Math.max(0.6, +markdownConfig.get<number>('preview.lineHeight', NaN));

		this.styles = markdownConfig.get<string[]>('styles', []);

		const markdownItPluginsConfigurations = vscode.extensions.all
			.filter(this._isMarkdownItPlugin)
			.map(this._getExtensionConfigurationProperties)
			.reduce((accConfig, config) => [...accConfig, ...config], []);

		markdownItPluginsConfigurations.forEach(configProperty => {
			const section = configProperty.split('.')[0];
			const configuration = configProperty.split('.').slice(1).join('.');

			this[configProperty] = vscode.workspace.getConfiguration(section, resource).get(configuration);
		});

	}

	public isEqualTo(otherConfig: MarkdownPreviewConfiguration) {
		for (let key in this) {
			if (this.hasOwnProperty(key) && key !== 'styles') {
				if (this[key] !== otherConfig[key]) {
					return false;
				}
			}
		}

		// Check styles
		if (this.styles.length !== otherConfig.styles.length) {
			return false;
		}
		for (let i = 0; i < this.styles.length; ++i) {
			if (this.styles[i] !== otherConfig.styles[i]) {
				return false;
			}
		}

		return true;
	}

	private _isMarkdownItPlugin(extension: vscode.Extension<any>): boolean {
		const contributes = extension.packageJSON.contributes;
		return contributes && contributes['markdown.markdownItPlugins'];
	}

	private _getExtensionConfigurationProperties(extension: vscode.Extension<any>): string[] {
		const configuration = extension.packageJSON.contributes.configuration;
		return configuration && configuration.properties ? Object.keys(configuration.properties) : [];
	}

	[key: string]: any;
}

export class MarkdownPreviewConfigurationManager {
	private readonly previewConfigurationsForWorkspaces = new Map<string, MarkdownPreviewConfiguration>();

	public loadAndCacheConfiguration(
		resource: vscode.Uri
	): MarkdownPreviewConfiguration {
		const config = MarkdownPreviewConfiguration.getForResource(resource);
		this.previewConfigurationsForWorkspaces.set(this.getKey(resource), config);
		return config;
	}

	public hasConfigurationChanged(
		resource: vscode.Uri
	): boolean {
		const key = this.getKey(resource);
		const currentConfig = this.previewConfigurationsForWorkspaces.get(key);
		const newConfig = MarkdownPreviewConfiguration.getForResource(resource);
		return (!currentConfig || !currentConfig.isEqualTo(newConfig));
	}

	private getKey(
		resource: vscode.Uri
	): string {
		const folder = vscode.workspace.getWorkspaceFolder(resource);
		return folder ? folder.uri.toString() : '';
	}
}
