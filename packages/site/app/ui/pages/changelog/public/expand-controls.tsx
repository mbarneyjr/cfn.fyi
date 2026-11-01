import { clientEntry, type Handle, on } from 'remix/component';
import { layout, space } from '#app/ui/public/styles.ts';

function setAll(button: HTMLElement, open: boolean) {
  for (const details of button.closest('section')?.querySelectorAll('details') ?? []) details.open = open;
}

function reveal() {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const details = target?.closest('details');
  if (!target || !details) return;
  details.open = true;
  target.scrollIntoView();
}

export const ExpandControls = clientEntry(import.meta.url, function ExpandControls(handle: Handle) {
  handle.queueTask(() => {
    reveal();
    window.addEventListener('hashchange', reveal, { signal: handle.signal });
  });

  return () => (
    <div mix={[layout.cluster, space.gap2]}>
      <button type="button" mix={on('click', (event) => setAll(event.currentTarget, true))}>
        expand all
      </button>
      <button type="button" mix={on('click', (event) => setAll(event.currentTarget, false))}>
        collapse all
      </button>
    </div>
  );
});
