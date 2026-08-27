// Разовая переделка опроса про игровые клипы под типы вопросов.
//
// Варианты ответа были втиснуты в текст вопроса скобками — отвечать приходилось
// текстом, а считать голоса было нечем. Здесь те же вопросы раскладываются на
// `one`/`many` с настоящими вариантами.
//
// Идентификаторы вопросов сохраняем: по ним привязаны уже собранные ответы.
//
//   node scripts/rewrite-clips-survey.mjs            показать
//   node scripts/rewrite-clips-survey.mjs --write    записать
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRITE = process.argv.includes('--write');
const SURVEY = 'smsyq0k7s';

const file = JSON.parse(readFileSync(`${ROOT}data/survey.json`, 'utf8'));
const survey = file.surveys.find((s) => s.id === SURVEY);
if (!survey) throw new Error(`опрос ${SURVEY} не найден`);

const old = new Map(survey.questions.map((q) => [q.id, q]));
let n = 0;
const oid = () => `o${(++n).toString(36)}`;

/** Вариант ответа: пара «RU / EN». */
const o = (text, textEn) => ({ id: oid(), text, textEn });

/** Вопрос с сохранением id и картинок исходного. */
function q(id, patch) {
  const was = old.get(id);
  if (!was) throw new Error(`вопроса ${id} нет в опросе`);
  return { id, text: was.text, textEn: was.textEn, images: was.images ?? [], multiline: false, options: [], extra: false, ...patch };
}

const questions = [
  q('qmsyq0k7s0', { type: 'text' }),
  q('qmsyq0k7s1', { type: 'text' }),

  q('qmsyqa5ch', {
    type: 'one',
    options: [
      o('Да, регулярно', 'Yes, regularly'),
      o('Иногда, если момент того стоит', 'Sometimes, if the moment is worth it'),
      o('Нет, не записываю', 'No, I do not record'),
    ],
  }),

  q('qmsyqano0', {
    type: 'many',
    extra: true,
    options: [
      o('OBS Studio', 'OBS Studio'),
      o('NVIDIA ShadowPlay', 'NVIDIA ShadowPlay'),
      o('AMD ReLive / Adrenalin', 'AMD ReLive / Adrenalin'),
      o('Игровая панель Xbox', 'Xbox Game Bar'),
      o('Medal.tv', 'Medal.tv'),
      o('Оверлей Steam', 'Steam overlay'),
    ],
  }),

  q('qmsyqbsxd', {
    type: 'one',
    options: [
      o('Ни одного', 'None'),
      o('1–10', '1–10'),
      o('11–50', '11–50'),
      o('51–200', '51–200'),
      o('Больше 200', 'More than 200'),
      o('Никогда не считал', 'Never counted'),
    ],
  }),

  q('qmsyqcysh', {
    text: 'Что обычно происходит с записанным клипом?',
    textEn: 'What usually happens to a recorded clip?',
    type: 'many',
    extra: true,
    options: [
      o('Кидаю файл друзьям в Discord', 'I send the file to friends on Discord'),
      o('Заливаю на YouTube', 'I upload it to YouTube'),
      o('Публикую в TikTok, Shorts или Reels', 'I post it to TikTok, Shorts or Reels'),
      o('Монтирую в большое видео', 'I edit it into a longer video'),
      o('Просто лежит на диске', 'It just sits on the drive'),
      o('Удаляю', 'I delete it'),
    ],
  }),

  q('qmsyqfo2x', { type: 'text', multiline: true }),

  q('qmsyqfwea', {
    text: 'Что мешает выкладывать чаще?',
    textEn: 'What stops you from posting more often?',
    type: 'many',
    extra: true,
    options: [
      o('Долго заливать', 'Uploading takes too long'),
      o('Лень возиться с обрезкой', 'Too lazy to bother with trimming'),
      o('Файл слишком большой, чтобы кинуть напрямую', 'The file is too big to send directly'),
      o('Не хочу светить на публичном канале', 'I do not want it on a public channel'),
      o('Не помню, что уже выложил, а что нет', 'I lose track of what is already posted'),
      o('Ничего не мешает, выкладываю сколько нужно', 'Nothing stops me, I post as much as I want'),
    ],
  }),

  q('qmsyqjg7l', {
    text: 'Насколько описанная программа решает твою задачу?',
    textEn: 'How well does the program described above solve your problem?',
    type: 'one',
    extra: true,
    options: [
      o('Полностью — это про меня', 'Completely — that is exactly my case'),
      o('Частично, часть шагов всё равно руками', 'Partly, some steps stay manual'),
      o('Почти нет', 'Barely'),
      o('Совсем не моя задача', 'Not my problem at all'),
    ],
  }),

  q('qmsyqjo5d', {
    text: 'Отметь, что делал руками за последний месяц',
    textEn: 'Mark what you did by hand over the last month',
    type: 'many',
    extra: true,
    options: [
      o('Обрезал клип перед тем, как выложить', 'Trimmed a clip before posting'),
      o('Делал из горизонтального клипа вертикальный', 'Turned a horizontal clip into a vertical one'),
      o('Заливал видео скрытым или по ссылке', 'Uploaded a video unlisted or link-only'),
      o('Искал, куда подевался уже выложенный клип', 'Hunted for a clip I had already posted'),
      o('Удалял записи, чтобы освободить место', 'Deleted recordings to free up space'),
      o('Ничего из этого', 'None of these'),
    ],
  }),

  q('qmsyql6g9', {
    text: 'Какими функциями пользовался бы чаще всего? Отметь до трёх',
    textEn: 'Which features would you use most often? Pick up to three',
    type: 'many',
    options: [
      o('Сам подхватывает новые записи из папки', 'Picks up new recordings from the folder by itself'),
      o('Загрузка на YouTube в один клик', 'One-click upload to YouTube'),
      o('Быстрая обрезка без потери качества', 'Fast trimming without re-encoding'),
      o('Вертикальный кадр для Shorts и TikTok', 'Vertical crop for Shorts and TikTok'),
      o('Библиотека со статусами и ссылками', 'A library with statuses and links'),
      o('Удалить файл с диска, ссылку оставить', 'Delete the local file, keep the link'),
      o('Скачать своё видео обратно с YouTube', 'Download your own video back from YouTube'),
      o('Пресеты названий, описаний и тегов', 'Presets for titles, descriptions and tags'),
      o('Автопостинг ссылки в Discord', 'Auto-posting the link to Discord'),
      o('Публикация в TikTok', 'Publishing to TikTok'),
    ],
  }),

  q('qmsyqmw6x', { type: 'text', multiline: true }),

  q('qmsyqn0z5', {
    text: 'Если бы такая программа была готова сегодня',
    textEn: 'If such a program were ready today',
    type: 'one',
    extra: true,
    options: [
      o('Поставил бы прямо сейчас', 'I would install it right away'),
      o('Посмотрел бы, но не факт', 'I would take a look, but no promises'),
      o('Не поставил бы', 'I would not install it'),
    ],
  }),

  q('qmsyqp1k9', { type: 'text' }),

  q('qmsyrfjqq', {
    text: 'Сколько было бы не жалко отдать за такую программу?',
    textEn: 'How much would you be willing to pay for such a program?',
    type: 'one',
    extra: true,
    options: [
      o('Только бесплатно', 'Free only'),
      o('До 200 ₽ в месяц', 'Up to €2 a month'),
      o('200–500 ₽ в месяц', '€2–5 a month'),
      o('Больше 500 ₽ в месяц', 'More than €5 a month'),
      o('Разово до 1500 ₽ навсегда', 'A one-off payment up to €15'),
      o('Разово больше 1500 ₽ навсегда', 'A one-off payment above €15'),
    ],
  }),
];

const kind = (x) => ({ text: 'текст', one: 'один вариант', many: 'несколько' })[x.type];
console.log(`\nОпрос: ${survey.title}\n`);
for (const [i, x] of questions.entries()) {
  const extra = x.extra ? ' + своими словами' : '';
  console.log(`${String(i + 1).padStart(2)}. ${kind(x).padEnd(16)} ${x.options.length ? x.options.length + ' вар.' : '     '}${extra}  ${x.text.slice(0, 52)}`);
}
const byType = questions.reduce((a, x) => ((a[x.type] = (a[x.type] ?? 0) + 1), a), {});
console.log(`\nИтого: ${questions.length} вопросов — ${JSON.stringify(byType)}`);
console.log(`Все id сохранены: ${questions.every((x) => old.has(x.id))}`);

if (!WRITE) {
  console.log('\nЭто предпросмотр. Записать: node scripts/rewrite-clips-survey.mjs --write\n');
  process.exit(0);
}

survey.questions = questions;
writeFileSync(`${ROOT}data/survey.json`, JSON.stringify(file, null, 2) + '\n', 'utf8');
console.log('\nЗаписано в data/survey.json\n');
