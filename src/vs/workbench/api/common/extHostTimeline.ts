/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { UriComponents, URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ExtHostTimelineShape, MainThreadTimelineShape, IMainContext, MainContext } from './extHost.protocol.js';
import { Timeline, TimelineItem, TimelineOptions, TimelineTriggerKind } from '../../contrib/timeline/common/timeline.js';
import { IDisposable, toDisposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CommandsConverter, ExtHostCommands } from './extHostCommands.js';
import { ThemeColor, ThemeIcon, MarkdownString as MarkdownStringType, TimelineItem as TimelineItemType, TimelineTriggerKind as TimelineTriggerKindType } from './extHostTypes.js';
import { MarkdownString } from './extHostTypeConverters.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { hasKey, isString } from '../../../base/common/types.js';
import { isProposedApiEnabled } from '../../services/extensions/common/extensions.js';

export interface IExtHostTimeline extends ExtHostTimelineShape {
	readonly _serviceBrand: undefined;
	$getTimeline(id: string, uri: UriComponents | undefined, options: TimelineOptions, token: vscode.CancellationToken): Promise<Timeline | undefined>;
}

export const IExtHostTimeline = createDecorator<IExtHostTimeline>('IExtHostTimeline');

/**
 * The argument the Timeline view passes to commands for a timeline item.
 */
interface TimelineActionContext {
	readonly $mid: MarshalledId.TimelineActionContext;
	readonly handle: string;
	readonly source: string;
	readonly uri: UriComponents | undefined;
}

function isTimelineActionContext(arg: unknown): arg is TimelineActionContext {
	return !!arg && typeof arg === 'object' && (arg as TimelineActionContext).$mid === MarshalledId.TimelineActionContext;
}

/**
 * A registered timeline or workspace timeline provider and the items it returned, which are passed to commands.
 */
class TimelineProviderRegistration implements IDisposable {
	private readonly _itemsByUri = new Map<string | undefined, Map<string, vscode.TimelineItem>>();
	private readonly _commandDisposables = new DisposableStore();
	private _disposed = false;

	constructor(
		readonly id: string,
		readonly extension: ExtensionIdentifier,
		private readonly _provide: (uri: URI | undefined, options: vscode.TimelineOptions, token: CancellationToken) => vscode.ProviderResult<vscode.Timeline>,
		private readonly _commandConverter: CommandsConverter,
	) { }

	async provideTimeline(uri: URI | undefined, options: TimelineOptions, token: CancellationToken): Promise<Timeline | undefined> {
		if (options.resetCache) {
			this._commandDisposables.clear();

			// For now, only allow the caching of a single Uri
			this._itemsByUri.clear();
		}

		const result = await this._provide(uri, {
			cursor: options.cursor,
			limit: options.limit,
			triggerKind: options.triggerKind === TimelineTriggerKind.Invoke ? TimelineTriggerKindType.Invoke : TimelineTriggerKindType.Automatic,
		}, token);
		if (this._disposed || result === undefined || result === null) {
			return undefined;
		}

		let items: Map<string, vscode.TimelineItem> | undefined;
		if (options.cacheResults) {
			const uriKey = uri?.toString();
			items = this._itemsByUri.get(uriKey);
			if (items === undefined) {
				items = new Map();
				this._itemsByUri.set(uriKey, items);
			}
		}

		return {
			source: this.id,
			cursor: result.cursor,
			items: result.items.map(item => this._convertItem(item, items))
		};
	}

	getItem(uri: URI | undefined, handle: string): vscode.TimelineItem | undefined {
		return this._itemsByUri.get(uri?.toString())?.get(handle);
	}

	private _convertItem(item: vscode.TimelineItem, items: Map<string, vscode.TimelineItem> | undefined): TimelineItem {
		const handle = `${this.id}|${item.id ?? item.timestamp}`;
		items?.set(handle, item);

		let icon;
		let iconDark;
		let themeIcon;
		const iconPath = item.iconPath;
		if (iconPath) {
			if (iconPath instanceof ThemeIcon) {
				themeIcon = { id: iconPath.id, color: iconPath.color };
			}
			else if (URI.isUri(iconPath)) {
				icon = iconPath;
				iconDark = iconPath;
			}
			else {
				({ light: icon, dark: iconDark } = iconPath as { light: URI; dark: URI });
			}
		}

		let tooltip;
		if (MarkdownStringType.isMarkdownString(item.tooltip)) {
			tooltip = MarkdownString.from(item.tooltip);
		}
		else if (isString(item.tooltip)) {
			tooltip = item.tooltip;
		}

		return {
			handle,
			source: this.id,
			id: item.id ?? undefined,
			label: item.label,
			description: item.description,
			tooltip,
			timestamp: item.timestamp,
			accessibilityInformation: item.accessibilityInformation,
			icon,
			iconDark,
			themeIcon,
			command: item.command ? this._commandConverter.toInternal(item.command, this._commandDisposables) : undefined,
			contextValue: item.contextValue,
			resourceUri: item.resourceUri,
		};
	}

	dispose(): void {
		this._disposed = true;
		this._itemsByUri.clear();
		this._commandDisposables.dispose();
	}
}

export class ExtHostTimeline implements IExtHostTimeline {
	declare readonly _serviceBrand: undefined;

	private _proxy: MainThreadTimelineShape;

	private readonly _providers = new Map<string, TimelineProviderRegistration>();
	private readonly _workspaceProviders = new Map<string, TimelineProviderRegistration>();

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);

		commands.registerArgumentProcessor({
			processArgument: (arg, extension) => {
				if (isTimelineActionContext(arg)) {
					return this._resolveItem(arg, extension);
				}

				// The items selected in the Timeline view
				if (Array.isArray(arg) && arg.length > 0 && arg.every(isTimelineActionContext)) {
					const items = arg.map(context => this._resolveItem(context, extension)).filter(item => item !== undefined);
					return items.length > 0 ? items : undefined;
				}

				return arg;
			}
		});
	}

	async $getTimeline(id: string, uri: UriComponents | undefined, options: TimelineOptions, token: vscode.CancellationToken): Promise<Timeline | undefined> {
		const registration = uri === undefined ? this._workspaceProviders.get(id) : this._providers.get(id);
		return registration?.provideTimeline(URI.revive(uri), options, token);
	}

	registerTimelineProvider(scheme: string | readonly string[], provider: vscode.TimelineProvider, extension: ExtensionIdentifier, commandConverter: CommandsConverter): IDisposable {
		this._checkId(provider.id, extension, this._providers, this._workspaceProviders);

		const registration = new TimelineProviderRegistration(provider.id, extension, (uri, options, token) => uri ? provider.provideTimeline(uri, options, token) : undefined, commandConverter);
		const onDidChange = provider.onDidChangeTimeline?.(e => {
			const uris = e === undefined ? undefined : Array.isArray(e) ? e : [e];
			this._proxy.$emitTimelineChangeEvent(provider.id, uris);
		});

		this._providers.set(provider.id, registration);
		this._proxy.$registerTimelineProvider({ id: provider.id, label: provider.label, scheme });

		return toDisposable(() => {
			this._providers.delete(provider.id);
			this._proxy.$unregisterTimelineProvider(provider.id);
			onDidChange?.dispose();
			registration.dispose();
		});
	}

	registerWorkspaceTimelineProvider(provider: vscode.WorkspaceTimelineProvider, extension: ExtensionIdentifier, commandConverter: CommandsConverter): IDisposable {
		this._checkId(provider.id, extension, this._workspaceProviders, this._providers);

		const registration = new TimelineProviderRegistration(provider.id, extension, (_uri, options, token) => provider.provideWorkspaceTimeline(options, token), commandConverter);
		const onDidChange = provider.onDidChangeWorkspaceTimeline?.(() => this._proxy.$emitWorkspaceTimelineChangeEvent(provider.id));

		this._workspaceProviders.set(provider.id, registration);
		this._proxy.$registerWorkspaceTimelineProvider({ id: provider.id, label: provider.label });

		return toDisposable(() => {
			this._workspaceProviders.delete(provider.id);
			this._proxy.$unregisterWorkspaceTimelineProvider(provider.id);
			onDidChange?.dispose();
			registration.dispose();
		});
	}

	/**
	 * Ids must be unique per kind of provider, and a timeline and a workspace timeline provider may only share an id when they come from the same extension.
	 */
	private _checkId(id: string, extension: ExtensionIdentifier, sameKind: Map<string, TimelineProviderRegistration>, otherKind: Map<string, TimelineProviderRegistration>): void {
		const other = otherKind.get(id);
		if (sameKind.has(id) || (other && !ExtensionIdentifier.equals(other.extension, extension))) {
			throw new Error(`Timeline Provider ${id} already exists.`);
		}
	}

	private _resolveItem(context: TimelineActionContext, extension: IExtensionDescription | undefined): vscode.TimelineItem | undefined {
		if (!extension || !isProposedApiEnabled(extension, 'timeline')) {
			return undefined;
		}

		const uri = URI.revive(context.uri);
		const registration = uri === undefined ? this._workspaceProviders.get(context.source) : this._providers.get(context.source);
		const item = registration?.getItem(uri, context.handle);
		if (!registration || !item) {
			return undefined;
		}

		// Only the extension that provided the item gets the original object, other extensions get a read-only copy of its public properties.
		if (ExtensionIdentifier.equals(registration.extension, extension.identifier)) {
			return item;
		}

		return toReadonlyCopy(item);
	}
}

/**
 * Copies the public properties of a timeline item, except its command, without sharing mutable values with it.
 */
function toReadonlyCopy(item: vscode.TimelineItem): vscode.TimelineItem {
	const copy: vscode.TimelineItem = new TimelineItemType(item.label, item.timestamp);
	copy.id = item.id;
	copy.iconPath = copyIconPath(item.iconPath);
	copy.description = item.description;
	copy.tooltip = MarkdownStringType.isMarkdownString(item.tooltip) ? copyMarkdownString(item.tooltip) : item.tooltip;
	copy.resourceUri = item.resourceUri;
	copy.contextValue = item.contextValue;
	copy.accessibilityInformation = item.accessibilityInformation && Object.freeze({ ...item.accessibilityInformation });
	return Object.freeze(copy);
}

function copyIconPath(iconPath: vscode.TimelineItem['iconPath']): vscode.TimelineItem['iconPath'] {
	if (iconPath instanceof ThemeIcon) {
		return Object.freeze(new ThemeIcon(iconPath.id, iconPath.color && Object.freeze(new ThemeColor(iconPath.color.id))));
	}
	if (iconPath && hasKey(iconPath, { light: true, dark: true })) {
		return Object.freeze({ light: iconPath.light, dark: iconPath.dark });
	}
	return iconPath;
}

function copyMarkdownString(markdown: vscode.MarkdownString): vscode.MarkdownString {
	const copy = new MarkdownStringType(markdown.value, markdown.supportThemeIcons);
	copy.isTrusted = typeof markdown.isTrusted === 'object' ? Object.freeze({ ...markdown.isTrusted, enabledCommands: Object.freeze([...markdown.isTrusted.enabledCommands]) }) : markdown.isTrusted;
	copy.supportHtml = markdown.supportHtml;
	copy.supportAlertSyntax = markdown.supportAlertSyntax;
	copy.baseUri = markdown.baseUri;
	return copy;
}
