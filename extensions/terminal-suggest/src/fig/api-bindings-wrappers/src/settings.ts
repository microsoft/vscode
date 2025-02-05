export enum SETTINGS {
  // Dev settings.
  DEV_MODE = "autocomplete.developerMode",
  DEV_MODE_NPM = "autocomplete.developerModeNPM",
  DEV_MODE_NPM_INVALIDATE_CACHE = "autocomplete.developerModeNPMInvalidateCache",
  DEV_COMPLETIONS_FOLDER = "autocomplete.devCompletionsFolder",
  DEV_COMPLETIONS_SERVER_PORT = "autocomplete.devCompletionsServerPort",

  // Style settings
  WIDTH = "autocomplete.width",
  HEIGHT = "autocomplete.height",
  THEME = "autocomplete.theme",
  USER_STYLES = "autocomplete.userStyles",
  FONT_FAMILY = "autocomplete.fontFamily",
  FONT_SIZE = "autocomplete.fontSize",

  CACHE_ALL_GENERATORS = "beta.autocomplete.auto-cache",
  // Behavior settings
  DISABLE_FOR_COMMANDS = "autocomplete.disableForCommands",
  IMMEDIATELY_EXEC_AFTER_SPACE = "autocomplete.immediatelyExecuteAfterSpace",
  IMMEDIATELY_RUN_DANGEROUS_COMMANDS = "autocomplete.immediatelyRunDangerousCommands",
  IMMEDIATELY_RUN_GIT_ALIAS = "autocomplete.immediatelyRunGitAliases",
  INSERT_SPACE_AUTOMATICALLY = "autocomplete.insertSpaceAutomatically",
  SCROLL_WRAP_AROUND = "autocomplete.scrollWrapAround",
  SORT_METHOD = "autocomplete.sortMethod",
  ALWAYS_SUGGEST_CURRENT_TOKEN = "autocomplete.alwaysSuggestCurrentToken",

  NAVIGATE_TO_HISTORY = "autocomplete.navigateToHistory",
  ONLY_SHOW_ON_TAB = "autocomplete.onlyShowOnTab",
  ALWAYS_SHOW_DESCRIPTION = "autocomplete.alwaysShowDescription",
  HIDE_PREVIEW = "autocomplete.hidePreviewWindow",
  SCRIPT_TIMEOUT = "autocomplete.scriptTimeout",
  PREFER_VERBOSE_SUGGESTIONS = "autocomplete.preferVerboseSuggestions",
  HIDE_AUTO_EXECUTE_SUGGESTION = "autocomplete.hideAutoExecuteSuggestion",

  FUZZY_SEARCH = "autocomplete.fuzzySearch",

  PERSONAL_SHORTCUTS_TOKEN = "autocomplete.personalShortcutsToken",

  DISABLE_HISTORY_LOADING = "autocomplete.history.disableLoading",
  // History settings
  // one of "off", "history_only", "show"
  HISTORY_MODE = "beta.history.mode",
  HISTORY_COMMAND = "beta.history.customCommand",
  HISTORY_MERGE_SHELLS = "beta.history.allShells",
  HISTORY_CTRL_R_TOGGLE = "beta.history.ctrl-r",

  FIRST_COMMAND_COMPLETION = "autocomplete.firstTokenCompletion",

  TELEMETRY_ENABLED = "telemetry.enabled",
}

export type SettingsMap = { [key in SETTINGS]?: unknown };
let settings: SettingsMap = {};

export const updateSettings = (newSettings: SettingsMap) => {
  settings = newSettings;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSetting = <T = unknown>(key: SETTINGS, defaultValue?: any): T =>
  settings[key] ?? defaultValue;

export const getSettings = () => settings;

export function isInDevMode(): boolean {
  return (
    Boolean(getSetting(SETTINGS.DEV_MODE)) ||
    Boolean(getSetting(SETTINGS.DEV_MODE_NPM))
  );
}
