-------------------------------------------------------------------
-- Copyright (c) Microsoft Corporation. All rights reserved.
-- Licensed under the MIT License.
-- See License.txt in the project root for license information.
-------------------------------------------------------------------

on run argv
	set command to "cd \"" & argv & "\"; clear" as string

	tell application "Terminal"
		activate
		set targetWindow to null

		repeat with currentWindow in windows
			if currentWindow is not busy then
				set targetWindow to currentWindow
			end if
		end repeat

		if targetWindow ≠ null then
			do script command in targetWindow
		else
			do script command
		end if
	end tell
end run
