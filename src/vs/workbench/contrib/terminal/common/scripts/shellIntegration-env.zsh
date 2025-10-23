# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
if [[ -f $USER_ZDOTDIR/.zshenv ]]; then
	VSCODE_ZDOTDIR=$ZDOTDIR
	ZDOTDIR=$USER_ZDOTDIR

	# prevent recursion
	if [[ $USER_ZDOTDIR != $VSCODE_ZDOTDIR ]]; then
		. $USER_ZDOTDIR/.zshenv
	fi

	USER_ZDOTDIR=$ZDOTDIR
	ZDOTDIR=$VSCODE_ZDOTDIR
fi
