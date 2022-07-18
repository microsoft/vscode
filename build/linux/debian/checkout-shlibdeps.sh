#!/bin/sh

# Try cloning the repository in a newer way
git clone --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/chromium/chromium.git 2> /dev/null
if [ $? = 0 ]; then
	# Do a sparse checkout using newer commands. Ref https://stackoverflow.com/a/63786181
	cd chromium
	git sparse-checkout init --cone
	git sparse-checkout add third_party/dpkg-shlibdeps
	git checkout
else
	# Do a sparse checkout the old way.
	# Ref https://stackoverflow.com/a/13738951
	mkdir chromium
	cd chromium
	git init
	git remote add -f origin https://github.com/chromium/chromium.git
	git config core.sparseCheckout true
	echo "third_party/dpkg-shlibdeps" >> .git/info/sparse-checkout
	git pull origin main
fi
