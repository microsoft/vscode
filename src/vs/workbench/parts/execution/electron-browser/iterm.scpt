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
		
		set done to true
	end tell
end run
