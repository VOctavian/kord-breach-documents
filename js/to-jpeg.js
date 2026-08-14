// Перекодирование картинок в JPEG перед загрузкой на сервер.
//
// Скриншоты из игры прилетают в PNG по мегабайту с лишним, тогда как тот же
// кадр в JPEG весит около сотни килобайт — на глаз разницы нет, а репозиторий
// и трафик посетителей отличаются в разы. Кодирует браузер, поэтому зависимостей
// у проекта не прибавляется.
const QUALITY = 0.85;

/** File или Blob → JPEG-Blob. Уже готовый JPEG возвращается как есть. */
export async function toJpeg(file, quality = QUALITY) {
  if (file.type === 'image/jpeg') return file;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    // JPEG не умеет прозрачность: без заливки полупрозрачные места станут
    // чёрными. Белый фон ближе к тому, как картинку видели в редакторе.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } finally {
    bitmap.close();
  }
}
