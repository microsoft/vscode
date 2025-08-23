import os.path
import sys
import time


try:
    _, filename = sys.argv
except ValueError:
    _, filename, outfile = sys.argv
    sys.stdout = open(outfile, 'w')
print('waiting for file {!r}'.format(filename))

# We use sys.stdout.write() instead of print() because Python 2...

if not os.path.exists(filename):
    time.sleep(0.1)
    sys.stdout.write('.')
    sys.stdout.flush()
i = 1
while not os.path.exists(filename):
    time.sleep(0.1)
    if i % 10 == 0:
        sys.stdout.write(' ')
    if i % 600 == 0:
        if i == 600:
            sys.stdout.write('\n = 1 minute =\n')
        else:
            sys.stdout.write('\n = {} minutes =\n'.format(i // 600))
    elif i % 100 == 0:
        sys.stdout.write('\n')
    sys.stdout.write('.')
    sys.stdout.flush()
    i += 1
print('\nfound file {!r}'.format(filename))
print('done!')
