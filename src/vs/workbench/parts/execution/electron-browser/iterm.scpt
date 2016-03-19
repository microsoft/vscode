-------------------------------------------------------------------
-- Copyright (c) Microsoft Corporation. All rights reserved.
-- Licensed under the MIT License.
-- See License.txt in the project root for license information.
-------------------------------------------------------------------

on run argv
	set command to "cd \"" & argv & "\"; clear" as string

	tell application "iTerm"
		activate

		if (count terminal) = 0 then
			set myterm to (make new terminal)
		else
			set myterm to (current terminal)
		end if

		tell myterm
			tell (launch session "Default")
				write text command
			end tell
		end tell
	end tell
end run
