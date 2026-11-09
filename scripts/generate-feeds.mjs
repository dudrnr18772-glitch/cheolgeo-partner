/**
 * 철거파트너 RSS + 사이트맵 생성기
 * 실행: node scripts/generate-feeds.mjs
 * 별도 npm 설치 없이 Node.js 기본 기능만 사용합니다.
 *
 * - public 아래의 독립 HTML 페이지를 스캔합니다.
 * - 메인과 404는 RSS에서 제외하고, 나머지 정보성 페이지를 최신 20개까지 담습니다.
 * - 사이트맵에는 검색 가능한 모든 페이지의 URL과 최종 수정일을 담습니다.
 * - 기존 page-dates.json에 기록된 실제 날짜를 우선하며, 페이지에서 메타 날짜도 읽습니다.
 * - 새 HTML 파일을 만들면 다음 실행 때 목록에 자동으로 포함됩니다.
 * - 기존 페이지의 실질적 수정 날짜는 page-dates.json 또는 HTML 메타에서 갱신해야 합니다.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_DIR = join(PROJECT_DIR, 'public');
const SITE_ORIGIN = 'https://cheolgeopartner.com';
const RSS_LIMIT = 20;

function escapeXml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function findMeta(html, attr, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const prop = tag.match(new RegExp('\\b' + attr + '\\s*=\s*["\']([^"\']+)["\']', 'i'));
    if (!prop || prop[1].toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    return decodeEntities(content?.[1] || '');
  }
  return null;
}
function kstToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function validDate(s) {
  const v = String(s ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) return null;
  return v;
}
function pubDate(s) {
  // 사이트 운영 시간대(Asia/Seoul)의 정오로 기록합니다.
  return new Date(`${s}T12:00:00+09:00`).toUTCString();
}
function readIndexFiles(dir) {
  const out = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) out.push(...readIndexFiles(join(dir, item.name)));
    else if (item.name === 'index.html') out.push(join(dir, item.name));
  }
  return out;
}
function extractMain(html) {
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  return m?.[1] || '';
}
function cleanMain(html) {
  return html
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(script|style|noscript|nav|form|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(img|source|video|audio|iframe)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s(?:href|src)=(['"])\/(?!\/)(.*?)\1/gi, (_, q, p) => ` href=${q}${SITE_ORIGIN}/${p}${q}`);
}
function mainToText(html) {
  return decodeEntities(html
    .replace(/<\/?(?:h[1-6]|p|div|section|article|blockquote|li|tr|table|ul|ol|details|summary)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ') // strip remaining HTML tags
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

const datesFile = join(PUBLIC_DIR, 'page-dates.json');
const pageDates = existsSync(datesFile) ? JSON.parse(readFileSync(datesFile, 'utf8')) : {};
const today = kstToday();
const pages = [];
for (const filepath of readIndexFiles(PUBLIC_DIR)) {
  const rel = relative(PUBLIC_DIR, filepath).split(sep).join('/');
  const pathname = rel === 'index.html' ? '/' : '/' + rel.slice(0, -'index.html'.length);
  const url = SITE_ORIGIN + pathname;
  const html = readFileSync(filepath, 'utf8');
  if (/content\s*=\s*["'][^"']*\bnoindex\b/i.test(html)) continue;
  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || (pageDates[pathname]?.name || pathname));
  const published = validDate(pageDates[pathname]?.datePublished || findMeta(html, 'property', 'article:published_time')) || today;
  const modified = [validDate(pageDates[pathname]?.dateModified), validDate(findMeta(html, 'property', 'article:modified_time'))].filter(Boolean).sort().at(-1) || published;
  const main = cleanMain(extractMain(html));
  const text = mainToText(main);
  if (pathname !== '/' && !text) {
    console.warn(`RSS에서 본문이 없는 페이지를 제외합니다: ${pathname}`);
  }
  pages.push({ pathname, url, title, published, modified, main, text });
}
pages.sort((a, b) => a.pathname === '/' ? -1 : b.pathname === '/' ? 1 : a.pathname.localeCompare(b.pathname));

const sm = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(p => `  <url><loc>${escapeXml(p.url)}</loc><lastmod>${p.modified}</lastmod></url>`),
  '</urlset>', ''
].join('\n');
writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), sm, 'utf8');

const items = pages.filter(p => p.pathname !== '/' && p.text.length > 0)
  .sort((a,b) => b.published.localeCompare(a.published) || b.modified.localeCompare(a.modified) || a.pathname.localeCompare(b.pathname))
  .slice(0,RSS_LIMIT);
const rss = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
  '  <channel>',
  '    <title>철거파트너 | 폐업철거·상가 원상복구 정보</title>',
  `    <link>${SITE_ORIGIN}/</link>`,
  '    <description>폐업·임대차 종료 사업자를 위한 점포 전체 철거, 상가 원상복구, 철거비용 및 업종별·지역별 안내</description>',
  '    <language>ko-KR</language>',
  `    <atom:link href="${SITE_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>`,
  ...(items.length ? [`    <lastBuildDate>${pubDate(items.map(p => p.modified).sort().at(-1))}</lastBuildDate>`] : []),
  ...items.flatMap(p => [
    '    <item>',
    `      <title>${escapeXml(p.title)}</title>`,
    `      <link>${escapeXml(p.url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(p.url)}</guid>`,
    `      <pubDate>${pubDate(p.published)}</pubDate>`,
    `      <description>${escapeXml(p.text)}</description>`,
    `      <content:encoded><![CDATA[${p.main.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>`,
    '    </item>'
  ]),
  '  </channel>', '</rss>', ''
].join('\n');
writeFileSync(join(PUBLIC_DIR, 'rss.xml'), rss, 'utf8');
console.log(`완료: sitemap.xml ${pages.length}개 URL, rss.xml ${items.length}개 콘텐츠 (최대 ${RSS_LIMIT}개)`);
