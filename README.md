# Equipment Status Annotator — готов к GitHub Pages

## Локальный запуск
```bash
npm install
npm run dev
```
Открой: http://localhost:5173/equipment-status-annotator/

## Деплой на GitHub Pages
1) Убедись, что имя репозитория совпадает с base в vite.config.js:
   base: '/equipment-status-annotator/'
2) Ветка `main` →
```bash
npm run deploy
```
Это выполнит сборку и зальёт в ветку `gh-pages`. Сайт будет доступен по адресу:
```
https://<твой_ник>.github.io/equipment-status-annotator/
```

## Использование
- По умолчанию откроется /equipment-status-annotator/model.glb (лежит в public/)
- Можно передать параметры:
  https://<домен>/equipment-status-annotator/?model=<URL_glb>&statuses=<URL_json>

## Файлы
- public/model.glb — модель (вложена копия твоей модели)
- public/statuses.json — дефолтный шаблон статусов
