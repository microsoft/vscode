#!/usr/local/bin/python

import urllib
import shutil
import subprocess
import platform

app_osx_link = "http://go.microsoft.com/fwlink/?LinkID=620882"
windows_link = "http://go.microsoft.com/fwlink/?LinkID=623230"
linux64_link = "http://go.microsoft.com/fwlink/?LinkID=620884"
linux32_link = "http://go.microsoft.com/fwlink/?LinkID=620885"

app_osx_file = "VSCode-darwin.zip"
windows_file = "VSCodeSetup.exe"
linux64_file = "VSCode-linux64.zip"
linux32_file = "VSCode-linux32.zip"

def main():
	# Check the current platform and architecture
	# We don't care about bitness for Windows and Apple
	if platform.system() == "Linux":
		os_type = 'l'
		if platform.machine().endswith("64"):
			os_64bit = 'y'
		else:
			os_64bit = 'n'
	elif platform.system() == "Darwin":
		os_type = 'a'
		os_64bit = "64"
	elif platform.system() == "Windows":
		os_type = 'w'
		os_64bit = "64"
	else:
	# Collect the information manually instead of failing
		print("We were unable to determine your operating system type...")
		os_type = raw_input("l for Linux, w for Windows, a for Apple OSX: ")
		if os_type == 'l':
			os_64bit = raw_input("64 bit OS? (y or n): ")

	# Set the download links according to collected information
	if os_type == 'w':
		latest_url = windows_link
	elif os_type == 'a':
		latest_url = app_osx_link
	elif os_type == 'l':
		if os_64bit == 'y':
			latest_url = linux64_link
		else:
			# Assuming anything other than y for 64bit meant a no
			latest_url = linux32_link
			os_64bit = 'n'
	
	# Hopefully we have got the links right by now
	# Download the file and take steps depending on the OS
	download(latest_url, os_type, os_64bit)
	
	if os_type == 'w':
		# Interactive install for Windows users. YAY!!!
		launch_setup = "./" + windows_file
		win_install = subprocess.run(launch_setup)
		return
	elif os_type == 'a':
		# TODO: I don't know anything about OSX
		print("This hasn't been implemented yet...Sorry!!!")
		return
	elif os_type == 'l':
		install_dir = raw_input("Where should we install the package? (Full path): ")
		# Build the installation commands (unzip, symlink, icon, .desktop files)
		# BUG: What if no root access?
		symlink_cmd = "sudo ln -s " + install_dir + "/Code /usr/local/bin/code"
		icon_cmd = "sudo cp " + install_dir + "/resources/app/resources/linux/VSCode.png /usr/share/icons/hicolor/512x512/apps/VSCode.png"
		desktop_file_cmd = "sudo cp " + install_dir + "/resources/app/resources/linux/VSCode.desktop /usr/share/applications/VSCode.desktop"
		if os_64bit == 'y':
			unzip_cmd = "unzip " + linux64_file + " -d " + install_dir
		else:
			unzip_cmd = "unzip " + linux32_file + " -d " + install_dir
		
		# Execute the commands
		unzip_process = subprocess.run(unzip_cmd.split(), stdout=subprocess.PIPE)
		symlink_process = subprocess.run(symlink_cmd.split(), stdout=subprocess.PIPE)
		icon_process = subprocess.run(icon_cmd.split(), stdout=subprocess.PIPE)
		desktop_process = subprocess.run(desktop_file_cmd.split(), stdout=subprocess.PIPE)
		print("Installation finished. You can run VSCode from the Applications menu or by typing 'code' into a terminal.")
	# Return, we are done
	return

# Helper to download the correct file and write it to disk
# QUESTION: What if the current working directory is read-only?
def download(latest_url, os_type, os_64bit):
	# Set the file name according to the target OS
	if os_type == 'w':
		file_name = windows_file
	elif os_type == 'a':
		file_name = app_osx_file
	elif os_type == 'l':
		if os_64bit == 'y':
			file_name = linux64_file
		else:
			file_name = linux32_file
	
	# Let's get that file
	# TODO: Better alternative to urllib?
	with urllib.request.urlopen(latest_url) as response, open(file_name, 'wb') as out_file:
		shutil.copyfileobj(response, out_file)
	return

if __name__ == '__main__':
	try:
		main()
	except KeyboardInterrupt:
		raise SystemExit
