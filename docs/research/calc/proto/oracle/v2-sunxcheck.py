# v2-sunxcheck.py — 자체 JS 고정밀 태양황경을 PyMeeus / astronomy-engine / Skyfield(DE440s) 와 대조
import json, subprocess, sys, os
from pymeeus.Sun import Sun
from pymeeus.Epoch import Epoch

JDES = [2448908.5]
# 1900~2100 각 10년 간격 + 입춘 부근
import datetime
for y in range(1900, 2101, 10):
    JDES.append(Epoch(y, 2, 4.0).jde())
for y in [1950, 2000, 2024, 2025, 2026]:
    for mo in range(1, 13):
        JDES.append(Epoch(y, mo, 15.5).jde())

out = {}
for jde in JDES:
    e = Epoch(jde)
    l, b, r = Sun.apparent_geocentric_position(e)   # 겉보기 황경/황위/동경
    out[repr(jde)] = [float(l), float(b), float(r)]
json.dump(out, open('pymeeus_sun.json', 'w'))
print('pymeeus rows =', len(out))
print('ex25b jde=2448908.5 apparent lon =', out['2448908.5'][0])
