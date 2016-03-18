-------------------------------------------------------------------
-- Copyright (c) Microsoft Corporation. All rights reserved.
-- Licensed under the MIT License.
-- See License.txt in the project root for license information.
-------------------------------------------------------------------

on run argv
	set command to "cd \"" & argv & "\"; clear" as string

	tell application "iTerm"
		activate

		set myterm to (current terminal)
		tell myterm
			tell (launch session "Default")
				write text command
			end tell
		end tell
	end tell
end run
