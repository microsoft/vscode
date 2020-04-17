/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/platform/registry/common/platform';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { RunOnceScheduler } from 'vs/base/common/async';

//  ------ API types


// color registry
export const Extensions = {
	IconContribution: 'base.contributions.icons'
};

export interface IconDefaults {
	fontId?: string;
	character: string;
}

export interface IconContribution {
	id: string;
	description: string;
	deprecationMessage?: string;
	defaults: IconDefaults;
}

export interface IIconRegistry {

	readonly onDidChangeSchema: Event<void>;

	/**
	 * Register a icon to the registry.
	 * @param id The icon id
	 * @param defaults The default values
	 * @description the description
	 */
	registerIcon(id: string, defaults: IconDefaults, description: string): ThemeIcon;

	/**
	 * Register a icon to the registry.
	 */
	deregisterIcon(id: string): void;

	/**
	 * Get all icon contributions
	 */
	getIcons(): IconContribution[];

	/**
	 * JSON schema for an object to assign icon values to one of the color contributions.
	 */
	getIconSchema(): IJSONSchema;

	/**
	 * JSON schema to for a reference to a icon contribution.
	 */
	getIconReferenceSchema(): IJSONSchema;

}

class IconRegistry implements IIconRegistry {

	private readonly _onDidChangeSchema = new Emitter<void>();
	readonly onDidChangeSchema: Event<void> = this._onDidChangeSchema.event;

	private iconsById: { [key: string]: IconContribution };
	private iconSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
		definitions: {
			icons: {
				type: 'object',
				properties: {
					fontId: { type: 'string', description: localize('iconDefintion.fontId', 'The id of the font to use. If not set, the font that is defined first is used.') },
					fontCharacter: { type: 'string', description: localize('iconDefintion.fontCharacter', 'The font character associated with the icon definition.') }
				},
				additionalProperties: false,
				defaultSnippets: [{ body: { fontCharacter: '\\\\e030' } }]
			}
		},
		type: 'object',
		properties: {}
	};
	private iconReferenceSchema: IJSONSchema & { enum: string[], enumDescriptions: string[] } = { type: 'string', enum: [], enumDescriptions: [] };

	constructor() {
		this.iconsById = {};
	}

	public registerIcon(id: string, defaults: IconDefaults, description: string, deprecationMessage?: string): ThemeIcon {
		let iconContribution: IconContribution = { id, description, defaults, deprecationMessage };
		this.iconsById[id] = iconContribution;
		let propertySchema: IJSONSchema = { description, $ref: '#/definitions/icons' };
		if (deprecationMessage) {
			propertySchema.deprecationMessage = deprecationMessage;
		}
		propertySchema.markdownDescription = localize('iconPreview', "Current icon: {0}", `$(${id})`);
		this.iconSchema.properties[id] = propertySchema;
		this.iconReferenceSchema.enum.push(id);
		this.iconReferenceSchema.enumDescriptions.push(description);

		this._onDidChangeSchema.fire();
		return { id };
	}


	public deregisterIcon(id: string): void {
		delete this.iconsById[id];
		delete this.iconSchema.properties[id];
		const index = this.iconReferenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.iconReferenceSchema.enum.splice(index, 1);
			this.iconReferenceSchema.enumDescriptions.splice(index, 1);
		}
		this._onDidChangeSchema.fire();
	}

	public getIcons(): IconContribution[] {
		return Object.keys(this.iconsById).map(id => this.iconsById[id]);
	}

	public getIconSchema(): IJSONSchema {
		return this.iconSchema;
	}

	public getIconReferenceSchema(): IJSONSchema {
		return this.iconReferenceSchema;
	}

	public toString() {
		let sorter = (a: string, b: string) => {
			let cat1 = a.indexOf('.') === -1 ? 0 : 1;
			let cat2 = b.indexOf('.') === -1 ? 0 : 1;
			if (cat1 !== cat2) {
				return cat1 - cat2;
			}
			return a.localeCompare(b);
		};

		return Object.keys(this.iconsById).sort(sorter).map(k => `- \`${k}\`: ${this.iconsById[k].description}`).join('\n');
	}

}

const iconRegistry = new IconRegistry();
platform.Registry.add(Extensions.IconContribution, iconRegistry);

export function registerIcon(id: string, defaults: IconDefaults, description: string, deprecationMessage?: string): ThemeIcon {
	return iconRegistry.registerIcon(id, defaults, description, deprecationMessage);
}

export function getIconRegistry(): IIconRegistry {
	return iconRegistry;
}

registerIcon('add', { character: '\ea60' }, localize('add', ''));
registerIcon('plus', { character: '\ea60' }, localize('plus', ''));
registerIcon('gist-new', { character: '\ea60' }, localize('gist-new', ''));
registerIcon('repo-create', { character: '\ea60' }, localize('repo-create', ''));
registerIcon('lightbulb', { character: '\ea61' }, localize('lightbulb', ''));
registerIcon('light-bulb', { character: '\ea61' }, localize('light-bulb', ''));
registerIcon('repo', { character: '\ea62' }, localize('repo', ''));
registerIcon('repo-delete', { character: '\ea62' }, localize('repo-delete', ''));
registerIcon('gist-fork', { character: '\ea63' }, localize('gist-fork', ''));
registerIcon('repo-forked', { character: '\ea63' }, localize('repo-forked', ''));
registerIcon('git-pull-request', { character: '\ea64' }, localize('git-pull-request', ''));
registerIcon('git-pull-request-abandoned', { character: '\ea64' }, localize('git-pull-request-abandoned', ''));
registerIcon('record-keys', { character: '\ea65' }, localize('record-keys', ''));
registerIcon('keyboard', { character: '\ea65' }, localize('keyboard', ''));
registerIcon('tag', { character: '\ea66' }, localize('tag', ''));
registerIcon('tag-add', { character: '\ea66' }, localize('tag-add', ''));
registerIcon('tag-remove', { character: '\ea66' }, localize('tag-remove', ''));
registerIcon('person', { character: '\ea67' }, localize('person', ''));
registerIcon('person-add', { character: '\ea67' }, localize('person-add', ''));
registerIcon('person-follow', { character: '\ea67' }, localize('person-follow', ''));
registerIcon('person-outline', { character: '\ea67' }, localize('person-outline', ''));
registerIcon('person-filled', { character: '\ea67' }, localize('person-filled', ''));
registerIcon('git-branch', { character: '\ea68' }, localize('git-branch', ''));
registerIcon('git-branch-create', { character: '\ea68' }, localize('git-branch-create', ''));
registerIcon('git-branch-delete', { character: '\ea68' }, localize('git-branch-delete', ''));
registerIcon('source-control', { character: '\ea68' }, localize('source-control', ''));
registerIcon('mirror', { character: '\ea69' }, localize('mirror', ''));
registerIcon('mirror-public', { character: '\ea69' }, localize('mirror-public', ''));
registerIcon('star', { character: '\ea6a' }, localize('star', ''));
registerIcon('star-add', { character: '\ea6a' }, localize('star-add', ''));
registerIcon('star-delete', { character: '\ea6a' }, localize('star-delete', ''));
registerIcon('star-empty', { character: '\ea6a' }, localize('star-empty', ''));
registerIcon('comment', { character: '\ea6b' }, localize('comment', ''));
registerIcon('comment-add', { character: '\ea6b' }, localize('comment-add', ''));
registerIcon('alert', { character: '\ea6c' }, localize('alert', ''));
registerIcon('warning', { character: '\ea6c' }, localize('warning', ''));
registerIcon('search', { character: '\ea6d' }, localize('search', ''));
registerIcon('search-save', { character: '\ea6d' }, localize('search-save', ''));
registerIcon('log-out', { character: '\ea6e' }, localize('log-out', ''));
registerIcon('sign-out', { character: '\ea6e' }, localize('sign-out', ''));
registerIcon('log-in', { character: '\ea6f' }, localize('log-in', ''));
registerIcon('sign-in', { character: '\ea6f' }, localize('sign-in', ''));
registerIcon('eye', { character: '\ea70' }, localize('eye', ''));
registerIcon('eye-unwatch', { character: '\ea70' }, localize('eye-unwatch', ''));
registerIcon('eye-watch', { character: '\ea70' }, localize('eye-watch', ''));
registerIcon('circle-filled', { character: '\ea71' }, localize('circle-filled', ''));
registerIcon('primitive-dot', { character: '\ea71' }, localize('primitive-dot', ''));
registerIcon('close-dirty', { character: '\ea71' }, localize('close-dirty', ''));
registerIcon('debug-breakpoint', { character: '\ea71' }, localize('debug-breakpoint', ''));
registerIcon('debug-breakpoint-disabled', { character: '\ea71' }, localize('debug-breakpoint-disabled', ''));
registerIcon('debug-hint', { character: '\ea71' }, localize('debug-hint', ''));
registerIcon('primitive-square', { character: '\ea72' }, localize('primitive-square', ''));
registerIcon('edit', { character: '\ea73' }, localize('edit', ''));
registerIcon('pencil', { character: '\ea73' }, localize('pencil', ''));
registerIcon('info', { character: '\ea74' }, localize('info', ''));
registerIcon('issue-opened', { character: '\ea74' }, localize('issue-opened', ''));
registerIcon('gist-private', { character: '\ea75' }, localize('gist-private', ''));
registerIcon('git-fork-private', { character: '\ea75' }, localize('git-fork-private', ''));
registerIcon('lock', { character: '\ea75' }, localize('lock', ''));
registerIcon('mirror-private', { character: '\ea75' }, localize('mirror-private', ''));
registerIcon('close', { character: '\ea76' }, localize('close', ''));
registerIcon('remove-close', { character: '\ea76' }, localize('remove-close', ''));
registerIcon('x', { character: '\ea76' }, localize('x', ''));
registerIcon('repo-sync', { character: '\ea77' }, localize('repo-sync', ''));
registerIcon('sync', { character: '\ea77' }, localize('sync', ''));
registerIcon('clone', { character: '\ea78' }, localize('clone', ''));
registerIcon('desktop-download', { character: '\ea78' }, localize('desktop-download', ''));
registerIcon('beaker', { character: '\ea79' }, localize('beaker', ''));
registerIcon('microscope', { character: '\ea79' }, localize('microscope', ''));
registerIcon('vm', { character: '\ea7a' }, localize('vm', ''));
registerIcon('device-desktop', { character: '\ea7a' }, localize('device-desktop', ''));
registerIcon('file', { character: '\ea7b' }, localize('file', ''));
registerIcon('file-text', { character: '\ea7b' }, localize('file-text', ''));
registerIcon('more', { character: '\ea7c' }, localize('more', ''));
registerIcon('ellipsis', { character: '\ea7c' }, localize('ellipsis', ''));
registerIcon('kebab-horizontal', { character: '\ea7c' }, localize('kebab-horizontal', ''));
registerIcon('mail-reply', { character: '\ea7d' }, localize('mail-reply', ''));
registerIcon('reply', { character: '\ea7d' }, localize('reply', ''));
registerIcon('organization', { character: '\ea7e' }, localize('organization', ''));
registerIcon('organization-filled', { character: '\ea7e' }, localize('organization-filled', ''));
registerIcon('organization-outline', { character: '\ea7e' }, localize('organization-outline', ''));
registerIcon('new-file', { character: '\ea7f' }, localize('new-file', ''));
registerIcon('file-add', { character: '\ea7f' }, localize('file-add', ''));
registerIcon('new-folder', { character: '\ea80' }, localize('new-folder', ''));
registerIcon('file-directory-create', { character: '\ea80' }, localize('file-directory-create', ''));
registerIcon('trash', { character: '\ea81' }, localize('trash', ''));
registerIcon('trashcan', { character: '\ea81' }, localize('trashcan', ''));
registerIcon('history', { character: '\ea82' }, localize('history', ''));
registerIcon('clock', { character: '\ea82' }, localize('clock', ''));
registerIcon('folder', { character: '\ea83' }, localize('folder', ''));
registerIcon('file-directory', { character: '\ea83' }, localize('file-directory', ''));
registerIcon('symbol-folder', { character: '\ea83' }, localize('symbol-folder', ''));
registerIcon('logo-github', { character: '\ea84' }, localize('logo-github', ''));
registerIcon('mark-github', { character: '\ea84' }, localize('mark-github', ''));
registerIcon('github', { character: '\ea84' }, localize('github', ''));
registerIcon('terminal', { character: '\ea85' }, localize('terminal', ''));
registerIcon('console', { character: '\ea85' }, localize('console', ''));
registerIcon('repl', { character: '\ea85' }, localize('repl', ''));
registerIcon('zap', { character: '\ea86' }, localize('zap', ''));
registerIcon('symbol-event', { character: '\ea86' }, localize('symbol-event', ''));
registerIcon('error', { character: '\ea87' }, localize('error', ''));
registerIcon('stop', { character: '\ea87' }, localize('stop', ''));
registerIcon('variable', { character: '\ea88' }, localize('variable', ''));
registerIcon('symbol-variable', { character: '\ea88' }, localize('symbol-variable', ''));
registerIcon('array', { character: '\ea8a' }, localize('array', ''));
registerIcon('symbol-array', { character: '\ea8a' }, localize('symbol-array', ''));
registerIcon('symbol-module', { character: '\ea8b' }, localize('symbol-module', ''));
registerIcon('symbol-package', { character: '\ea8b' }, localize('symbol-package', ''));
registerIcon('symbol-namespace', { character: '\ea8b' }, localize('symbol-namespace', ''));
registerIcon('symbol-object', { character: '\ea8b' }, localize('symbol-object', ''));
registerIcon('symbol-method', { character: '\ea8c' }, localize('symbol-method', ''));
registerIcon('symbol-function', { character: '\ea8c' }, localize('symbol-function', ''));
registerIcon('symbol-constructor', { character: '\ea8c' }, localize('symbol-constructor', ''));
registerIcon('symbol-boolean', { character: '\ea8f' }, localize('symbol-boolean', ''));
registerIcon('symbol-null', { character: '\ea8f' }, localize('symbol-null', ''));
registerIcon('symbol-numeric', { character: '\ea90' }, localize('symbol-numeric', ''));
registerIcon('symbol-number', { character: '\ea90' }, localize('symbol-number', ''));
registerIcon('symbol-structure', { character: '\ea91' }, localize('symbol-structure', ''));
registerIcon('symbol-struct', { character: '\ea91' }, localize('symbol-struct', ''));
registerIcon('symbol-parameter', { character: '\ea92' }, localize('symbol-parameter', ''));
registerIcon('symbol-type-parameter', { character: '\ea92' }, localize('symbol-type-parameter', ''));
registerIcon('symbol-key', { character: '\ea93' }, localize('symbol-key', ''));
registerIcon('symbol-text', { character: '\ea93' }, localize('symbol-text', ''));
registerIcon('symbol-reference', { character: '\ea94' }, localize('symbol-reference', ''));
registerIcon('go-to-file', { character: '\ea94' }, localize('go-to-file', ''));
registerIcon('symbol-enum', { character: '\ea95' }, localize('symbol-enum', ''));
registerIcon('symbol-value', { character: '\ea95' }, localize('symbol-value', ''));
registerIcon('symbol-ruler', { character: '\ea96' }, localize('symbol-ruler', ''));
registerIcon('symbol-unit', { character: '\ea96' }, localize('symbol-unit', ''));
registerIcon('activate-breakpoints', { character: '\ea97' }, localize('activate-breakpoints', ''));
registerIcon('archive', { character: '\ea98' }, localize('archive', ''));
registerIcon('arrow-both', { character: '\ea99' }, localize('arrow-both', ''));
registerIcon('arrow-down', { character: '\ea9a' }, localize('arrow-down', ''));
registerIcon('arrow-left', { character: '\ea9b' }, localize('arrow-left', ''));
registerIcon('arrow-right', { character: '\ea9c' }, localize('arrow-right', ''));
registerIcon('arrow-small-down', { character: '\ea9d' }, localize('arrow-small-down', ''));
registerIcon('arrow-small-left', { character: '\ea9e' }, localize('arrow-small-left', ''));
registerIcon('arrow-small-right', { character: '\ea9f' }, localize('arrow-small-right', ''));
registerIcon('arrow-small-up', { character: '\eaa0' }, localize('arrow-small-up', ''));
registerIcon('arrow-up', { character: '\eaa1' }, localize('arrow-up', ''));
registerIcon('bell', { character: '\eaa2' }, localize('bell', ''));
registerIcon('bold', { character: '\eaa3' }, localize('bold', ''));
registerIcon('book', { character: '\eaa4' }, localize('book', ''));
registerIcon('bookmark', { character: '\eaa5' }, localize('bookmark', ''));
registerIcon('debug-breakpoint-conditional-unverified', { character: '\eaa6' }, localize('debug-breakpoint-conditional-unverified', ''));
registerIcon('debug-breakpoint-conditional', { character: '\eaa7' }, localize('debug-breakpoint-conditional', ''));
registerIcon('debug-breakpoint-conditional-disabled', { character: '\eaa7' }, localize('debug-breakpoint-conditional-disabled', ''));
registerIcon('debug-breakpoint-data-unverified', { character: '\eaa8' }, localize('debug-breakpoint-data-unverified', ''));
registerIcon('debug-breakpoint-data', { character: '\eaa9' }, localize('debug-breakpoint-data', ''));
registerIcon('debug-breakpoint-data-disabled', { character: '\eaa9' }, localize('debug-breakpoint-data-disabled', ''));
registerIcon('debug-breakpoint-log-unverified', { character: '\eaaa' }, localize('debug-breakpoint-log-unverified', ''));
registerIcon('debug-breakpoint-log', { character: '\eaab' }, localize('debug-breakpoint-log', ''));
registerIcon('debug-breakpoint-log-disabled', { character: '\eaab' }, localize('debug-breakpoint-log-disabled', ''));
registerIcon('briefcase', { character: '\eaac' }, localize('briefcase', ''));
registerIcon('broadcast', { character: '\eaad' }, localize('broadcast', ''));
registerIcon('browser', { character: '\eaae' }, localize('browser', ''));
registerIcon('bug', { character: '\eaaf' }, localize('bug', ''));
registerIcon('calendar', { character: '\eab0' }, localize('calendar', ''));
registerIcon('case-sensitive', { character: '\eab1' }, localize('case-sensitive', ''));
registerIcon('check', { character: '\eab2' }, localize('check', ''));
registerIcon('checklist', { character: '\eab3' }, localize('checklist', ''));
registerIcon('chevron-down', { character: '\eab4' }, localize('chevron-down', ''));
registerIcon('chevron-left', { character: '\eab5' }, localize('chevron-left', ''));
registerIcon('chevron-right', { character: '\eab6' }, localize('chevron-right', ''));
registerIcon('chevron-up', { character: '\eab7' }, localize('chevron-up', ''));
registerIcon('chrome-close', { character: '\eab8' }, localize('chrome-close', ''));
registerIcon('chrome-maximize', { character: '\eab9' }, localize('chrome-maximize', ''));
registerIcon('chrome-minimize', { character: '\eaba' }, localize('chrome-minimize', ''));
registerIcon('chrome-restore', { character: '\eabb' }, localize('chrome-restore', ''));
registerIcon('circle-outline', { character: '\eabc' }, localize('circle-outline', ''));
registerIcon('debug-breakpoint-unverified', { character: '\eabc' }, localize('debug-breakpoint-unverified', ''));
registerIcon('circle-slash', { character: '\eabd' }, localize('circle-slash', ''));
registerIcon('circuit-board', { character: '\eabe' }, localize('circuit-board', ''));
registerIcon('clear-all', { character: '\eabf' }, localize('clear-all', ''));
registerIcon('clippy', { character: '\eac0' }, localize('clippy', ''));
registerIcon('close-all', { character: '\eac1' }, localize('close-all', ''));
registerIcon('cloud-download', { character: '\eac2' }, localize('cloud-download', ''));
registerIcon('cloud-upload', { character: '\eac3' }, localize('cloud-upload', ''));
registerIcon('code', { character: '\eac4' }, localize('code', ''));
registerIcon('collapse-all', { character: '\eac5' }, localize('collapse-all', ''));
registerIcon('color-mode', { character: '\eac6' }, localize('color-mode', ''));
registerIcon('comment-discussion', { character: '\eac7' }, localize('comment-discussion', ''));
registerIcon('compare-changes', { character: '\eac8' }, localize('compare-changes', ''));
registerIcon('credit-card', { character: '\eac9' }, localize('credit-card', ''));
registerIcon('dash', { character: '\eacc' }, localize('dash', ''));
registerIcon('dashboard', { character: '\eacd' }, localize('dashboard', ''));
registerIcon('database', { character: '\eace' }, localize('database', ''));
registerIcon('debug-continue', { character: '\eacf' }, localize('debug-continue', ''));
registerIcon('debug-disconnect', { character: '\ead0' }, localize('debug-disconnect', ''));
registerIcon('debug-pause', { character: '\ead1' }, localize('debug-pause', ''));
registerIcon('debug-restart', { character: '\ead2' }, localize('debug-restart', ''));
registerIcon('debug-start', { character: '\ead3' }, localize('debug-start', ''));
registerIcon('debug-step-into', { character: '\ead4' }, localize('debug-step-into', ''));
registerIcon('debug-step-out', { character: '\ead5' }, localize('debug-step-out', ''));
registerIcon('debug-step-over', { character: '\ead6' }, localize('debug-step-over', ''));
registerIcon('debug-stop', { character: '\ead7' }, localize('debug-stop', ''));
registerIcon('debug', { character: '\ead8' }, localize('debug', ''));
registerIcon('device-camera-video', { character: '\ead9' }, localize('device-camera-video', ''));
registerIcon('device-camera', { character: '\eada' }, localize('device-camera', ''));
registerIcon('device-mobile', { character: '\eadb' }, localize('device-mobile', ''));
registerIcon('diff-added', { character: '\eadc' }, localize('diff-added', ''));
registerIcon('diff-ignored', { character: '\eadd' }, localize('diff-ignored', ''));
registerIcon('diff-modified', { character: '\eade' }, localize('diff-modified', ''));
registerIcon('diff-removed', { character: '\eadf' }, localize('diff-removed', ''));
registerIcon('diff-renamed', { character: '\eae0' }, localize('diff-renamed', ''));
registerIcon('diff', { character: '\eae1' }, localize('diff', ''));
registerIcon('discard', { character: '\eae2' }, localize('discard', ''));
registerIcon('editor-layout', { character: '\eae3' }, localize('editor-layout', ''));
registerIcon('empty-window', { character: '\eae4' }, localize('empty-window', ''));
registerIcon('exclude', { character: '\eae5' }, localize('exclude', ''));
registerIcon('extensions', { character: '\eae6' }, localize('extensions', ''));
registerIcon('eye-closed', { character: '\eae7' }, localize('eye-closed', ''));
registerIcon('file-binary', { character: '\eae8' }, localize('file-binary', ''));
registerIcon('file-code', { character: '\eae9' }, localize('file-code', ''));
registerIcon('file-media', { character: '\eaea' }, localize('file-media', ''));
registerIcon('file-pdf', { character: '\eaeb' }, localize('file-pdf', ''));
registerIcon('file-submodule', { character: '\eaec' }, localize('file-submodule', ''));
registerIcon('file-symlink-directory', { character: '\eaed' }, localize('file-symlink-directory', ''));
registerIcon('file-symlink-file', { character: '\eaee' }, localize('file-symlink-file', ''));
registerIcon('file-zip', { character: '\eaef' }, localize('file-zip', ''));
registerIcon('files', { character: '\eaf0' }, localize('files', ''));
registerIcon('filter', { character: '\eaf1' }, localize('filter', ''));
registerIcon('flame', { character: '\eaf2' }, localize('flame', ''));
registerIcon('fold-down', { character: '\eaf3' }, localize('fold-down', ''));
registerIcon('fold-up', { character: '\eaf4' }, localize('fold-up', ''));
registerIcon('fold', { character: '\eaf5' }, localize('fold', ''));
registerIcon('folder-active', { character: '\eaf6' }, localize('folder-active', ''));
registerIcon('folder-opened', { character: '\eaf7' }, localize('folder-opened', ''));
registerIcon('gear', { character: '\eaf8' }, localize('gear', ''));
registerIcon('gift', { character: '\eaf9' }, localize('gift', ''));
registerIcon('gist-secret', { character: '\eafa' }, localize('gist-secret', ''));
registerIcon('gist', { character: '\eafb' }, localize('gist', ''));
registerIcon('git-commit', { character: '\eafc' }, localize('git-commit', ''));
registerIcon('git-compare', { character: '\eafd' }, localize('git-compare', ''));
registerIcon('git-merge', { character: '\eafe' }, localize('git-merge', ''));
registerIcon('github-action', { character: '\eaff' }, localize('github-action', ''));
registerIcon('github-alt', { character: '\eb00' }, localize('github-alt', ''));
registerIcon('globe', { character: '\eb01' }, localize('globe', ''));
registerIcon('grabber', { character: '\eb02' }, localize('grabber', ''));
registerIcon('graph', { character: '\eb03' }, localize('graph', ''));
registerIcon('gripper', { character: '\eb04' }, localize('gripper', ''));
registerIcon('heart', { character: '\eb05' }, localize('heart', ''));
registerIcon('home', { character: '\eb06' }, localize('home', ''));
registerIcon('horizontal-rule', { character: '\eb07' }, localize('horizontal-rule', ''));
registerIcon('hubot', { character: '\eb08' }, localize('hubot', ''));
registerIcon('inbox', { character: '\eb09' }, localize('inbox', ''));
registerIcon('issue-closed', { character: '\eb0a' }, localize('issue-closed', ''));
registerIcon('issue-reopened', { character: '\eb0b' }, localize('issue-reopened', ''));
registerIcon('issues', { character: '\eb0c' }, localize('issues', ''));
registerIcon('italic', { character: '\eb0d' }, localize('italic', ''));
registerIcon('jersey', { character: '\eb0e' }, localize('jersey', ''));
registerIcon('json', { character: '\eb0f' }, localize('json', ''));
registerIcon('kebab-vertical', { character: '\eb10' }, localize('kebab-vertical', ''));
registerIcon('key', { character: '\eb11' }, localize('key', ''));
registerIcon('law', { character: '\eb12' }, localize('law', ''));
registerIcon('lightbulb-autofix', { character: '\eb13' }, localize('lightbulb-autofix', ''));
registerIcon('link-external', { character: '\eb14' }, localize('link-external', ''));
registerIcon('link', { character: '\eb15' }, localize('link', ''));
registerIcon('list-ordered', { character: '\eb16' }, localize('list-ordered', ''));
registerIcon('list-unordered', { character: '\eb17' }, localize('list-unordered', ''));
registerIcon('live-share', { character: '\eb18' }, localize('live-share', ''));
registerIcon('loading', { character: '\eb19' }, localize('loading', ''));
registerIcon('location', { character: '\eb1a' }, localize('location', ''));
registerIcon('mail-read', { character: '\eb1b' }, localize('mail-read', ''));
registerIcon('mail', { character: '\eb1c' }, localize('mail', ''));
registerIcon('markdown', { character: '\eb1d' }, localize('markdown', ''));
registerIcon('megaphone', { character: '\eb1e' }, localize('megaphone', ''));
registerIcon('mention', { character: '\eb1f' }, localize('mention', ''));
registerIcon('milestone', { character: '\eb20' }, localize('milestone', ''));
registerIcon('mortar-board', { character: '\eb21' }, localize('mortar-board', ''));
registerIcon('move', { character: '\eb22' }, localize('move', ''));
registerIcon('multiple-windows', { character: '\eb23' }, localize('multiple-windows', ''));
registerIcon('mute', { character: '\eb24' }, localize('mute', ''));
registerIcon('no-newline', { character: '\eb25' }, localize('no-newline', ''));
registerIcon('note', { character: '\eb26' }, localize('note', ''));
registerIcon('octoface', { character: '\eb27' }, localize('octoface', ''));
registerIcon('open-preview', { character: '\eb28' }, localize('open-preview', ''));
registerIcon('package', { character: '\eb29' }, localize('package', ''));
registerIcon('paintcan', { character: '\eb2a' }, localize('paintcan', ''));
registerIcon('pin', { character: '\eb2b' }, localize('pin', ''));
registerIcon('play', { character: '\eb2c' }, localize('play', ''));
registerIcon('run', { character: '\eb2c' }, localize('run', ''));
registerIcon('plug', { character: '\eb2d' }, localize('plug', ''));
registerIcon('preserve-case', { character: '\eb2e' }, localize('preserve-case', ''));
registerIcon('preview', { character: '\eb2f' }, localize('preview', ''));
registerIcon('project', { character: '\eb30' }, localize('project', ''));
registerIcon('pulse', { character: '\eb31' }, localize('pulse', ''));
registerIcon('question', { character: '\eb32' }, localize('question', ''));
registerIcon('quote', { character: '\eb33' }, localize('quote', ''));
registerIcon('radio-tower', { character: '\eb34' }, localize('radio-tower', ''));
registerIcon('reactions', { character: '\eb35' }, localize('reactions', ''));
registerIcon('references', { character: '\eb36' }, localize('references', ''));
registerIcon('refresh', { character: '\eb37' }, localize('refresh', ''));
registerIcon('regex', { character: '\eb38' }, localize('regex', ''));
registerIcon('remote-explorer', { character: '\eb39' }, localize('remote-explorer', ''));
registerIcon('remote', { character: '\eb3a' }, localize('remote', ''));
registerIcon('remove', { character: '\eb3b' }, localize('remove', ''));
registerIcon('replace-all', { character: '\eb3c' }, localize('replace-all', ''));
registerIcon('replace', { character: '\eb3d' }, localize('replace', ''));
registerIcon('repo-clone', { character: '\eb3e' }, localize('repo-clone', ''));
registerIcon('repo-force-push', { character: '\eb3f' }, localize('repo-force-push', ''));
registerIcon('repo-pull', { character: '\eb40' }, localize('repo-pull', ''));
registerIcon('repo-push', { character: '\eb41' }, localize('repo-push', ''));
registerIcon('report', { character: '\eb42' }, localize('report', ''));
registerIcon('request-changes', { character: '\eb43' }, localize('request-changes', ''));
registerIcon('rocket', { character: '\eb44' }, localize('rocket', ''));
registerIcon('root-folder-opened', { character: '\eb45' }, localize('root-folder-opened', ''));
registerIcon('root-folder', { character: '\eb46' }, localize('root-folder', ''));
registerIcon('rss', { character: '\eb47' }, localize('rss', ''));
registerIcon('ruby', { character: '\eb48' }, localize('ruby', ''));
registerIcon('save-all', { character: '\eb49' }, localize('save-all', ''));
registerIcon('save-as', { character: '\eb4a' }, localize('save-as', ''));
registerIcon('save', { character: '\eb4b' }, localize('save', ''));
registerIcon('screen-full', { character: '\eb4c' }, localize('screen-full', ''));
registerIcon('screen-normal', { character: '\eb4d' }, localize('screen-normal', ''));
registerIcon('search-stop', { character: '\eb4e' }, localize('search-stop', ''));
registerIcon('server', { character: '\eb50' }, localize('server', ''));
registerIcon('settings-gear', { character: '\eb51' }, localize('settings-gear', ''));
registerIcon('settings', { character: '\eb52' }, localize('settings', ''));
registerIcon('shield', { character: '\eb53' }, localize('shield', ''));
registerIcon('smiley', { character: '\eb54' }, localize('smiley', ''));
registerIcon('sort-precedence', { character: '\eb55' }, localize('sort-precedence', ''));
registerIcon('split-horizontal', { character: '\eb56' }, localize('split-horizontal', ''));
registerIcon('split-vertical', { character: '\eb57' }, localize('split-vertical', ''));
registerIcon('squirrel', { character: '\eb58' }, localize('squirrel', ''));
registerIcon('star-full', { character: '\eb59' }, localize('star-full', ''));
registerIcon('star-half', { character: '\eb5a' }, localize('star-half', ''));
registerIcon('symbol-class', { character: '\eb5b' }, localize('symbol-class', ''));
registerIcon('symbol-color', { character: '\eb5c' }, localize('symbol-color', ''));
registerIcon('symbol-constant', { character: '\eb5d' }, localize('symbol-constant', ''));
registerIcon('symbol-enum-member', { character: '\eb5e' }, localize('symbol-enum-member', ''));
registerIcon('symbol-field', { character: '\eb5f' }, localize('symbol-field', ''));
registerIcon('symbol-file', { character: '\eb60' }, localize('symbol-file', ''));
registerIcon('symbol-interface', { character: '\eb61' }, localize('symbol-interface', ''));
registerIcon('symbol-keyword', { character: '\eb62' }, localize('symbol-keyword', ''));
registerIcon('symbol-misc', { character: '\eb63' }, localize('symbol-misc', ''));
registerIcon('symbol-operator', { character: '\eb64' }, localize('symbol-operator', ''));
registerIcon('symbol-property', { character: '\eb65' }, localize('symbol-property', ''));
registerIcon('wrench', { character: '\eb65' }, localize('wrench', ''));
registerIcon('wrench-subaction', { character: '\eb65' }, localize('wrench-subaction', ''));
registerIcon('symbol-snippet', { character: '\eb66' }, localize('symbol-snippet', ''));
registerIcon('tasklist', { character: '\eb67' }, localize('tasklist', ''));
registerIcon('telescope', { character: '\eb68' }, localize('telescope', ''));
registerIcon('text-size', { character: '\eb69' }, localize('text-size', ''));
registerIcon('three-bars', { character: '\eb6a' }, localize('three-bars', ''));
registerIcon('thumbsdown', { character: '\eb6b' }, localize('thumbsdown', ''));
registerIcon('thumbsup', { character: '\eb6c' }, localize('thumbsup', ''));
registerIcon('tools', { character: '\eb6d' }, localize('tools', ''));
registerIcon('triangle-down', { character: '\eb6e' }, localize('triangle-down', ''));
registerIcon('triangle-left', { character: '\eb6f' }, localize('triangle-left', ''));
registerIcon('triangle-right', { character: '\eb70' }, localize('triangle-right', ''));
registerIcon('triangle-up', { character: '\eb71' }, localize('triangle-up', ''));
registerIcon('twitter', { character: '\eb72' }, localize('twitter', ''));
registerIcon('unfold', { character: '\eb73' }, localize('unfold', ''));
registerIcon('unlock', { character: '\eb74' }, localize('unlock', ''));
registerIcon('unmute', { character: '\eb75' }, localize('unmute', ''));
registerIcon('unverified', { character: '\eb76' }, localize('unverified', ''));
registerIcon('verified', { character: '\eb77' }, localize('verified', ''));
registerIcon('versions', { character: '\eb78' }, localize('versions', ''));
registerIcon('vm-active', { character: '\eb79' }, localize('vm-active', ''));
registerIcon('vm-outline', { character: '\eb7a' }, localize('vm-outline', ''));
registerIcon('vm-running', { character: '\eb7b' }, localize('vm-running', ''));
registerIcon('watch', { character: '\eb7c' }, localize('watch', ''));
registerIcon('whitespace', { character: '\eb7d' }, localize('whitespace', ''));
registerIcon('whole-word', { character: '\eb7e' }, localize('whole-word', ''));
registerIcon('window', { character: '\eb7f' }, localize('window', ''));
registerIcon('word-wrap', { character: '\eb80' }, localize('word-wrap', ''));
registerIcon('zoom-in', { character: '\eb81' }, localize('zoom-in', ''));
registerIcon('zoom-out', { character: '\eb82' }, localize('zoom-out', ''));
registerIcon('list-filter', { character: '\eb83' }, localize('list-filter', ''));
registerIcon('list-flat', { character: '\eb84' }, localize('list-flat', ''));
registerIcon('list-selection', { character: '\eb85' }, localize('list-selection', ''));
registerIcon('selection', { character: '\eb85' }, localize('selection', ''));
registerIcon('list-tree', { character: '\eb86' }, localize('list-tree', ''));
registerIcon('debug-breakpoint-function-unverified', { character: '\eb87' }, localize('debug-breakpoint-function-unverified', ''));
registerIcon('debug-breakpoint-function', { character: '\eb88' }, localize('debug-breakpoint-function', ''));
registerIcon('debug-breakpoint-function-disabled', { character: '\eb88' }, localize('debug-breakpoint-function-disabled', ''));
registerIcon('debug-stackframe-active', { character: '\eb89' }, localize('debug-stackframe-active', ''));
registerIcon('debug-stackframe-dot', { character: '\eb8a' }, localize('debug-stackframe-dot', ''));
registerIcon('debug-stackframe', { character: '\eb8b' }, localize('debug-stackframe', ''));
registerIcon('debug-stackframe-focused', { character: '\eb8b' }, localize('debug-stackframe-focused', ''));
registerIcon('debug-breakpoint-unsupported', { character: '\eb8c' }, localize('debug-breakpoint-unsupported', ''));
registerIcon('symbol-string', { character: '\eb8d' }, localize('symbol-string', ''));
registerIcon('debug-reverse-continue', { character: '\eb8e' }, localize('debug-reverse-continue', ''));
registerIcon('debug-step-back', { character: '\eb8f' }, localize('debug-step-back', ''));
registerIcon('debug-restart-frame', { character: '\eb90' }, localize('debug-restart-frame', ''));
registerIcon('debug-alternate', { character: '\eb91' }, localize('debug-alternate', ''));
registerIcon('call-incoming', { character: '\eb92' }, localize('call-incoming', ''));
registerIcon('call-outgoing', { character: '\eb93' }, localize('call-outgoing', ''));
registerIcon('menu', { character: '\eb94' }, localize('menu', ''));
registerIcon('expand-all', { character: '\eb95' }, localize('expand-all', ''));
registerIcon('feedback', { character: '\eb96' }, localize('feedback', ''));
registerIcon('group-by-ref-type', { character: '\eb97' }, localize('group-by-ref-type', ''));
registerIcon('ungroup-by-ref-type', { character: '\eb98' }, localize('ungroup-by-ref-type', ''));
registerIcon('bell-dot', { character: '\f101' }, localize('bell-dot', ''));
registerIcon('debug-alt-2', { character: '\f102' }, localize('debug-alt-2', ''));
registerIcon('debug-alt', { character: '\f103' }, localize('debug-alt', ''));

export const iconsSchemaId = 'vscode://schemas/icons';

let schemaRegistry = platform.Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(iconsSchemaId, iconRegistry.getIconSchema());

const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(iconsSchemaId), 200);
iconRegistry.onDidChangeSchema(() => {
	if (!delayer.isScheduled()) {
		delayer.schedule();
	}
});


// setTimeout(_ => console.log(colorRegistry.toString()), 5000);
