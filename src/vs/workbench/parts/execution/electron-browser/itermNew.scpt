-------------------------------------------------------------------
-- Copyright (c) Microsoft Corporation. All rights reserved.
-- Licensed under the MIT License.
-- See License.txt in the project root for license information.
-------------------------------------------------------------------

on run argv
	set command to "cd \"" & argv & "\"; clear" as string

	tell application "iTerm"
		activate

		set theWindow to current window

		if theWindow = missing value then
			set theWindow to (create window with default profile)
			tell theWindow
				write (current session) text command
			end tell
		else
			tell theWindow
				set theTab to (create tab with default profile)
				tell theTab
					write (current session) text command
				end tell
			end tell
		end if
		
	end tell
end run
