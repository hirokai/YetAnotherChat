import shutil
import requests
import time
import random


def get_random_color():
    r = random.randint(0, 255)
    g = random.randint(0, 255)
    b = random.randint(0, 255)
    color = ('%0.2x' % r) + ('%0.2x' % g) + ('%0.2x' % b)
    return color


colors = [get_random_color() for _ in range(5)]


def get_letter(letter):
    for i in range(5):
        color = colors[i]
        URL = "https://avatars.discourse.org/v4/letter/%s/%s/60.png" % (
            letter, color)
        print(color, URL)
        res = requests.get(URL, stream=True)
        with open('./public/img/letter/%s.%d.png' % (letter, i+1), "wb") as fp:
            shutil.copyfileobj(res.raw, fp)


for c in list('abcdefghijkmnopqrstuvwxyz'):
    print(c)
    get_letter(c)
    time.sleep(1)
