import { css, type Handle, on } from 'remix/component';
import { layout, text } from './styles.ts';
import { type Theme, theme, themes } from './theme.ts';

const fixedWidth = css({
  boxSizing: 'content-box',
  width: `${3 + Math.max(...themes.map((value) => value.length))}ch`,
});

export function ThemeControl(handle: Handle) {
  let current: Theme = 'auto';

  function sync() {
    current = theme.current;
    handle.update();
  }

  handle.queueTask(() => {
    sync();
    theme.addEventListener('change', sync, { signal: handle.signal });
  });

  return () => (
    <button
      type="button"
      aria-label={`Color theme: ${current}`}
      mix={[on('click', () => theme.cycle()), fixedWidth, layout.fixed, text.alignCenter]}
    >
      ◐ {current}
    </button>
  );
}
