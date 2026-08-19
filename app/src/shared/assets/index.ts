/**
 * 생성 에셋 매핑 — 엔진 값 → 이미지 주소.
 *
 * ## 이 파일이 하는 일과 하지 않는 일
 * 오행·별자리·지지 같은 **엔진이 확정한 값**을 이미지 주소로 옮기기만 한다. 무엇이 강한지,
 * 어떤 그림을 보여 줄지 **판정하지 않는다** — 그 판정은 이미 엔진이 했고, 여기서 다시 하면
 * 화면이 계산에 개입하는 것이 된다(C00 §H).
 *
 * ## 왜 정적 import 대신 `import.meta.glob` 인가
 * 46장을 한 줄씩 import 하면 파일이 길어지고 새 에셋을 넣을 때마다 두 곳(디렉터리와 이 파일)을
 * 고쳐야 한다. glob 은 디렉터리가 정본이 된다.
 *
 * `query: '?url'` 이 중요하다 — 이걸 빼면 4KB 미만 파일이 base64 로 **자바스크립트 안에** 인라인돼
 * 초기 청크가 커진다. URL 로 받으면 이미지는 별도 파일로 남고, 브라우저는 실제로 화면에 그릴 때만
 * 내려받는다. 미니앱 번들에는 파일이 포함되지만 초기 파싱 비용은 URL 문자열뿐이다.
 *
 * ## 없는 에셋을 참조하면
 * `null` 을 돌려준다. 던지지 않는다 — 에셋 한 장이 빠졌다고 결과 화면이 통째로 죽으면 안 된다.
 * 화면은 `null` 일 때 그림 없이 텍스트만 그린다.
 */

import type { Element } from '../lib/saju/types';

/** `src/assets/generated/<세트>/<이름>.webp` → URL. 빌드 시 정적으로 해석된다. */
const GENERATED = import.meta.glob<string>('../../assets/generated/*/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * glob 키(`../../assets/generated/elements/wood.webp`)에서 `세트/이름` 만 뽑아 다시 색인한다.
 * 상대경로가 키에 남으면 이 파일 위치가 바뀔 때 조회가 조용히 전부 실패한다.
 */
const BY_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(GENERATED).flatMap(([path, url]) => {
    const m = /\/generated\/([^/]+)\/([^/]+)\.webp$/.exec(path);
    return m === null ? [] : [[`${m[1] ?? ''}/${m[2] ?? ''}`, url] as const];
  }),
);

function lookup(set: string, name: string): string | null {
  return BY_KEY.get(`${set}/${name}`) ?? null;
}

/**
 * 오행 한자 → 파일명.
 *
 * 파일명을 한자로 두지 않는 이유: 파일 시스템·URL·빌드 도구를 거치며 인코딩이 갈리는 자리를
 * 만들 이유가 없다. 매핑은 여기 한 곳에만 둔다.
 */
const ELEMENT_SLUG: Readonly<Record<Element, string>> = {
  木: 'wood',
  火: 'fire',
  土: 'earth',
  金: 'metal',
  水: 'water',
};

/** 홈 히어로 오브젝트. 가장 강한 오행을 그대로 받는다 — 어느 오행이 강한지는 엔진이 정한다. */
export function elementObjectUrl(element: Element): string | null {
  return lookup('elements', ELEMENT_SLUG[element]);
}

/** 홈 배경. 오브젝트와 같은 오행을 쓴다(둘이 갈리면 화면이 두 가지 색을 말하게 된다). */
export function elementBackdropUrl(element: Element): string | null {
  return lookup('backdrop', ELEMENT_SLUG[element]);
}

/**
 * 별자리 카드 그림. `zodiacSignIdOf()` 가 내는 사인 id(`leo` 등)를 그대로 받는다.
 * 그 id 는 지식카드 `zodiac:*` 의 key 이기도 하므로 세 곳(엔진·카드·에셋)이 같은 어휘를 쓴다.
 */
export function zodiacUrl(signId: string): string | null {
  return lookup('zodiac', signId);
}

/** 십이지 → 파일명. 지지 한자를 로마자로 옮긴 것이며 순서는 자축인묘… 고정이다. */
const BRANCH_SLUG: Readonly<Record<string, string>> = {
  子: 'ja',
  丑: 'chuk',
  寅: 'in',
  卯: 'myo',
  辰: 'jin',
  巳: 'sa',
  午: 'o',
  未: 'mi',
  申: 'sin',
  酉: 'yu',
  戌: 'sul',
  亥: 'hae',
};

/** 일지 띠 그림. 지지 한 글자를 받는다. */
export function branchUrl(branch: string): string | null {
  const slug = BRANCH_SLUG[branch];
  return slug === undefined ? null : lookup('branch', slug);
}

/** 십신 그룹 → 파일명. `TenGodGroup` 값과 짝이 맞아야 한다. */
const TEN_GOD_SLUG: Readonly<Record<string, string>> = {
  비겁: 'bigyeop',
  식상: 'siksang',
  재성: 'jaeseong',
  관성: 'gwanseong',
  인성: 'inseong',
};

/** 십신 그룹 카드 아이콘. */
export function tenGodUrl(group: string): string | null {
  const slug = TEN_GOD_SLUG[group];
  return slug === undefined ? null : lookup('tengod', slug);
}

/** 궁합 관계 상태. 엔진의 등급을 화면이 이 넷 중 하나로 옮긴 값을 받는다. */
export type CompatMood = 'harmony' | 'tension' | 'complement' | 'independent';

export function compatUrl(mood: CompatMood): string | null {
  return lookup('compat', mood);
}

/** 계산 연출. 1~3 단계. 범위를 벗어나면 null 이다. */
export function loadingUrl(step: 1 | 2 | 3): string | null {
  return lookup('loading', `reading-${step}`);
}

/** 지금 번들에 실제로 들어 있는 에셋 키 목록. 테스트와 진단용이다. */
export function availableAssetKeys(): readonly string[] {
  return [...BY_KEY.keys()].sort();
}
