# gen_sxtwl_golden.py — 골든셋 34케이스를 sxtwl 로 산출 (KST 벽시계를 그대로 투입 = 흔한 사용법)
import json, sxtwl

GAN = "甲乙丙丁戊己庚辛壬癸"
ZHI = "子丑寅卯辰巳午未申酉戌亥"

G = json.load(open('golden-set.json', encoding='utf-8'))
out = {}
for c in G['cases']:
    ds, tm = c['ts'].split(' ')
    y, mo, d = map(int, ds.split('-'))
    hh, mi = map(int, tm.split(':'))
    try:
        day = sxtwl.fromSolar(y, mo, d)
        yg = day.getYearGZ(); mg = day.getMonthGZ(); dg = day.getDayGZ()
        hg = day.getHourGZ(hh)
        s = ' '.join([GAN[yg.tg] + ZHI[yg.dz], GAN[mg.tg] + ZHI[mg.dz],
                      GAN[dg.tg] + ZHI[dg.dz], GAN[hg.tg] + ZHI[hg.dz]])
    except Exception as e:
        s = 'ERR:' + str(e)
    out[c['id']] = s
json.dump(out, open('sxtwl-golden.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('sxtwl rows =', len(out))
for k, v in out.items():
    print(k, v)
