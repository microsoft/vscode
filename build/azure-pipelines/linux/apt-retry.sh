#!/bin/sh
################################################################################
##  Copied from https://github.com/actions/runner-images/blob/ubuntu22/20240825.1/images/ubuntu/scripts/build/configure-apt-mock.sh
################################################################################

i=1
while [ $i -le 30 ];do
  err=$(mktemp)
  "$@" 2>$err

  # no errors, break the loop and continue normal flow
  test -f $err || break
  cat $err >&2

  retry=false

  if grep -q 'Could not get lock' $err;then
    # apt db locked needs retry
    retry=true
  elif grep -q 'Could not open file /var/lib/apt/lists' $err;then
    # apt update is not completed, needs retry
    retry=true
  elif grep -q 'IPC connect call failed' $err;then
    # the delay should help with gpg-agent not ready
    retry=true
  elif grep -q 'Temporary failure in name resolution' $err;then
    # It looks like DNS is not updated with random generated hostname yet
    retry=true
  elif grep -q 'dpkg frontend is locked by another process' $err;then
    # dpkg process is busy by another process
    retry=true
  fi

  rm $err
  if [ $retry = false ]; then
    break
  fi

  sleep 5
  echo "...retry $i"
  i=$((i + 1))
done
