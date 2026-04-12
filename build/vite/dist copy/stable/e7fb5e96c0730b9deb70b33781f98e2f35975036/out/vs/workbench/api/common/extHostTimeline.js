/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { MainContext } from './extHost.protocol.js';
import { toDisposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ThemeIcon, MarkdownString as MarkdownStringType } from './extHostTypes.js';
import { MarkdownString } from './extHostTypeConverters.js';
import { isString } from '../../../base/common/types.js';
import { isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
export const IExtHostTimeline = createDecorator('IExtHostTimeline');
export class ExtHostTimeline {
    constructor(mainContext, commands) {
        this._providers = new Map();
        this._itemsBySourceAndUriMap = new Map();
        this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);
        commands.registerArgumentProcessor({
            processArgument: (arg, extension) => {
                if (arg && arg.$mid === 12 /* MarshalledId.TimelineActionContext */) {
                    if (this._providers.get(arg.source) && extension && isProposedApiEnabled(extension, 'timeline')) {
                        const uri = arg.uri === undefined ? undefined : URI.revive(arg.uri);
                        return this._itemsBySourceAndUriMap.get(arg.source)?.get(getUriKey(uri))?.get(arg.handle);
                    }
                    else {
                        return undefined;
                    }
                }
                return arg;
            }
        });
    }
    async $getTimeline(id, uri, options, token) {
        const item = this._providers.get(id);
        return item?.provider.provideTimeline(URI.revive(uri), options, token);
    }
    registerTimelineProvider(scheme, provider, extensionId, commandConverter) {
        const timelineDisposables = new DisposableStore();
        const convertTimelineItem = this.convertTimelineItem(provider.id, commandConverter, timelineDisposables).bind(this);
        let disposable;
        if (provider.onDidChange) {
            disposable = provider.onDidChange(e => this._proxy.$emitTimelineChangeEvent({ uri: undefined, reset: true, ...e, id: provider.id }), this);
        }
        const itemsBySourceAndUriMap = this._itemsBySourceAndUriMap;
        return this.registerTimelineProviderCore({
            ...provider,
            scheme: scheme,
            onDidChange: undefined,
            async provideTimeline(uri, options, token) {
                if (options?.resetCache) {
                    timelineDisposables.clear();
                    // For now, only allow the caching of a single Uri
                    // itemsBySourceAndUriMap.get(provider.id)?.get(getUriKey(uri))?.clear();
                    itemsBySourceAndUriMap.get(provider.id)?.clear();
                }
                const result = await provider.provideTimeline(uri, options, token);
                if (result === undefined || result === null) {
                    return undefined;
                }
                // TODO: Should we bother converting all the data if we aren't caching? Meaning it is being requested by an extension?
                const convertItem = convertTimelineItem(uri, options);
                return {
                    ...result,
                    source: provider.id,
                    items: result.items.map(convertItem)
                };
            },
            dispose() {
                for (const sourceMap of itemsBySourceAndUriMap.values()) {
                    sourceMap.get(provider.id)?.clear();
                }
                disposable?.dispose();
                timelineDisposables.dispose();
            }
        }, extensionId);
    }
    convertTimelineItem(source, commandConverter, disposables) {
        return (uri, options) => {
            let items;
            if (options?.cacheResults) {
                let itemsByUri = this._itemsBySourceAndUriMap.get(source);
                if (itemsByUri === undefined) {
                    itemsByUri = new Map();
                    this._itemsBySourceAndUriMap.set(source, itemsByUri);
                }
                const uriKey = getUriKey(uri);
                items = itemsByUri.get(uriKey);
                if (items === undefined) {
                    items = new Map();
                    itemsByUri.set(uriKey, items);
                }
            }
            return (item) => {
                const { iconPath, ...props } = item;
                const handle = `${source}|${item.id ?? item.timestamp}`;
                items?.set(handle, item);
                let icon;
                let iconDark;
                let themeIcon;
                if (item.iconPath) {
                    if (iconPath instanceof ThemeIcon) {
                        themeIcon = { id: iconPath.id, color: iconPath.color };
                    }
                    else if (URI.isUri(iconPath)) {
                        icon = iconPath;
                        iconDark = iconPath;
                    }
                    else {
                        ({ light: icon, dark: iconDark } = iconPath);
                    }
                }
                let tooltip;
                if (MarkdownStringType.isMarkdownString(props.tooltip)) {
                    tooltip = MarkdownString.from(props.tooltip);
                }
                else if (isString(props.tooltip)) {
                    tooltip = props.tooltip;
                }
                // TODO @jkearl, remove once migration complete.
                // eslint-disable-next-line local/code-no-any-casts
                else if (MarkdownStringType.isMarkdownString(props.detail)) {
                    console.warn('Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip');
                    // eslint-disable-next-line local/code-no-any-casts
                    tooltip = MarkdownString.from(props.detail);
                }
                // eslint-disable-next-line local/code-no-any-casts
                else if (isString(props.detail)) {
                    console.warn('Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip');
                    // eslint-disable-next-line local/code-no-any-casts
                    tooltip = props.detail;
                }
                return {
                    ...props,
                    id: props.id ?? undefined,
                    handle: handle,
                    source: source,
                    command: item.command ? commandConverter.toInternal(item.command, disposables) : undefined,
                    icon: icon,
                    iconDark: iconDark,
                    themeIcon: themeIcon,
                    tooltip,
                    accessibilityInformation: item.accessibilityInformation
                };
            };
        };
    }
    registerTimelineProviderCore(provider, extension) {
        // console.log(`ExtHostTimeline#registerTimelineProvider: id=${provider.id}`);
        const existing = this._providers.get(provider.id);
        if (existing) {
            throw new Error(`Timeline Provider ${provider.id} already exists.`);
        }
        this._proxy.$registerTimelineProvider({
            id: provider.id,
            label: provider.label,
            scheme: provider.scheme
        });
        this._providers.set(provider.id, { provider, extension });
        return toDisposable(() => {
            for (const sourceMap of this._itemsBySourceAndUriMap.values()) {
                sourceMap.get(provider.id)?.clear();
            }
            this._providers.delete(provider.id);
            this._proxy.$unregisterTimelineProvider(provider.id);
            provider.dispose();
        });
    }
}
function getUriKey(uri) {
    return uri?.toString();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRpbWVsaW5lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFRpbWVsaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBaUIsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBK0QsV0FBVyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakgsT0FBTyxFQUFlLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUcvRixPQUFPLEVBQUUsU0FBUyxFQUFFLGNBQWMsSUFBSSxrQkFBa0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUc1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFPdEYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsZUFBZSxDQUFtQixrQkFBa0IsQ0FBQyxDQUFDO0FBRXRGLE1BQU0sT0FBTyxlQUFlO0lBUzNCLFlBQ0MsV0FBeUIsRUFDekIsUUFBeUI7UUFObEIsZUFBVSxHQUFHLElBQUksR0FBRyxFQUEwRSxDQUFDO1FBRS9GLDRCQUF1QixHQUFHLElBQUksR0FBRyxFQUFxRSxDQUFDO1FBTTlHLElBQUksQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUVuRSxRQUFRLENBQUMseUJBQXlCLENBQUM7WUFDbEMsZUFBZSxFQUFFLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxFQUFFO2dCQUNuQyxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxnREFBdUMsRUFBRSxDQUFDO29CQUM1RCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxTQUFTLElBQUksb0JBQW9CLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxFQUFFLENBQUM7d0JBQ2pHLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUNwRSxPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUMzRixDQUFDO3lCQUFNLENBQUM7d0JBQ1AsT0FBTyxTQUFTLENBQUM7b0JBQ2xCLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxPQUFPLEdBQUcsQ0FBQztZQUNaLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFVLEVBQUUsR0FBa0IsRUFBRSxPQUErQixFQUFFLEtBQStCO1FBQ2xILE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLE9BQU8sSUFBSSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELHdCQUF3QixDQUFDLE1BQXlCLEVBQUUsUUFBaUMsRUFBRSxXQUFnQyxFQUFFLGdCQUFtQztRQUMzSixNQUFNLG1CQUFtQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFbEQsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVwSCxJQUFJLFVBQW1DLENBQUM7UUFDeEMsSUFBSSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDMUIsVUFBVSxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1SSxDQUFDO1FBRUQsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUM7UUFDNUQsT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUM7WUFDeEMsR0FBRyxRQUFRO1lBQ1gsTUFBTSxFQUFFLE1BQU07WUFDZCxXQUFXLEVBQUUsU0FBUztZQUN0QixLQUFLLENBQUMsZUFBZSxDQUFDLEdBQVEsRUFBRSxPQUF3QixFQUFFLEtBQXdCO2dCQUNqRixJQUFJLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztvQkFDekIsbUJBQW1CLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBRTVCLGtEQUFrRDtvQkFDbEQseUVBQXlFO29CQUN6RSxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUNsRCxDQUFDO2dCQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNuRSxJQUFJLE1BQU0sS0FBSyxTQUFTLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO29CQUM3QyxPQUFPLFNBQVMsQ0FBQztnQkFDbEIsQ0FBQztnQkFFRCxzSEFBc0g7Z0JBRXRILE1BQU0sV0FBVyxHQUFHLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDdEQsT0FBTztvQkFDTixHQUFHLE1BQU07b0JBQ1QsTUFBTSxFQUFFLFFBQVEsQ0FBQyxFQUFFO29CQUNuQixLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO2lCQUNwQyxDQUFDO1lBQ0gsQ0FBQztZQUNELE9BQU87Z0JBQ04sS0FBSyxNQUFNLFNBQVMsSUFBSSxzQkFBc0IsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO29CQUN6RCxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQztnQkFDckMsQ0FBQztnQkFFRCxVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQy9CLENBQUM7U0FDRCxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2pCLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxNQUFjLEVBQUUsZ0JBQW1DLEVBQUUsV0FBNEI7UUFDNUcsT0FBTyxDQUFDLEdBQVEsRUFBRSxPQUF5QixFQUFFLEVBQUU7WUFDOUMsSUFBSSxLQUFtRCxDQUFDO1lBQ3hELElBQUksT0FBTyxFQUFFLFlBQVksRUFBRSxDQUFDO2dCQUMzQixJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMxRCxJQUFJLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztvQkFDOUIsVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7b0JBQ3ZCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO2dCQUVELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDOUIsS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQy9CLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRSxDQUFDO29CQUN6QixLQUFLLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztvQkFDbEIsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1lBRUQsT0FBTyxDQUFDLElBQXlCLEVBQWdCLEVBQUU7Z0JBQ2xELE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUM7Z0JBRXBDLE1BQU0sTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUN4RCxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFekIsSUFBSSxJQUFJLENBQUM7Z0JBQ1QsSUFBSSxRQUFRLENBQUM7Z0JBQ2IsSUFBSSxTQUFTLENBQUM7Z0JBQ2QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ25CLElBQUksUUFBUSxZQUFZLFNBQVMsRUFBRSxDQUFDO3dCQUNuQyxTQUFTLEdBQUcsRUFBRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN4RCxDQUFDO3lCQUNJLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO3dCQUM5QixJQUFJLEdBQUcsUUFBUSxDQUFDO3dCQUNoQixRQUFRLEdBQUcsUUFBUSxDQUFDO29CQUNyQixDQUFDO3lCQUNJLENBQUM7d0JBQ0wsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxHQUFHLFFBQXFDLENBQUMsQ0FBQztvQkFDM0UsQ0FBQztnQkFDRixDQUFDO2dCQUVELElBQUksT0FBTyxDQUFDO2dCQUNaLElBQUksa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ3hELE9BQU8sR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDOUMsQ0FBQztxQkFDSSxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDbEMsT0FBTyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7Z0JBQ3pCLENBQUM7Z0JBQ0QsZ0RBQWdEO2dCQUNoRCxtREFBbUQ7cUJBQzlDLElBQUksa0JBQWtCLENBQUMsZ0JBQWdCLENBQUUsS0FBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQ3JFLE9BQU8sQ0FBQyxJQUFJLENBQUMsdUVBQXVFLENBQUMsQ0FBQztvQkFDdEYsbURBQW1EO29CQUNuRCxPQUFPLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBRSxLQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3RELENBQUM7Z0JBQ0QsbURBQW1EO3FCQUM5QyxJQUFJLFFBQVEsQ0FBRSxLQUFhLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztvQkFDMUMsT0FBTyxDQUFDLElBQUksQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO29CQUN0RixtREFBbUQ7b0JBQ25ELE9BQU8sR0FBSSxLQUFhLENBQUMsTUFBTSxDQUFDO2dCQUNqQyxDQUFDO2dCQUVELE9BQU87b0JBQ04sR0FBRyxLQUFLO29CQUNSLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRSxJQUFJLFNBQVM7b0JBQ3pCLE1BQU0sRUFBRSxNQUFNO29CQUNkLE1BQU0sRUFBRSxNQUFNO29CQUNkLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDMUYsSUFBSSxFQUFFLElBQUk7b0JBQ1YsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLFNBQVMsRUFBRSxTQUFTO29CQUNwQixPQUFPO29CQUNQLHdCQUF3QixFQUFFLElBQUksQ0FBQyx3QkFBd0I7aUJBQ3ZELENBQUM7WUFDSCxDQUFDLENBQUM7UUFDSCxDQUFDLENBQUM7SUFDSCxDQUFDO0lBRU8sNEJBQTRCLENBQUMsUUFBMEIsRUFBRSxTQUE4QjtRQUM5Riw4RUFBOEU7UUFFOUUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELElBQUksUUFBUSxFQUFFLENBQUM7WUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixRQUFRLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxDQUFDLHlCQUF5QixDQUFDO1lBQ3JDLEVBQUUsRUFBRSxRQUFRLENBQUMsRUFBRTtZQUNmLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSztZQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRTFELE9BQU8sWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUN4QixLQUFLLE1BQU0sU0FBUyxJQUFJLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO2dCQUMvRCxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUNyQyxDQUFDO1lBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxNQUFNLENBQUMsMkJBQTJCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRDtBQUVELFNBQVMsU0FBUyxDQUFDLEdBQW9CO0lBQ3RDLE9BQU8sR0FBRyxFQUFFLFFBQVEsRUFBRSxDQUFDO0FBQ3hCLENBQUMifQ==