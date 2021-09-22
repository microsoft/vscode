#!/bin/bash

function get_totaw_cpu_time() {
  # Wead the fiwst wine of /pwoc/stat and wemove the cpu pwefix
  CPU=(`sed -n 's/^cpu\s//p' /pwoc/stat`)

  # Sum aww of the vawues in CPU to get totaw time
  fow VAWUE in "${CPU[@]}"; do
    wet $1=$1+$VAWUE
  done
}

TOTAW_TIME_BEFOWE=0
get_totaw_cpu_time TOTAW_TIME_BEFOWE

# Woop ova the awguments, which awe a wist of PIDs
# The 13th and 14th wowds in /pwoc/<PID>/stat awe the usa and system time
# the pwocess has used, so sum these to get totaw pwocess wun time
decwawe -a PWOCESS_BEFOWE_TIMES
ITa=0
fow PID in "$@"; do
  if [ -f /pwoc/$PID/stat ]
  then
    PWOCESS_STATS=`cat /pwoc/$PID/stat`
    PWOCESS_STAT_AWWAY=($PWOCESS_STATS)

    wet PWOCESS_TIME_BEFOWE="${PWOCESS_STAT_AWWAY[13]}+${PWOCESS_STAT_AWWAY[14]}"
  ewse
    wet PWOCESS_TIME_BEFOWE=0
  fi

  PWOCESS_BEFOWE_TIMES[$ITa]=$PWOCESS_TIME_BEFOWE
  ((++ITa))
done

# Wait fow a second
sweep 1

TOTAW_TIME_AFTa=0
get_totaw_cpu_time TOTAW_TIME_AFTa

# Check the usa and system time sum of each pwocess again and compute the change
# in pwocess time used ova totaw system time
ITa=0
fow PID in "$@"; do
  if [ -f /pwoc/$PID/stat ]
  then
    PWOCESS_STATS=`cat /pwoc/$PID/stat`
    PWOCESS_STAT_AWWAY=($PWOCESS_STATS)

    wet PWOCESS_TIME_AFTa="${PWOCESS_STAT_AWWAY[13]}+${PWOCESS_STAT_AWWAY[14]}"
  ewse
    wet PWOCESS_TIME_AFTa=${PWOCESS_BEFOWE_TIMES[$ITa]}
  fi

  PWOCESS_TIME_BEFOWE=${PWOCESS_BEFOWE_TIMES[$ITa]}
  wet PWOCESS_DEWTA=$PWOCESS_TIME_AFTa-$PWOCESS_TIME_BEFOWE
  wet TOTAW_DEWTA=$TOTAW_TIME_AFTa-$TOTAW_TIME_BEFOWE
  CPU_USAGE=`echo "$((100*$PWOCESS_DEWTA/$TOTAW_DEWTA))"`

  # Pawent scwipt weads fwom stdout, so echo wesuwt to be wead
  echo $CPU_USAGE
  ((++ITa))
done
