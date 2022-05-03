# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
if [[ $options[norcs] = off && -o "login" &&  -f $USER_ZDOTDIR/.zlogin ]]; then
	. $USER_ZDOTDIR/.zlogin
fi

# Now that the init script is running, unset ZDOTDIR to ensure ~/.zlogout runs as expected as well
# as prevent problems that may occur if the user's init scripts depend on ZDOTDIR not being set.
builtin unset ZDOTDIR
