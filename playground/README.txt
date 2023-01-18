node merge-yarn-lock.js yarn.lock.ours yarn.lock.base yarn.lock.theirs > yarn.lock.result.custom
git merge-file -p yarn.lock.ours yarn.lock.base yarn.lock.theirs > yarn.lock.result.git
