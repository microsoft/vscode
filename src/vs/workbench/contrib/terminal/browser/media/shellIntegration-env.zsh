# ---------------------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------

if [[ $options[norcs] = off && -o "login" &&  -f ~/.zshenv ]]; then
	. ~/.zshenv
fi
