import time
import os
print(os.getpid())
time.sleep(1)
for i in 10000:
    time.sleep(0.1)
    print(i)
print('end')
