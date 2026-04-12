/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { n } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { AI_STATS_SETTING_ID } from '../settingIds.js';
import { createAiStatsChart } from './aiStatsChart.js';
import './media.css';
let AiStatsStatusBar = class AiStatsStatusBar extends Disposable {
    static { this.hot = createHotClass(this); }
    constructor(_aiStatsFeature, _statusbarService, _commandService, _telemetryService) {
        super();
        this._aiStatsFeature = _aiStatsFeature;
        this._statusbarService = _statusbarService;
        this._commandService = _commandService;
        this._telemetryService = _telemetryService;
        this._register(autorun((reader) => {
            const statusBarItem = this._createStatusBar().keepUpdated(reader.store);
            const store = this._register(new DisposableStore());
            reader.store.add(this._statusbarService.addEntry({
                name: localize('inlineSuggestions', "Inline Suggestions"),
                ariaLabel: localize('inlineSuggestionsStatusBar', "Inline suggestions status bar"),
                text: '',
                tooltip: {
                    element: async (_token) => {
                        this._sendHoverTelemetry();
                        store.clear();
                        const elem = createAiStatsHover({
                            data: this._aiStatsFeature,
                            onOpenSettings: () => openSettingsCommand({ ids: [AI_STATS_SETTING_ID] }).run(this._commandService),
                        });
                        return elem.keepUpdated(store).element;
                    },
                    markdownNotSupportedFallback: undefined,
                },
                content: statusBarItem.element,
            }, 'aiStatsStatusBar', 1 /* StatusbarAlignment.RIGHT */, 100));
        }));
    }
    _sendHoverTelemetry() {
        this._telemetryService.publicLog2('aiStatsStatusBar.hover', {
            aiRate: this._aiStatsFeature.aiRate.get(),
        });
    }
    _createStatusBar() {
        return n.div({
            style: {
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '3px',
                marginRight: '3px',
            }
        }, [
            n.div({
                class: 'ai-stats-status-bar',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    width: 50,
                    height: 6,
                    borderRadius: 6,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                }
            }, [
                n.div({
                    style: {
                        flex: 1,
                        display: 'flex',
                        overflow: 'hidden',
                        borderRadius: 6,
                        border: '1px solid transparent',
                    }
                }, [
                    n.div({
                        style: {
                            width: this._aiStatsFeature.aiRate.map(v => `${v * 100}%`),
                            backgroundColor: 'currentColor',
                        }
                    })
                ])
            ])
        ]);
    }
};
AiStatsStatusBar = __decorate([
    __param(1, IStatusbarService),
    __param(2, ICommandService),
    __param(3, ITelemetryService)
], AiStatsStatusBar);
export { AiStatsStatusBar };
export function createAiStatsHover(options) {
    const chartViewMode = observableValue('chartViewMode', 'days');
    const aiRatePercent = options.data.aiRate.map(r => `${Math.round(r * 100)}%`);
    const createToggleButton = (mode, tooltip, icon) => {
        return derived(reader => {
            const currentMode = chartViewMode.read(reader);
            const isActive = currentMode === mode;
            return n.div({
                class: ['chart-toggle-button', isActive ? 'active' : ''],
                style: {
                    padding: '2px 4px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                onclick: () => {
                    chartViewMode.set(mode, undefined);
                },
                title: tooltip,
            }, [
                n.div({
                    class: ThemeIcon.asClassName(icon),
                    style: { fontSize: '14px' }
                })
            ]);
        });
    };
    return n.div({
        class: 'ai-stats-status-bar',
    }, [
        n.div({
            class: 'header',
            style: {
                minWidth: '280px',
            }
        }, [
            n.div({ style: { flex: 1 } }, [localize('aiStatsStatusBarHeader', "AI Usage Statistics")]),
            n.div({ style: { marginLeft: 'auto' } }, options.onOpenSettings
                ? actionBar([
                    {
                        action: {
                            id: 'aiStats.statusBar.settings',
                            label: '',
                            enabled: true,
                            run: options.onOpenSettings,
                            class: ThemeIcon.asClassName(Codicon.gear),
                            tooltip: localize('aiStats.statusBar.configure', "Configure")
                        },
                        options: { icon: true, label: false, hoverDelegate: nativeHoverDelegate }
                    }
                ])
                : [])
        ]),
        n.div({ style: { display: 'flex' } }, [
            n.div({ style: { flex: 1, paddingRight: '4px' } }, [
                localize('text1', "AI vs Typing Average: {0}", aiRatePercent.get()),
            ]),
        ]),
        n.div({ style: { flex: 1, paddingRight: '4px' } }, [
            localize('text2', "Accepted inline suggestions today: {0}", options.data.acceptedInlineSuggestionsToday.get()),
        ]),
        // Chart section
        n.div({
            style: {
                marginTop: '8px',
                borderTop: '1px solid var(--vscode-widget-border)',
                paddingTop: '8px',
            }
        }, [
            // Chart header with toggle
            n.div({
                class: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '4px',
                }
            }, [
                n.div({ style: { flex: 1 } }, [
                    chartViewMode.map(mode => mode === 'days'
                        ? localize('chartHeaderDays', "AI Rate by Day")
                        : localize('chartHeaderSessions', "AI Rate by Session"))
                ]),
                n.div({
                    class: 'chart-view-toggle',
                    style: { marginLeft: 'auto', display: 'flex', gap: '2px' }
                }, [
                    createToggleButton('days', localize('viewByDays', "Days"), Codicon.calendar),
                    createToggleButton('sessions', localize('viewBySessions', "Sessions"), Codicon.listFlat),
                ])
            ]),
            // Chart container
            derived(reader => {
                const sessions = options.data.sessions.read(reader);
                const viewMode = chartViewMode.read(reader);
                return n.div({
                    ref: (container) => {
                        const chart = createAiStatsChart({
                            sessions,
                            viewMode,
                        });
                        container.appendChild(chart);
                    }
                });
            }),
        ]),
    ]);
}
function actionBar(actions, options) {
    return derived((_reader) => n.div({
        class: [],
        style: {},
        ref: elem => {
            const actionBar = _reader.store.add(new ActionBar(elem, options));
            for (const { action, options } of actions) {
                actionBar.push(action, options);
            }
        }
    }));
}
class CommandWithArgs {
    constructor(commandId, args = []) {
        this.commandId = commandId;
        this.args = args;
    }
    run(commandService) {
        commandService.executeCommand(this.commandId, ...this.args);
    }
}
function openSettingsCommand(options = {}) {
    return new CommandWithArgs('workbench.action.openSettings', [{
            query: options.ids ? options.ids.map(id => `@id:${id}`).join(' ') : undefined,
        }]);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTdGF0c1N0YXR1c0Jhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci9lZGl0U3RhdHMvYWlTdGF0c1N0YXR1c0Jhci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBcUMsTUFBTSx1REFBdUQsQ0FBQztBQUVySCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFzQixNQUFNLHFEQUFxRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRXZELE9BQU8sRUFBaUIsa0JBQWtCLEVBQWdCLE1BQU0sbUJBQW1CLENBQUM7QUFDcEYsT0FBTyxhQUFhLENBQUM7QUFF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