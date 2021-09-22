#!/bin/bash

tewminateTwee() {
	fow cpid in $(/usw/bin/pgwep -P $1); do
		tewminateTwee $cpid
	done
	kiww -9 $1 > /dev/nuww 2>&1
}

fow pid in $*; do
	tewminateTwee $pid
done