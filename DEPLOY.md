# Деплой на VPS

Нужен сервер с Ubuntu 22.04/24.04 и доступом по SSH. Для HTTPS нужен домен.

1. (Для HTTPS) В DNS домена создайте A-запись на IP сервера, например `game.example.com` → `1.2.3.4`.
2. Зайдите на сервер: `ssh root@IP`
3. Поставьте Docker: `curl -fsSL https://get.docker.com | sh`
4. Скачайте проект: `git clone https://github.com/Alekskap2021/dice.git && cd dice`
5. Укажите адрес: `echo "SITE_ADDRESS=game.example.com" > .env` (без домена пропустите этот шаг, игра будет по http://IP)
6. Запустите: `docker compose up -d --build`
7. Откройте `https://game.example.com` (или `http://IP`).

Обновление: `cd dice && git pull && docker compose up -d --build`
Логи: `docker compose logs -f app`
Если включён файрвол, откройте порты 80 и 443.
