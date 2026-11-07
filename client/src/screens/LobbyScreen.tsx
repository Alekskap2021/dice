import { Button, Input } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

/** Копирует текст. Буфер обмена браузера работает только на https и localhost, поэтому на обычном http запасной путь — скрытое поле и execCommand. */
const copyText = async (text: string): Promise<boolean> => {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* пробуем запасной способ */
    }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
};

export const LobbyScreen = () => {
  const room = useStore((s) => s.room);
  const error = useStore((s) => s.lobbyError);
  if (!room) return null;

  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const isHost = room.you === 0;

  const copy = async (): Promise<void> => {
    if (await copyText(link)) actions.notify('Ссылка скопирована');
    else actions.notify('Не удалось скопировать: выделите ссылку и скопируйте вручную');
  };

  const share = (): void => {
    void navigator.share({ title: 'Кости', text: `Сыграем в кости! Код комнаты: ${room.code}`, url: link }).catch(() => undefined);
  };

  return (
    <section className="screen">
      <div className="card lobby-card">
        <h2 className="title title-sm">Комната</h2>
        <div className="room-code">{room.code}</div>
        <p className="hint">Отправьте приглашение другу</p>
        <div className="invite-row">
          <Input readOnly value={link} aria-label="Ссылка-приглашение" onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={copy}>Копировать</Button>
          {typeof navigator.share === 'function' && <Button onClick={share}>Поделиться</Button>}
        </div>

        <ul className="lobby-players">
          {room.names.map((name, index) => (
            <li key={name + index}>
              <span>{name}</span>
              <span className="tag">{index === 0 ? 'хозяин' : 'гость'}{index === room.you ? ' · вы' : ''}</span>
            </li>
          ))}
          {room.names.length < 2 && <li className="waiting">Ждём друга…</li>}
        </ul>
        <p className="hint">
          Играем до <b>{room.target}</b> очков{room.lastTurn ? ', с правилом «последний ход»' : ''}
        </p>

        <div className="stack">
          <Button variant="primary" size="lg" block disabled={!isHost || room.names.length < 2} onClick={actions.startOnlineGame}>
            {isHost ? 'Начать игру' : 'Ждём начала игры…'}
          </Button>
          <Button variant="ghost" block onClick={actions.leave}>
            Выйти
          </Button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
};
