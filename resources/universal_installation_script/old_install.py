#!/usr/local/bin/python

import json
import requests
import subprocess

def main():
	# Get the JSON of the latest release
	latest_json = requests.get('https://api.github.com/repos/Microsoft/vscode/releases/latest').json()
	# ENHANCEMENT: Provide stronger error handling
	if not latest_json:
		print("We failed to get information about the latest version available... Sorry.")
		return
	# Now we have the JSON, we can proceed to downloading and installing
	# Process each asset and download the zip file(s)
	for each in latest_json['assets']:
		print(each['content_type'])
		if each['content_type'] == "application/zip":
			print("Downloading the files...")
			download = requests.get(each['browser_download_url'])
			install_dir = raw_input('Where should we install the package? (Full path): ')
			# Build the installation commands (unzip and make a symlink and add the icon and desktop files)
			# BUG: What if no root access?
			unzip_cmd = "unzip " + each['name'] + " -d " + install_dir
			symlink_cmd = "sudo ln -s " + install_dir + "/ /usr/local/bin/code"
			icon_cmd = "sudo cp " + install_dir + "/resources/app/resources/linux/VSCode.png /usr/share/icons/hicolor/512x512/apps/VSCode.png"
			desktop_file_cmd = "sudo cp " + install_dir + "/resources/app/resources/linux/VSCode.desktop /usr/share/applications/VSCode.desktop"
			# Execute the commands
			unzip_process = subprocess.run(unzip_cmd.split(), stdout=subprocess.PIPE)
			symlink_process = subprocess.run(symlink_cmd.split(), stdout=subprocess.PIPE)
			icon_process = subprocess.run(icon_cmd.split(), stdout=subprocess.PIPE)
			desktop_process = subprocess.run(desktop_file_cmd.split(), stdout=subprocess.PIPE)
	print("Installation finished.")
	return

if __name__ == '__main__':
	try:
		main()
	except KeyboardInterrupt:
		raise SystemExit
