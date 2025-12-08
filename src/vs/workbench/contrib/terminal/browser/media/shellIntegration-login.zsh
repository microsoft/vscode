# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

ZDOTDIR=$USER_ZDOTDIR
if [[ $options[norcs] = off && -o "login" &&  -f $ZDOTDIR/.zlogin ]]; then
	. $ZDOTDIR/.zlogin
fi
