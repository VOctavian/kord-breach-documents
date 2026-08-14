// Отрисовка ответов на опрос. Общее для локального survey-editor.html и
// веб-админки: данные они берут по-разному (через server.mjs с service-ключом
// и напрямую из PostgREST под админом), а показывают одинаково.
import { el } from './common.js';

/** Карточка одного ответа. `titleById` — id вопроса → его текст. */
export function answerCard(row, titleById, onDelete) {
  return el(
    'div',
    { class: 'sv-answer' },
    el(
      'div',
      { class: 'sv-a-head' },
      el('span', { class: 'sv-a-date' }, new Date(row.created_at).toLocaleString('ru-RU')),
      el('span', { class: 'sv-a-lang' }, row.lang ?? '—'),
      el('span', { class: 'spacer' }),
      onDelete
        ? el('button', { class: 'btn small danger', type: 'button', onclick: () => onDelete(row) }, 'Удалить')
        : null
    ),
    ...Object.entries(row.answers ?? {}).map(([qid, value]) =>
      el(
        'div',
        { class: 'sv-a-item' },
        el('div', { class: 'sv-a-q' }, titleById.get(qid) ?? qid),
        el('div', { class: 'sv-a-v' }, value)
      )
    )
  );
}

/**
 * CSV с ответами. Колонки задаёт опрос, а не строки: у старых ответов может не
 * быть вопросов, добавленных позже, и наоборот.
 */
export function resultsCsv(survey, rows) {
  const questions = survey?.questions ?? [];
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return [
    ['Дата', 'Язык', ...questions.map((q) => q.text || q.id)].map(esc).join(','),
    ...rows.map((r) =>
      [
        new Date(r.created_at).toISOString(),
        r.lang ?? '',
        ...questions.map((q) => r.answers?.[q.id] ?? ''),
      ]
        .map(esc)
        .join(',')
    ),
  ].join('\n');
}

/** Скачать CSV файлом. BOM обязателен, иначе Excel покажет кириллицу кракозябрами. */
export function downloadCsv(name, csv) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
