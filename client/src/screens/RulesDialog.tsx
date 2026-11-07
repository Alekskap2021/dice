import { RULES_TABLE } from '../../../shared/rules.ts';
import { Button, Dialog, Kbd } from '../ui/index.ts';
import { actions, useStore } from '../store.ts';

export const RulesDialog = () => {
  const open = useStore((s) => s.rulesOpen);
  return (
    <Dialog open={open} onOpenChange={actions.setRulesOpen} title="Правила" description="Играем на шести кубиках. Побеждает тот, кто первым набрал нужное число очков.">
      <div className="rules">
        <h3>Ход</h3>
        <p>
          Бросьте кубики. Выберите те, что дают очки: каждый выбранный кубик должен входить в комбинацию. Затем либо заберите очки хода и
          передайте ход, либо бросьте оставшиеся кубики ради большего.
        </p>
        <h3>Болт</h3>
        <p>Если после броска нет ни одной комбинации, все очки хода сгорают, и ход переходит к сопернику.</p>
        <h3>Горячие кости</h3>
        <p>Если все шесть кубиков дали очки, можно бросить все шесть заново и продолжить набирать очки в том же ходу.</p>
        <h3>Очки</h3>
        <table>
          <tbody>
            {RULES_TABLE.map((row) => (
              <tr key={row.combo}>
                <td>{row.combo}</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Горячие клавиши</h3>
        <p>
          <Kbd>R</Kbd> — взять выбранные кубики и бросить ещё. <Kbd>Space</Kbd> — взять выбранные кубики, забрать очки и закончить ход.
          Перед первым броском хода обе клавиши просто бросают кубики.
        </p>
      </div>
      <Button variant="primary" block onClick={() => actions.setRulesOpen(false)}>
        Понятно
      </Button>
    </Dialog>
  );
};
