# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
VSCODE_ZDOTDIR=$ZDOTDIR
if [[ -f ~/.zshenv ]]; then
	. ~/.zshenv
fi
if [[ "$ZDOTDIR" != "$VSCODE_ZDOTDIR" ]]; then
	USER_ZDOTDIR=$ZDOTDIR
	ZDOTDIR=$VSCODE_ZDOTDIR
else
	USER_ZDOTDIR=$HOME
fi
