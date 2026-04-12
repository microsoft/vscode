/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
export var TerminalSettingPrefix;
(function (TerminalSettingPrefix) {
    TerminalSettingPrefix["AutomationProfile"] = "terminal.integrated.automationProfile.";
    TerminalSettingPrefix["DefaultProfile"] = "terminal.integrated.defaultProfile.";
    TerminalSettingPrefix["Profiles"] = "terminal.integrated.profiles.";
})(TerminalSettingPrefix || (TerminalSettingPrefix = {}));
export var TerminalSettingId;
(function (TerminalSettingId) {
    TerminalSettingId["SendKeybindingsToShell"] = "terminal.integrated.sendKeybindingsToShell";
    TerminalSettingId["AutomationProfileLinux"] = "terminal.integrated.automationProfile.linux";
    TerminalSettingId["AutomationProfileMacOs"] = "terminal.integrated.automationProfile.osx";
    TerminalSettingId["AutomationProfileWindows"] = "terminal.integrated.automationProfile.windows";
    TerminalSettingId["ProfilesWindows"] = "terminal.integrated.profiles.windows";
    TerminalSettingId["ProfilesMacOs"] = "terminal.integrated.profiles.osx";
    TerminalSettingId["ProfilesLinux"] = "terminal.integrated.profiles.linux";
    TerminalSettingId["DefaultProfileLinux"] = "terminal.integrated.defaultProfile.linux";
    TerminalSettingId["DefaultProfileMacOs"] = "terminal.integrated.defaultProfile.osx";
    TerminalSettingId["DefaultProfileWindows"] = "terminal.integrated.defaultProfile.windows";
    TerminalSettingId["UseWslProfiles"] = "terminal.integrated.useWslProfiles";
    TerminalSettingId["TabsDefaultColor"] = "terminal.integrated.tabs.defaultColor";
    TerminalSettingId["TabsDefaultIcon"] = "terminal.integrated.tabs.defaultIcon";
    TerminalSettingId["TabsEnabled"] = "terminal.integrated.tabs.enabled";
    TerminalSettingId["TabsEnableAnimation"] = "terminal.integrated.tabs.enableAnimation";
    TerminalSettingId["TabsHideCondition"] = "terminal.integrated.tabs.hideCondition";
    TerminalSettingId["TabsShowActiveTerminal"] = "terminal.integrated.tabs.showActiveTerminal";
    TerminalSettingId["TabsShowActions"] = "terminal.integrated.tabs.showActions";
    TerminalSettingId["TabsLocation"] = "terminal.integrated.tabs.location";
    TerminalSettingId["TabsFocusMode"] = "terminal.integrated.tabs.focusMode";
    TerminalSettingId["MacOptionIsMeta"] = "terminal.integrated.macOptionIsMeta";
    TerminalSettingId["MacOptionClickForcesSelection"] = "terminal.integrated.macOptionClickForcesSelection";
    TerminalSettingId["AltClickMovesCursor"] = "terminal.integrated.altClickMovesCursor";
    TerminalSettingId["CopyOnSelection"] = "terminal.integrated.copyOnSelection";
    TerminalSettingId["EnableMultiLinePasteWarning"] = "terminal.integrated.enableMultiLinePasteWarning";
    TerminalSettingId["DrawBoldTextInBrightColors"] = "terminal.integrated.drawBoldTextInBrightColors";
    TerminalSettingId["FontFamily"] = "terminal.integrated.fontFamily";
    TerminalSettingId["FontSize"] = "terminal.integrated.fontSize";
    TerminalSettingId["LetterSpacing"] = "terminal.integrated.letterSpacing";
    TerminalSettingId["LineHeight"] = "terminal.integrated.lineHeight";
    TerminalSettingId["MinimumContrastRatio"] = "terminal.integrated.minimumContrastRatio";
    TerminalSettingId["TabStopWidth"] = "terminal.integrated.tabStopWidth";
    TerminalSettingId["FastScrollSensitivity"] = "terminal.integrated.fastScrollSensitivity";
    TerminalSettingId["MouseWheelScrollSensitivity"] = "terminal.integrated.mouseWheelScrollSensitivity";
    TerminalSettingId["BellDuration"] = "terminal.integrated.bellDuration";
    TerminalSettingId["FontWeight"] = "terminal.integrated.fontWeight";
    TerminalSettingId["FontWeightBold"] = "terminal.integrated.fontWeightBold";
    TerminalSettingId["CursorBlinking"] = "terminal.integrated.cursorBlinking";
    TerminalSettingId["TextBlinking"] = "terminal.integrated.textBlinking";
    TerminalSettingId["CursorStyle"] = "terminal.integrated.cursorStyle";
    TerminalSettingId["CursorStyleInactive"] = "terminal.integrated.cursorStyleInactive";
    TerminalSettingId["CursorWidth"] = "terminal.integrated.cursorWidth";
    TerminalSettingId["Scrollback"] = "terminal.integrated.scrollback";
    TerminalSettingId["DetectLocale"] = "terminal.integrated.detectLocale";
    TerminalSettingId["DefaultLocation"] = "terminal.integrated.defaultLocation";
    TerminalSettingId["GpuAcceleration"] = "terminal.integrated.gpuAcceleration";
    TerminalSettingId["TerminalTitleSeparator"] = "terminal.integrated.tabs.separator";
    TerminalSettingId["TerminalTitle"] = "terminal.integrated.tabs.title";
    TerminalSettingId["TerminalDescription"] = "terminal.integrated.tabs.description";
    TerminalSettingId["RightClickBehavior"] = "terminal.integrated.rightClickBehavior";
    TerminalSettingId["MiddleClickBehavior"] = "terminal.integrated.middleClickBehavior";
    TerminalSettingId["Cwd"] = "terminal.integrated.cwd";
    TerminalSettingId["ConfirmOnExit"] = "terminal.integrated.confirmOnExit";
    TerminalSettingId["ConfirmOnKill"] = "terminal.integrated.confirmOnKill";
    TerminalSettingId["EnableBell"] = "terminal.integrated.enableBell";
    TerminalSettingId["EnableVisualBell"] = "terminal.integrated.enableVisualBell";
    TerminalSettingId["CommandsToSkipShell"] = "terminal.integrated.commandsToSkipShell";
    TerminalSettingId["AllowChords"] = "terminal.integrated.allowChords";
    TerminalSettingId["AllowMnemonics"] = "terminal.integrated.allowMnemonics";
    TerminalSettingId["TabFocusMode"] = "terminal.integrated.tabFocusMode";
    TerminalSettingId["EnvMacOs"] = "terminal.integrated.env.osx";
    TerminalSettingId["EnvLinux"] = "terminal.integrated.env.linux";
    TerminalSettingId["EnvWindows"] = "terminal.integrated.env.windows";
    TerminalSettingId["EnvironmentChangesRelaunch"] = "terminal.integrated.environmentChangesRelaunch";
    TerminalSettingId["ShowExitAlert"] = "terminal.integrated.showExitAlert";
    TerminalSettingId["SplitCwd"] = "terminal.integrated.splitCwd";
    TerminalSettingId["WindowsUseConptyDll"] = "terminal.integrated.windowsUseConptyDll";
    TerminalSettingId["WordSeparators"] = "terminal.integrated.wordSeparators";
    TerminalSettingId["EnableFileLinks"] = "terminal.integrated.enableFileLinks";
    TerminalSettingId["AllowedLinkSchemes"] = "terminal.integrated.allowedLinkSchemes";
    TerminalSettingId["UnicodeVersion"] = "terminal.integrated.unicodeVersion";
    TerminalSettingId["EnablePersistentSessions"] = "terminal.integrated.enablePersistentSessions";
    TerminalSettingId["PersistentSessionReviveProcess"] = "terminal.integrated.persistentSessionReviveProcess";
    TerminalSettingId["HideOnStartup"] = "terminal.integrated.hideOnStartup";
    TerminalSettingId["HideOnLastClosed"] = "terminal.integrated.hideOnLastClosed";
    TerminalSettingId["CustomGlyphs"] = "terminal.integrated.customGlyphs";
    TerminalSettingId["RescaleOverlappingGlyphs"] = "terminal.integrated.rescaleOverlappingGlyphs";
    TerminalSettingId["PersistentSessionScrollback"] = "terminal.integrated.persistentSessionScrollback";
    TerminalSettingId["InheritEnv"] = "terminal.integrated.inheritEnv";
    TerminalSettingId["ShowLinkHover"] = "terminal.integrated.showLinkHover";
    TerminalSettingId["IgnoreProcessNames"] = "terminal.integrated.ignoreProcessNames";
    TerminalSettingId["ShellIntegrationEnabled"] = "terminal.integrated.shellIntegration.enabled";
    TerminalSettingId["ShellIntegrationShowWelcome"] = "terminal.integrated.shellIntegration.showWelcome";
    TerminalSettingId["ShellIntegrationDecorationsEnabled"] = "terminal.integrated.shellIntegration.decorationsEnabled";
    TerminalSettingId["ShellIntegrationTimeout"] = "terminal.integrated.shellIntegration.timeout";
    TerminalSettingId["ShellIntegrationQuickFixEnabled"] = "terminal.integrated.shellIntegration.quickFixEnabled";
    TerminalSettingId["ShellIntegrationEnvironmentReporting"] = "terminal.integrated.shellIntegration.environmentReporting";
    TerminalSettingId["EnableImages"] = "terminal.integrated.enableImages";
    TerminalSettingId["SmoothScrolling"] = "terminal.integrated.smoothScrolling";
    TerminalSettingId["IgnoreBracketedPasteMode"] = "terminal.integrated.ignoreBracketedPasteMode";
    TerminalSettingId["FocusAfterRun"] = "terminal.integrated.focusAfterRun";
    TerminalSettingId["FontLigaturesEnabled"] = "terminal.integrated.fontLigatures.enabled";
    TerminalSettingId["FontLigaturesFeatureSettings"] = "terminal.integrated.fontLigatures.featureSettings";
    TerminalSettingId["FontLigaturesFallbackLigatures"] = "terminal.integrated.fontLigatures.fallbackLigatures";
    TerminalSettingId["EnableKittyKeyboardProtocol"] = "terminal.integrated.enableKittyKeyboardProtocol";
    TerminalSettingId["EnableWin32InputMode"] = "terminal.integrated.enableWin32InputMode";
    TerminalSettingId["AllowInUntrustedWorkspace"] = "terminal.integrated.allowInUntrustedWorkspace";
    // Developer/debug settings
    /** Simulated latency applied to all calls made to the pty host */
    TerminalSettingId["DeveloperPtyHostLatency"] = "terminal.integrated.developer.ptyHost.latency";
    /** Simulated startup delay of the pty host process */
    TerminalSettingId["DeveloperPtyHostStartupDelay"] = "terminal.integrated.developer.ptyHost.startupDelay";
    /** Shows the textarea element */
    TerminalSettingId["DevMode"] = "terminal.integrated.developer.devMode";
})(TerminalSettingId || (TerminalSettingId = {}));
export var PosixShellType;
(function (PosixShellType) {
    PosixShellType["Bash"] = "bash";
    PosixShellType["Fish"] = "fish";
    PosixShellType["Sh"] = "sh";
    PosixShellType["Csh"] = "csh";
    PosixShellType["Ksh"] = "ksh";
    PosixShellType["Zsh"] = "zsh";
})(PosixShellType || (PosixShellType = {}));
export var WindowsShellType;
(function (WindowsShellType) {
    WindowsShellType["CommandPrompt"] = "cmd";
    WindowsShellType["Wsl"] = "wsl";
    WindowsShellType["GitBash"] = "gitbash";
})(WindowsShellType || (WindowsShellType = {}));
export var GeneralShellType;
(function (GeneralShellType) {
    GeneralShellType["PowerShell"] = "pwsh";
    GeneralShellType["Python"] = "python";
    GeneralShellType["Julia"] = "julia";
    GeneralShellType["NuShell"] = "nu";
    GeneralShellType["Node"] = "node";
    GeneralShellType["Xonsh"] = "xonsh";
})(GeneralShellType || (GeneralShellType = {}));
export var TitleEventSource;
(function (TitleEventSource) {
    /** From the API or the rename command that overrides any other type */
    TitleEventSource[TitleEventSource["Api"] = 0] = "Api";
    /** From the process name property*/
    TitleEventSource[TitleEventSource["Process"] = 1] = "Process";
    /** From the VT sequence */
    TitleEventSource[TitleEventSource["Sequence"] = 2] = "Sequence";
    /** Config changed */
    TitleEventSource[TitleEventSource["Config"] = 3] = "Config";
})(TitleEventSource || (TitleEventSource = {}));
export var TerminalIpcChannels;
(function (TerminalIpcChannels) {
    /**
     * Communicates between the renderer process and shared process.
     */
    TerminalIpcChannels["LocalPty"] = "localPty";
    /**
     * Communicates between the shared process and the pty host process.
     */
    TerminalIpcChannels["PtyHost"] = "ptyHost";
    /**
     * Communicates between the renderer process and the pty host process.
     */
    TerminalIpcChannels["PtyHostWindow"] = "ptyHostWindow";
    /**
     * Deals with logging from the pty host process.
     */
    TerminalIpcChannels["Logger"] = "logger";
    /**
     * Enables the detection of unresponsive pty hosts.
     */
    TerminalIpcChannels["Heartbeat"] = "heartbeat";
})(TerminalIpcChannels || (TerminalIpcChannels = {}));
export var ProcessPropertyType;
(function (ProcessPropertyType) {
    ProcessPropertyType["Cwd"] = "cwd";
    ProcessPropertyType["InitialCwd"] = "initialCwd";
    ProcessPropertyType["FixedDimensions"] = "fixedDimensions";
    ProcessPropertyType["Title"] = "title";
    ProcessPropertyType["ShellType"] = "shellType";
    ProcessPropertyType["HasChildProcesses"] = "hasChildProcesses";
    ProcessPropertyType["ResolvedShellLaunchConfig"] = "resolvedShellLaunchConfig";
    ProcessPropertyType["OverrideDimensions"] = "overrideDimensions";
    ProcessPropertyType["FailedShellIntegrationActivation"] = "failedShellIntegrationActivation";
    ProcessPropertyType["UsedShellIntegrationInjection"] = "usedShellIntegrationInjection";
    ProcessPropertyType["ShellIntegrationInjectionFailureReason"] = "shellIntegrationInjectionFailureReason";
})(ProcessPropertyType || (ProcessPropertyType = {}));
export const IPtyService = createDecorator('ptyService');
export var HeartbeatConstants;
(function (HeartbeatConstants) {
    /**
     * The duration between heartbeats
     */
    HeartbeatConstants[HeartbeatConstants["BeatInterval"] = 5000] = "BeatInterval";
    /**
     * The duration of the first heartbeat while the pty host is starting up. This is much larger
     * than the regular BeatInterval to accommodate slow machines, we still want to warn about the
     * pty host's unresponsiveness eventually though.
     */
    HeartbeatConstants[HeartbeatConstants["ConnectingBeatInterval"] = 20000] = "ConnectingBeatInterval";
    /**
     * Defines a multiplier for BeatInterval for how long to wait before starting the second wait
     * timer.
     */
    HeartbeatConstants[HeartbeatConstants["FirstWaitMultiplier"] = 1.2] = "FirstWaitMultiplier";
    /**
     * Defines a multiplier for BeatInterval for how long to wait before telling the user about
     * non-responsiveness. The second timer is to avoid informing the user incorrectly when waking
     * the computer up from sleep
     */
    HeartbeatConstants[HeartbeatConstants["SecondWaitMultiplier"] = 1] = "SecondWaitMultiplier";
    /**
     * How long to wait before telling the user about non-responsiveness when they try to create a
     * process. This short circuits the standard wait timeouts to tell the user sooner and only
     * create process is handled to avoid additional perf overhead.
     */
    HeartbeatConstants[HeartbeatConstants["CreateProcessTimeout"] = 5000] = "CreateProcessTimeout";
})(HeartbeatConstants || (HeartbeatConstants = {}));
export var TerminalLocation;
(function (TerminalLocation) {
    TerminalLocation[TerminalLocation["Panel"] = 1] = "Panel";
    TerminalLocation[TerminalLocation["Editor"] = 2] = "Editor";
})(TerminalLocation || (TerminalLocation = {}));
export var TerminalLocationConfigValue;
(function (TerminalLocationConfigValue) {
    TerminalLocationConfigValue["TerminalView"] = "view";
    TerminalLocationConfigValue["Editor"] = "editor";
})(TerminalLocationConfigValue || (TerminalLocationConfigValue = {}));
export var LocalReconnectConstants;
(function (LocalReconnectConstants) {
    /**
     * If there is no reconnection within this time-frame, consider the connection permanently closed...
    */
    LocalReconnectConstants[LocalReconnectConstants["GraceTime"] = 60000] = "GraceTime";
    /**
     * Maximal grace time between the first and the last reconnection...
    */
    LocalReconnectConstants[LocalReconnectConstants["ShortGraceTime"] = 6000] = "ShortGraceTime";
})(LocalReconnectConstants || (LocalReconnectConstants = {}));
export var FlowControlConstants;
(function (FlowControlConstants) {
    /**
     * The number of _unacknowledged_ chars to have been sent before the pty is paused in order for
     * the client to catch up.
     */
    FlowControlConstants[FlowControlConstants["HighWatermarkChars"] = 100000] = "HighWatermarkChars";
    /**
     * After flow control pauses the pty for the client the catch up, this is the number of
     * _unacknowledged_ chars to have been caught up to on the client before resuming the pty again.
     * This is used to attempt to prevent pauses in the flowing data; ideally while the pty is
     * paused the number of unacknowledged chars would always be greater than 0 or the client will
     * appear to stutter. In reality this balance is hard to accomplish though so heavy commands
     * will likely pause as latency grows, not flooding the connection is the important thing as
     * it's shared with other core functionality.
     */
    FlowControlConstants[FlowControlConstants["LowWatermarkChars"] = 5000] = "LowWatermarkChars";
    /**
     * The number characters that are accumulated on the client side before sending an ack event.
     * This must be less than or equal to LowWatermarkChars or the terminal max never unpause.
     */
    FlowControlConstants[FlowControlConstants["CharCountAckSize"] = 5000] = "CharCountAckSize";
})(FlowControlConstants || (FlowControlConstants = {}));
export var ProfileSource;
(function (ProfileSource) {
    ProfileSource["GitBash"] = "Git Bash";
    ProfileSource["Pwsh"] = "PowerShell";
})(ProfileSource || (ProfileSource = {}));
export var ShellIntegrationStatus;
(function (ShellIntegrationStatus) {
    /** No shell integration sequences have been encountered. */
    ShellIntegrationStatus[ShellIntegrationStatus["Off"] = 0] = "Off";
    /** Final term shell integration sequences have been encountered. */
    ShellIntegrationStatus[ShellIntegrationStatus["FinalTerm"] = 1] = "FinalTerm";
    /** VS Code shell integration sequences have been encountered. Supercedes FinalTerm. */
    ShellIntegrationStatus[ShellIntegrationStatus["VSCode"] = 2] = "VSCode";
})(ShellIntegrationStatus || (ShellIntegrationStatus = {}));
export var ShellIntegrationInjectionFailureReason;
(function (ShellIntegrationInjectionFailureReason) {
    /**
     * The setting is disabled.
     */
    ShellIntegrationInjectionFailureReason["InjectionSettingDisabled"] = "injectionSettingDisabled";
    /**
     * There is no executable (so there's no way to determine how to inject).
     */
    ShellIntegrationInjectionFailureReason["NoExecutable"] = "noExecutable";
    /**
     * It's a feature terminal (tasks, debug), unless it's explicitly being forced.
     */
    ShellIntegrationInjectionFailureReason["FeatureTerminal"] = "featureTerminal";
    /**
     * The ignoreShellIntegration flag is passed (eg. relaunching without shell integration).
     */
    ShellIntegrationInjectionFailureReason["IgnoreShellIntegrationFlag"] = "ignoreShellIntegrationFlag";
    /**
     * Shell integration doesn't work on older Windows builds that don't support ConPTY.
     */
    ShellIntegrationInjectionFailureReason["UnsupportedWindowsBuild"] = "unsupportedWindowsBuild";
    /**
     * We're conservative whether we inject when we don't recognize the arguments used for the
     * shell as we would prefer launching one without shell integration than breaking their profile.
     */
    ShellIntegrationInjectionFailureReason["UnsupportedArgs"] = "unsupportedArgs";
    /**
     * The shell doesn't have built-in shell integration. Note that this doesn't mean the shell
     * won't have shell integration in the end.
     */
    ShellIntegrationInjectionFailureReason["UnsupportedShell"] = "unsupportedShell";
    /**
     * For zsh, we failed to set the sticky bit on the shell integration script folder.
     */
    ShellIntegrationInjectionFailureReason["FailedToSetStickyBit"] = "failedToSetStickyBit";
    /**
     * For zsh, we failed to create a temp directory for the shell integration script.
     */
    ShellIntegrationInjectionFailureReason["FailedToCreateTmpDir"] = "failedToCreateTmpDir";
})(ShellIntegrationInjectionFailureReason || (ShellIntegrationInjectionFailureReason = {}));
export var ShellIntegrationTimeoutOverride;
(function (ShellIntegrationTimeoutOverride) {
    ShellIntegrationTimeoutOverride[ShellIntegrationTimeoutOverride["DisableForTests"] = -2] = "DisableForTests";
})(ShellIntegrationTimeoutOverride || (ShellIntegrationTimeoutOverride = {}));
export var TerminalExitReason;
(function (TerminalExitReason) {
    TerminalExitReason[TerminalExitReason["Unknown"] = 0] = "Unknown";
    TerminalExitReason[TerminalExitReason["Shutdown"] = 1] = "Shutdown";
    TerminalExitReason[TerminalExitReason["Process"] = 2] = "Process";
    TerminalExitReason[TerminalExitReason["User"] = 3] = "User";
    TerminalExitReason[TerminalExitReason["Extension"] = 4] = "Extension";
})(TerminalExitReason || (TerminalExitReason = {}));
export const TerminalExtensions = {
    Backend: 'workbench.contributions.terminal.processBackend'
};
class TerminalBackendRegistry {
    constructor() {
        this._backends = new Map();
    }
    get backends() { return this._backends; }
    registerTerminalBackend(backend) {
        const key = this._sanitizeRemoteAuthority(backend.remoteAuthority);
        if (this._backends.has(key)) {
            throw new Error(`A terminal backend with remote authority '${key}' was already registered.`);
        }
        this._backends.set(key, backend);
    }
    getTerminalBackend(remoteAuthority) {
        return this._backends.get(this._sanitizeRemoteAuthority(remoteAuthority));
    }
    _sanitizeRemoteAuthority(remoteAuthority) {
        // Normalize the key to lowercase as the authority is case-insensitive
        return remoteAuthority?.toLowerCase() ?? '';
    }
}
Registry.add(TerminalExtensions.Backend, new TerminalBackendRegistry());
export const ILocalPtyService = createDecorator('localPtyService');
export const ITerminalLogService = createDecorator('terminalLogService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBTTlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQU83RCxNQUFNLENBQU4sSUFBa0IscUJBSWpCO0FBSkQsV0FBa0IscUJBQXFCO0lBQ3RDLHFGQUE0RCxDQUFBO0lBQzVELCtFQUFzRCxDQUFBO0lBQ3RELG1FQUEwQyxDQUFBO0FBQzNDLENBQUMsRUFKaUIscUJBQXFCLEtBQXJCLHFCQUFxQixRQUl0QztBQUVELE1BQU0sQ0FBTixJQUFrQixpQkEyR2pCO0FBM0dELFdBQWtCLGlCQUFpQjtJQUNsQywwRkFBcUUsQ0FBQTtJQUNyRSwyRkFBc0UsQ0FBQTtJQUN0RSx5RkFBb0UsQ0FBQTtJQUNwRSwrRkFBMEUsQ0FBQTtJQUMxRSw2RUFBd0QsQ0FBQTtJQUN4RCx1RUFBa0QsQ0FBQTtJQUNsRCx5RUFBb0QsQ0FBQTtJQUNwRCxxRkFBZ0UsQ0FBQTtJQUNoRSxtRkFBOEQsQ0FBQTtJQUM5RCx5RkFBb0UsQ0FBQTtJQUNwRSwwRUFBcUQsQ0FBQTtJQUNyRCwrRUFBMEQsQ0FBQTtJQUMxRCw2RUFBd0QsQ0FBQTtJQUN4RCxxRUFBZ0QsQ0FBQTtJQUNoRCxxRkFBZ0UsQ0FBQTtJQUNoRSxpRkFBNEQsQ0FBQTtJQUM1RCwyRkFBc0UsQ0FBQTtJQUN0RSw2RUFBd0QsQ0FBQTtJQUN4RCx1RUFBa0QsQ0FBQTtJQUNsRCx5RUFBb0QsQ0FBQTtJQUNwRCw0RUFBdUQsQ0FBQTtJQUN2RCx3R0FBbUYsQ0FBQTtJQUNuRixvRkFBK0QsQ0FBQTtJQUMvRCw0RUFBdUQsQ0FBQTtJQUN2RCxvR0FB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