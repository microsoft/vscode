R=`git status --porcelain | wc -l`
if [ "$R" -ne "0" ]; then
  echo "The git repo is not clean after compiling the /build/ folder. Did you forget to commit .js output for .ts files?";
  git status --porcelain
  exit 1;
fi
