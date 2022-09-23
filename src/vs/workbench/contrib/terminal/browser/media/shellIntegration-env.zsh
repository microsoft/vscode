# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
if [[ -f $USER_ZDOTDIR/.zshenv ]]; then
	VSCODE_ZDOTDIR=$ZDOTDIR
	ZDOTDIR=$USER_ZDOTDIR

	. $USER_ZDOTDIR/.zshenv

	USER_ZDOTDIR=$ZDOTDIR
	ZDOTDIR=$VSCODE_ZDOTDIR
fi
