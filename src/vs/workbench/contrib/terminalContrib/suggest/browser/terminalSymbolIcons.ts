/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalSymbolIcons.css';
import { SYMBOL_ICON_ENUMERATOR_FOREGROUND, SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND, SYMBOL_ICON_METHOD_FOREGROUND, SYMBOL_ICON_VARIABLE_FOREGROUND, SYMBOL_ICON_FILE_FOREGROUND, SYMBOL_ICON_FOLDER_FOREGROUND } from '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../../base/common/codicons.js';

export const TERMINAL_SYMBOL_ICON_FLAG_FOREGROUND = registerColor('terminalSymbolIcon.flagForeground', SYMBOL_ICON_ENUMERATOR_FOREGROUND, localize('terminalSymbolIcon.flagForeground', 'The foreground color for an flag icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_ALIAS_FOREGROUND = registerColor('terminalSymbolIcon.aliasForeground', SYMBOL_ICON_METHOD_FOREGROUND, localize('terminalSymbolIcon.aliasForeground', 'The foreground color for an alias icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_OPTION_VALUE_FOREGROUND = registerColor('terminalSymbolIcon.optionValueForeground', SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND, localize('terminalSymbolIcon.enumMemberForeground', 'The foreground color for an enum member icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_METHOD_FOREGROUND = registerColor('terminalSymbolIcon.methodForeground', SYMBOL_ICON_METHOD_FOREGROUND, localize('terminalSymbolIcon.methodForeground', 'The foreground color for a method icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_ARGUMENT_FOREGROUND = registerColor('terminalSymbolIcon.argumentForeground', SYMBOL_ICON_VARIABLE_FOREGROUND, localize('terminalSymbolIcon.argumentForeground', 'The foreground color for an argument icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_OPTION_FOREGROUND = registerColor('terminalSymbolIcon.optionForeground', SYMBOL_ICON_ENUMERATOR_FOREGROUND, localize('terminalSymbolIcon.optionForeground', 'The foreground color for an option icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_INLINE_SUGGESTION_FOREGROUND = registerColor('terminalSymbolIcon.inlineSuggestionForeground', null, localize('terminalSymbolIcon.inlineSuggestionForeground', 'The foreground color for an inline suggestion icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_FILE_FOREGROUND = registerColor('terminalSymbolIcon.fileForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.fileForeground', 'The foreground color for a file icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_FOLDER_FOREGROUND = registerColor('terminalSymbolIcon.folderForeground', SYMBOL_ICON_FOLDER_FOREGROUND, localize('terminalSymbolIcon.folderForeground', 'The foreground color for a folder icon. These icons will appear in the terminal suggest widget.'));

export const TERMINAL_SYMBOL_ICON_COMMIT_FOREGROUND = registerColor('terminalSymbolIcon.commitForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.commitForeground', 'The foreground color for a commit icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_BRANCH_FOREGROUND = registerColor('terminalSymbolIcon.branchForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.branchForeground', 'The foreground color for a branch icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_TAG_FOREGROUND = registerColor('terminalSymbolIcon.tagForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.tagForeground', 'The foreground color for a tag icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_STASH_FOREGROUND = registerColor('terminalSymbolIcon.stashForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.stashForeground', 'The foreground color for a stash icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_REMOTE_FOREGROUND = registerColor('terminalSymbolIcon.remoteForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.remoteForeground', 'The foreground color for a remote icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_PULL_REQUEST_FOREGROUND = registerColor('terminalSymbolIcon.pullRequestForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.pullRequestForeground', 'The foreground color for a pull request icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_PULL_REQUEST_DONE_FOREGROUND = registerColor('terminalSymbolIcon.pullRequestDoneForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.pullRequestDoneForeground', 'The foreground color for a completed pull request icon. These icons will appear in the terminal suggest widget.'));

export const TERMINAL_SYMBOL_ICON_SYMBOLIC_LINK_FILE_FOREGROUND = registerColor('terminalSymbolIcon.symbolicLinkFileForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.symbolicLinkFileForeground', 'The foreground color for a symbolic link file icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_SYMBOLIC_LINK_FOLDER_FOREGROUND = registerColor('terminalSymbolIcon.symbolicLinkFolderForeground', SYMBOL_ICON_FOLDER_FOREGROUND, localize('terminalSymbolIcon.symbolicLinkFolderForeground', 'The foreground color for a symbolic link folder icon. These icons will appear in the terminal suggest widget.'));

export const TERMINAL_SYMBOL_ICON_SYMBOL_TEXT_FOREGROUND = registerColor('terminalSymbolIcon.symbolText', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.symbolTextForeground', 'The foreground color for a plaintext suggestion. These icons will appear in the terminal suggest widget.'));

export const terminalSymbolFlagIcon = registerIcon('terminal-symbol-flag', Codicon.flag, localize('terminalSymbolFlagIcon', 'Icon for flags in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FLAG_FOREGROUND);
export const terminalSymbolAliasIcon = registerIcon('terminal-symbol-alias', Codicon.symbolMethod, localize('terminalSymbolAliasIcon', 'Icon for aliases in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_ALIAS_FOREGROUND);
export const terminalSymbolEnumMember = registerIcon('terminal-symbol-option-value', Codicon.symbolEnumMember, localize('terminalSymbolOptionValue', 'Icon for enum members in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_OPTION_VALUE_FOREGROUND);
export const terminalSymbolMethodIcon = registerIcon('terminal-symbol-method', Codicon.symbolMethod, localize('terminalSymbolMethodIcon', 'Icon for methods in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_METHOD_FOREGROUND);
export const terminalSymbolArgumentIcon = registerIcon('terminal-symbol-argument', Codicon.symbolVariable, localize('terminalSymbolArgumentIcon', 'Icon for arguments in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_ARGUMENT_FOREGROUND);
export const terminalSymbolOptionIcon = registerIcon('terminal-symbol-option', Codicon.symbolEnum, localize('terminalSymbolOptionIcon', 'Icon for options in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_OPTION_FOREGROUND);
export const terminalSymbolInlineSuggestionIcon = registerIcon('terminal-symbol-inline-suggestion', Codicon.star, localize('terminalSymbolInlineSuggestionIcon', 'Icon for inline suggestions in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_INLINE_SUGGESTION_FOREGROUND);
export const terminalSymbolFileIcon = registerIcon('terminal-symbol-file', Codicon.symbolFile, localize('terminalSymbolFileIcon', 'Icon for files in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FILE_FOREGROUND);
export const terminalSymbolFolderIcon = registerIcon('terminal-symbol-folder', Codicon.symbolFolder, localize('terminalSymbolFolderIcon', 'Icon for folders in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FOLDER_FOREGROUND);

export const terminalSymbolCommitIcon = registerIcon('terminal-symbol-commit', Codicon.gitCommit, localize('terminalSymbolCommitIcon', 'Icon for commits in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_COMMIT_FOREGROUND);
export const terminalSymbolBranchIcon = registerIcon('terminal-symbol-branch', Codicon.gitBranch, localize('terminalSymbolBranchIcon', 'Icon for branches in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_BRANCH_FOREGROUND);
export const terminalSymbolTagIcon = registerIcon('terminal-symbol-tag', Codicon.tag, localize('terminalSymbolTagIcon', 'Icon for tags in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_TAG_FOREGROUND);
export const terminalSymbolStashIcon = registerIcon('terminal-symbol-stash', Codicon.gitStash, localize('terminalSymbolStashIcon', 'Icon for stashes in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_STASH_FOREGROUND);
export const terminalSymbolRemoteIcon = registerIcon('terminal-symbol-remote', Codicon.remote, localize('terminalSymbolRemoteIcon', 'Icon for remotes in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_REMOTE_FOREGROUND);
export const terminalSymbolPullRequestIcon = registerIcon('terminal-symbol-pull-request', Codicon.gitPullRequest, localize('terminalSymbolPullRequestIcon', 'Icon for pull requests in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_PULL_REQUEST_FOREGROUND);
export const terminalSymbolPullRequestDoneIcon = registerIcon('terminal-symbol-pull-request-done', Codicon.gitPullRequestDone, localize('terminalSymbolPullRequestDoneIcon', 'Icon for completed pull requests in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_PULL_REQUEST_DONE_FOREGROUND);

export const terminalSymbolSymbolicLinkFileIcon = registerIcon('terminal-symbol-symbolic-link-file', Codicon.fileSymlinkFile, localize('terminalSymbolSymbolicLinkFileIcon', 'Icon for symbolic link files in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_SYMBOLIC_LINK_FILE_FOREGROUND);
export const terminalSymbolSymbolicLinkFolderIcon = registerIcon('terminal-symbol-symbolic-link-folder', Codicon.fileSymlinkDirectory, localize('terminalSymbolSymbolicLinkFolderIcon', 'Icon for symbolic link folders in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_SYMBOLIC_LINK_FOLDER_FOREGROUND);

export const terminalSymbolSymbolTextIcon = registerIcon('terminal-symbol-symbol-text', Codicon.symbolKey, localize('terminalSymbolSymboTextIcon', 'Icon for plain text suggestions in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_SYMBOL_TEXT_FOREGROUND);
