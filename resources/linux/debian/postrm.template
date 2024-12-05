#!/bin/bash
#
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

rm -f /usr/bin/@@NAME@@

# Uninstall the desktop entry
if hash update-desktop-database 2>/dev/null; then
	update-desktop-database
fi

# Update mimetype database for removed workspace mimetype
if hash update-mime-database 2>/dev/null; then
	update-mime-database /usr/share/mime
fi

RET=true
if [ -e '/usr/share/debconf/confmodule' ]; then
	. /usr/share/debconf/confmodule
	db_get @@NAME@@/add-microsoft-repo || true
fi
if [ "$RET" = "true" ]; then
	eval $(apt-config shell APT_SOURCE_PARTS Dir::Etc::sourceparts/d)
	CODE_SOURCE_PART=${APT_SOURCE_PARTS}vscode.list
	rm -f $CODE_SOURCE_PART

	eval $(apt-config shell APT_TRUSTED_PARTS Dir::Etc::trustedparts/d)
	CODE_TRUSTED_PART=${APT_TRUSTED_PARTS}microsoft.gpg
	rm -f $CODE_TRUSTED_PART
fi

if [ "$1" = "purge" ] && [ -e '/usr/share/debconf/confmodule' ]; then
	db_purge
fi
