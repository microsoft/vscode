#!/bin/bash
# This is the install script for installing vs code onto a linux machine
# Usage: sudo bash linux_install.sh 
userid=`id -u`
if [[ $userid -ne 0 ]]
then
   echo "Sorry, you aren't a root user"
fi

cmd=`mkdir "/usr/local/vscode/"`

if [[ $cmd -eq 0 ]]; then
	echo "folder creation successful"
else
	echo "something went wrong creating folder"
fi

cmd=`cp vscode.desktop /usr/share/applications`

if [[ $cmd -eq 0 ]]; then
	echo "successfully installed app shortcut"
else
	echo "something went wrong with installing app shortcut"
fi

cmd=`cp -r * /usr/local/vscode/`

if [[ $cmd -eq 0 ]]; then
	echo "successfully installed app"
else
	echo "something went wrong with installing app"
fi
