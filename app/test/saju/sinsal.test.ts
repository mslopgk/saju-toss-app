// S4-2 회귀 — 근거: C04 §테스트벡터 TV-1~TV-7, C00 §S4-3~§S4-7, §3-D(D1~D19), C16 §5-3
//
// 기대값의 출처는 C04 의 테스트 벡터다. C04 는 4주 간지만 입력으로 받는 순수 판정이므로
// 시각·절기 파이프라인을 통과시키지 않고 `pillarsOf()` 로 간지를 직접 조립해 검증한다.
//
// ⚠️ C04 TV-5 의 「백호대살: 연주 丁丑 히트」는 **C00 §3-D7(dayPillarFirst) 과 모순**이다.
//    TV-5 의 일주는 庚辰이고 백호 7간지 목록에 없다 → 게이트에서 막혀야 한다.
//    C04 자신이 TV-4·TV-6 에서는 게이트 의존을 명시하는데 TV-5 만 갱신되지 않았다.
//    C00 §3 결정표가 정본이므로 여기서는 **미성립**을 기대값으로 고정한다.

import { describe, expect, it } from 'vitest';
import params from '../../src/shared/data/sinsal-params.json';
import tables from '../../src/shared/data/tables.json';
import { CARDS } from '../../src/shared/knowledge';
import { BRANCHES } from '../../src/shared/lib/saju/constants';
import {
  RELATION_KNOWLEDGE_KEY,
  computeSinsalChart,
  gongmangOf,
  samjaeOf,
  sinsal12Of,
  sinsalScoreOf,
} from '../../src/shared/lib/saju/sinsal';
import type { Branch, PillarKey, SinsalChart, SinsalHit } from '../../src/shared/lib/saju/types';
import { pillarsOf } from './strength-fixtures';

const PILLARS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];

function chartOf(gz8: string): SinsalChart {
  return computeSinsalChart(pillarsOf(gz8));
}
const unseongRow = (c: SinsalChart): (string | null)[] => PILLARS.map((k) => c.unseong[k]);
const sinsal12Row = (c: SinsalChart): (string | null)[] =>
  PILLARS.map((k) => c.sinsal12[k]?.byYear ?? null);
const hit = (c: SinsalChart, name: string): SinsalHit | undefined =>
  c.sinsal.find((h) => h.name === name);
const relTypes = (c: SinsalChart): string[] =>
  c.branchRelations.map((r) => `${r.type}:${(r.pair ?? r.branches ?? []).join('')}@${r.at}`);

describe('S4-2 · C04 테스트벡터', () => {
  describe('TV-1 庚午 辛巳 丙寅 癸巳 (일간 丙)', () => {
    const c = chartOf('庚午 辛巳 丙寅 癸巳');
    it('십이운성(일간 거법)', () => {
      expect(unseongRow(c)).toEqual(['제왕', '건록', '장생', '건록']);
    });
    it('십이신살(연지 午 기준)', () => {
      expect(sinsal12Row(c)).toEqual(['장성살', '망신살', '지살', '망신살']);
    });
    it('공망 戌亥 — 4주에 없으므로 히트 0', () => {
      expect(c.gongmang.voidBranches).toEqual(['戌', '亥']);
      expect(c.gongmang.hits).toEqual([]);
      expect(hit(c, '공망')).toBeUndefined();
    });
    it('천을귀인·문창귀인 없음 / 양인은 연지 午', () => {
      expect(hit(c, '천을귀인')).toBeUndefined();
      expect(hit(c, '문창귀인')).toBeUndefined();
      expect(hit(c, '양인살')?.pillars).toEqual(['year']);
    });
    it('괴강·백호대살 없음', () => {
      expect(hit(c, '괴강')).toBeUndefined();
      expect(hit(c, '백호대살')).toBeUndefined();
    });
    it('삼재(午 → 火局)', () => {
      expect(c.samjae).toEqual(['申', '酉', '戌']);
    });
  });

  describe('TV-2 甲子 丙寅 戊辰 壬子 (일간 戊)', () => {
    const c = chartOf('甲子 丙寅 戊辰 壬子');
    it('십이운성', () => {
      expect(unseongRow(c)).toEqual(['태', '장생', '관대', '태']);
    });
    it('십이신살(연지 子)', () => {
      expect(sinsal12Row(c)).toEqual(['장성살', '역마살', '화개살', '장성살']);
    });
    it('공망 戌亥 히트 0 / 천을·양인 없음', () => {
      expect(c.gongmang.voidBranches).toEqual(['戌', '亥']);
      expect(c.gongmang.hits).toEqual([]);
      expect(hit(c, '천을귀인')).toBeUndefined();
      expect(hit(c, '양인살')).toBeUndefined();
    });
    it('백호대살 — 일주 戊辰 히트(게이트 통과)', () => {
      expect(hit(c, '백호대살')?.pillars).toEqual(['day']);
      expect(hit(c, '백호대살')?.basis).toBe('간지');
    });
    it('삼재(子 → 水局)', () => {
      expect(c.samjae).toEqual(['寅', '卯', '辰']);
    });
  });

  describe('TV-3 乙亥 己卯 辛酉 戊子 (일간 辛)', () => {
    const c = chartOf('乙亥 己卯 辛酉 戊子');
    it('십이운성', () => {
      expect(unseongRow(c)).toEqual(['목욕', '절', '건록', '장생']);
    });
    it('십이신살(연지 亥)', () => {
      expect(sinsal12Row(c)).toEqual(['지살', '장성살', '재살', '연살']);
    });
    it('공망 子丑 → 시지 子', () => {
      expect(c.gongmang.voidBranches).toEqual(['子', '丑']);
      expect(c.gongmang.hits).toEqual(['hour']);
    });
    it('문창·학당이 같은 자리(시지 子) / 천을귀인 없음', () => {
      expect(hit(c, '문창귀인')?.pillars).toEqual(['hour']);
      expect(hit(c, '학당귀인')?.pillars).toEqual(['hour']);
      expect(hit(c, '천을귀인')).toBeUndefined();
    });
    it('삼재(亥 → 木局)', () => {
      expect(c.samjae).toEqual(['巳', '午', '未']);
    });
    it('지지 관계 — 卯酉충(월-일)', () => {
      expect(relTypes(c)).toContain('육충:卯酉@월-일');
    });
  });

  describe('TV-4 壬戌 庚戌 甲子 丁卯 (일간 甲) — 게이트 반례', () => {
    const c = chartOf('壬戌 庚戌 甲子 丁卯');
    it('십이운성', () => {
      expect(unseongRow(c)).toEqual(['양', '양', '목욕', '제왕']);
    });
    it('십이신살(연지 戌)', () => {
      expect(sinsal12Row(c)).toEqual(['화개살', '화개살', '재살', '연살']);
    });
    it('공망 戌亥 → 연지·월지 2개', () => {
      expect(c.gongmang.voidBranches).toEqual(['戌', '亥']);
      expect(c.gongmang.hits).toEqual(['year', 'month']);
    });
    it('양인은 시지 卯', () => {
      expect(hit(c, '양인살')?.pillars).toEqual(['hour']);
    });
    it('C00 §3-D7 — 일주 甲子 라서 백호·괴강 둘 다 미성립', () => {
      expect(hit(c, '백호대살')).toBeUndefined();
      expect(hit(c, '괴강')).toBeUndefined();
    });
    it('게이트 차이는 정확히 16점이다 (C04 §12 반례)', () => {
      // anyPillar 였다면 백호[연] + 괴강[연,월] 이 붙었을 것이다.
      const asAnyPillar: SinsalHit[] = [
        ...c.sinsal,
        { name: '백호대살', pillars: ['year'], basis: '간지', score: -5 },
        { name: '괴강', pillars: ['year', 'month'], basis: '간지', score: -2 },
      ];
      expect(c.sinsalScore - sinsalScoreOf(asAnyPillar)).toBeCloseTo(16, 9);
    });
    it('삼재(戌 → 火局) · 卯戌육합 2건', () => {
      expect(c.samjae).toEqual(['申', '酉', '戌']);
      expect(relTypes(c)).toContain('육합:戌卯@연-시');
      expect(relTypes(c)).toContain('육합:戌卯@월-시');
    });
  });

  describe('TV-5 丁丑 癸卯 庚辰 甲申 (일간 庚)', () => {
    const c = chartOf('丁丑 癸卯 庚辰 甲申');
    it('십이운성', () => {
      expect(unseongRow(c)).toEqual(['묘', '태', '양', '건록']);
    });
    it('십이신살(연지 丑)', () => {
      expect(sinsal12Row(c)).toEqual(['화개살', '재살', '천살', '망신살']);
    });
    it('공망 申酉 → 시지 申', () => {
      expect(c.gongmang.voidBranches).toEqual(['申', '酉']);
      expect(c.gongmang.hits).toEqual(['hour']);
    });
    it('천을귀인 KR안(庚→丑未) — 연지 丑 히트', () => {
      expect(hit(c, '천을귀인')?.pillars).toEqual(['year']);
      expect(tables.cheoneulGwiin.data.庚).toEqual(['丑', '未']);
    });
    it('괴강 — 일주 庚辰 히트', () => {
      expect(hit(c, '괴강')?.pillars).toEqual(['day']);
    });
    it('백호대살 — 일주 庚辰이 목록 밖이라 게이트에서 막힌다 (C04 TV-5 서술 정정)', () => {
      expect(tables.baekhoDaesal.data).not.toContain('庚辰');
      expect(hit(c, '백호대살')).toBeUndefined();
    });
    it('지지 관계 — 丑辰파 · 卯辰해 · 卯申원진 · 卯申귀문', () => {
      const rel = relTypes(c);
      expect(rel).toContain('육파:丑辰@연-일');
      expect(rel).toContain('육해:卯辰@월-일');
      expect(rel).toContain('원진:卯申@월-시');
      expect(rel).toContain('귀문:卯申@월-시');
    });
    it('삼재(丑 → 金局)', () => {
      expect(c.samjae).toEqual(['亥', '子', '丑']);
    });
  });

  describe('TV-6 己未 丙子 癸巳 壬戌 (일간 癸)', () => {
    const c = chartOf('己未 丙子 癸巳 壬戌');
    it('십이운성', () => {
      expect(unseongRow(c)).toEqual(['묘', '건록', '태', '쇠']);
    });
    it('십이신살(연지 未)', () => {
      expect(sinsal12Row(c)).toEqual(['화개살', '연살', '역마살', '천살']);
    });
    it('공망 午未 → 연지 未', () => {
      expect(c.gongmang.voidBranches).toEqual(['午', '未']);
      expect(c.gongmang.hits).toEqual(['year']);
    });
    it('천을귀인(癸→卯巳) — 일지 巳', () => {
      expect(hit(c, '천을귀인')?.pillars).toEqual(['day']);
    });
    it('C00 §3-D7 — 일주 癸巳 라서 백호·괴강 둘 다 미성립', () => {
      expect(hit(c, '백호대살')).toBeUndefined();
      expect(hit(c, '괴강')).toBeUndefined();
    });
    it('지지 관계 — 未子해 · 未子원진 · 未戌파 · 巳戌원진 · 巳戌귀문', () => {
      const rel = relTypes(c);
      expect(rel).toContain('육해:未子@연-월');
      expect(rel).toContain('원진:未子@연-월');
      expect(rel).toContain('육파:未戌@연-시');
      expect(rel).toContain('원진:巳戌@일-시');
      expect(rel).toContain('귀문:巳戌@일-시');
    });
    it('삼재(未 → 木局)', () => {
      expect(c.samjae).toEqual(['巳', '午', '未']);
    });
  });
});

describe('S4-2 · C04 TV-7 단위 스팟 체크', () => {
  it('공망 — 일간에 따라 5가지다(지지 12행표는 틀린 구현)', () => {
    expect(gongmangOf('丙子').voidBranches).toEqual(['申', '酉']);
    expect(gongmangOf('壬子').voidBranches).toEqual(['寅', '卯']);
    expect(gongmangOf('癸亥').voidBranches).toEqual(['子', '丑']);
    expect(gongmangOf('甲子').voidBranches).toEqual(['戌', '亥']);
    expect(gongmangOf('庚子').voidBranches).toEqual(['辰', '巳']);
    expect(gongmangOf('戊子').voidBranches).toEqual(['午', '未']);
  });
  it('십이신살', () => {
    expect(sinsal12Of('子', '酉')).toBe('연살');
    expect(sinsal12Of('寅', '申')).toBe('역마살');
    expect(sinsal12Of('巳', '丑')).toBe('화개살');
    expect(sinsal12Of('亥', '卯')).toBe('장성살');
  });
  it('삼재 — 규칙 [沖(生地), +1, +2] 12/12', () => {
    expect(samjaeOf('卯')).toEqual(['巳', '午', '未']);
    expect(samjaeOf('申')).toEqual(['寅', '卯', '辰']);
  });
});

describe('S4-2 · 표 무결성 불변식', () => {
  it('십이신살 12×12 — 기준지지마다 12개 이름이 정확히 한 번씩 나온다', () => {
    for (const base of BRANCHES) {
      const names = BRANCHES.map((t) => sinsal12Of(base, t));
      expect(new Set(names).size).toBe(12);
    }
  });

  it('C00 §S4-4(b) 항등식 — 지살=生地 · 장성살=旺地 · 화개살=墓地 · 역마살=沖(生地)', () => {
    const samhap = tables.branchRelations.data.삼합 as { branches: string[] }[];
    const chung = tables.branchRelations.data.육충.map as Record<string, string>;
    for (const set of samhap) {
      const [sheng, wang, mu] = set.branches as [Branch, Branch, Branch];
      for (const base of set.branches as Branch[]) {
        expect(sinsal12Of(base, sheng)).toBe('지살');
        expect(sinsal12Of(base, wang)).toBe('장성살');
        expect(sinsal12Of(base, mu)).toBe('화개살');
        expect(sinsal12Of(base, chung[sheng] as Branch)).toBe('역마살');
      }
    }
  });

  it('공망 60행 — 순(旬)마다 정확히 6간지, 공망 지지는 인접 2개', () => {
    const rows = tables.gongmang.data as Record<string, { xun: string; void: string[] }>;
    const byXun = new Map<string, number>();
    for (const [ganji, v] of Object.entries(rows)) {
      byXun.set(v.xun, (byXun.get(v.xun) ?? 0) + 1);
      const i = BRANCHES.indexOf(v.void[0] as Branch);
      const j = BRANCHES.indexOf(v.void[1] as Branch);
      expect((i + 1) % 12).toBe(j);
      expect(gongmangOf(ganji).voidBranches).toEqual(v.void);
    }
    expect(byXun.size).toBe(6);
    for (const n of byXun.values()) expect(n).toBe(10);
  });

  it('학당귀인 = 일간 장생지 (C00 §3-D11 검증식)', () => {
    const hakdang = tables.hakdangGwiin.data as Record<string, { branch: string }>;
    const stages = tables.twelveStages.data as Record<string, Record<string, string>>;
    for (const [stem, v] of Object.entries(hakdang)) {
      expect(stages[stem][v.branch]).toBe('장생');
    }
  });

  it('원진은 대칭 6쌍이다 (C00 §3-D10 — 방향성안 미채택)', () => {
    const wonjin = tables.branchRelations.data.원진.map as Record<string, string>;
    for (const [a, b] of Object.entries(wonjin)) expect(wonjin[b]).toBe(a);
    expect(new Set(Object.entries(wonjin).map(([a, b]) => [a, b].sort().join(''))).size).toBe(6);
  });

  it('귀문관살은 원진에서 두 쌍만 교환한 형태다 (C00 §3-D9)', () => {
    const wonjin = tables.branchRelations.data.원진.map as Record<string, string>;
    const gwimun = tables.branchRelations.data.귀문.map as Record<string, string>;
    // 원진 (子未, 寅酉) → 귀문 (子酉, 寅未). 나머지 4쌍은 그대로라 어긋나는 키는 4개뿐이다.
    const diff = Object.keys(wonjin).filter((k) => wonjin[k] !== gwimun[k]);
    expect(diff.sort()).toEqual(['子', '寅', '未', '酉']);
    expect(gwimun['子']).toBe('酉');
    expect(gwimun['寅']).toBe('未');
    expect(gwimun['丑']).toBe(wonjin['丑']);
  });

  it('천간충은 4쌍이고 戊甲·己乙 은 극으로 분리된다 (C00 §3-D14)', () => {
    expect(tables.stemRelations.data.천간충).toHaveLength(4);
    expect(tables.stemRelations.data.천간극_비충).toEqual([
      ['甲', '戊'],
      ['乙', '己'],
    ]);
  });
});

describe('S4-2 · 계수 파일 자체 정합', () => {
  it('십이운성 에너지 표가 tables.json 의 12운성 표기와 글자 단위로 같다', () => {
    const stages = tables.twelveStages.data as Record<string, Record<string, string>>;
    const used = new Set<string>();
    for (const row of Object.values(stages)) for (const v of Object.values(row)) used.add(v);
    expect([...used].sort()).toEqual(Object.keys(params.unseongEnergy.data).sort());
  });

  it('에너지 나눗수 4.5 = 기둥 가중치 합 (코드는 이 값을 유도해서 쓴다)', () => {
    const sum = Object.values(params.pillarWeight.data).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(params.unseongEnergyShape.data.divisor, 9);
  });

  it('관계 → 지식카드 key 매핑이 실제 카드와 맞는다', () => {
    const daewoonKeys = new Set(
      (CARDS as readonly { kind: string; key: string }[])
        .filter((c) => c.kind === 'daewoon' && c.key.startsWith('관계:'))
        .map((c) => c.key.slice('관계:'.length)),
    );
    for (const v of Object.values(RELATION_KNOWLEDGE_KEY)) {
      expect.soft(daewoonKeys.has(v), v).toBe(true);
    }
    // 카드 쪽에만 있고 엔진 타입에 대응이 없는 것은 `형`(총론 카드) 하나뿐이다.
    const mapped = new Set(Object.values(RELATION_KNOWLEDGE_KEY));
    expect([...daewoonKeys].filter((k) => !mapped.has(k))).toEqual(['형']);
  });

  it('게이트가 걸린 신살은 배점표에도 있어야 한다', () => {
    for (const name of Object.keys(params.gates.data)) {
      expect(Object.keys(params.sinsalScore.data)).toContain(name);
    }
  });
});

describe('S4-2 · 삼주 모드', () => {
  const c = computeSinsalChart(pillarsOf('庚午 辛巳 丙寅'));
  it('시주 칸이 null 이고 나머지는 정상 산출된다', () => {
    expect(c.unseong.hour).toBeNull();
    expect(c.unseongByPillarStem.hour).toBeNull();
    expect(c.sinsal12.hour).toBeNull();
    expect(c.unseong.day).toBe('장생');
  });
  it('에너지가 존재하는 3기둥 가중치 합(3.5)으로 정규화돼 0..100 안에 남는다', () => {
    const e = params.unseongEnergy.data as Record<string, number>;
    const want = (e['제왕'] * 0.8 + e['건록'] * 1.2 + e['장생'] * 1.5) / 3.5;
    expect(c.unseongEnergy).toBeCloseTo(want, 9);
    expect(c.unseongEnergy).toBeLessThanOrEqual(100);
  });
  it('신살 히트의 기둥에 hour 가 섞이지 않는다', () => {
    for (const h of c.sinsal) expect(h.pillars).not.toContain('hour');
  });
});

describe('S4-2 · 결정론', () => {
  it('같은 간지면 비트 단위로 같은 결과', () => {
    const a = JSON.stringify(chartOf('丁丑 癸卯 庚辰 甲申'));
    const b = JSON.stringify(chartOf('丁丑 癸卯 庚辰 甲申'));
    expect(a).toBe(b);
  });
  it('봉법(각 기둥 천간 기준)은 거법과 다른 값을 낸다 (C00 §3-D2 — 부기용)', () => {
    const c = chartOf('壬戌 庚戌 甲子 丁卯');
    expect(PILLARS.map((k) => c.unseongByPillarStem[k])).toEqual(['관대', '쇠', '목욕', '병']);
    expect(PILLARS.map((k) => c.unseong[k])).not.toEqual(PILLARS.map((k) => c.unseongByPillarStem[k]));
  });
});
