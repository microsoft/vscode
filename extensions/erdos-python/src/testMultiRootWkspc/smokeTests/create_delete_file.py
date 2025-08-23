with open('smart_send_smoke.txt', 'w') as f:
    f.write('This is for smart send smoke test')
import os

os.remove('smart_send_smoke.txt')
