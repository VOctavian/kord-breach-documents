// Сжатие скриншотов перед загрузкой в репозиторий. PNG из игры весит 1–3 МБ,
// тот же кадр в JPEG — около 130 КБ, а на глаз разницы нет. Всё делает браузер:
// зависимостей у проекта нет и заводить их ради этого не хочется.
export const SHOT_MAX_WIDTH = 1920;
export const SHOT_QUALITY = 0.85;

/**
 * Приводит выбранный файл к JPEG нужной ширины.
 * Возвращает исходный файл, если сжимать нечего или браузер не смог его прочитать.
 */
export async function toJpeg(file, { maxWidth = SHOT_MAX_WIDTH, quality = SHOT_QUALITY } = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // не картинка или формат не по зубам браузеру — пусть решает сервер
  }

  const scale = Math.min(1, maxWidth / bmp.width);
  // Готовый JPEG нужной ширины не трогаем: перекодирование только съест качество.
  if (file.type === 'image/jpeg' && scale === 1) {
    bmp.close();
    return file;
  }

  let src = bmp;
  if (scale < 1) {
    src = await createImageBitmap(bmp, {
      resizeWidth: Math.round(bmp.width * scale),
      resizeHeight: Math.round(bmp.height * scale),
      resizeQuality: 'high',
    });
    bmp.close();
  }

  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  // alpha: false — в JPEG прозрачности всё равно нет, а холст без неё быстрее.
  canvas.getContext('2d', { alpha: false }).drawImage(src, 0, 0);
  src.close();

  const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
  return blob ?? file;
}
