# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
VSCODE_ZDOTDIR=$ZDOTDIR
if [[ -f $USER_ZDOTDIR/.zshenv ]]; then
	ZDOTDIR=$USER_ZDOTDIR
	. $USER_ZDOTDIR/.zshenv
elif [[ -f ~/.zshenv ]]; then
	ZDOTDIR=~
	. ~/.zshenv
fi
ZDOTDIR=$VSCODE_ZDOTDIR
