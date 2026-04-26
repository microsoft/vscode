import Requests

target = 'code.visualstudio.com'
traffic = True

while traffic:
	r = requests.get(target)
