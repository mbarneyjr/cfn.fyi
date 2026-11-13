import { clientEntry, css, type Handle, on } from 'remix/component';
import { layout, text } from '#app/ui/public/styles.ts';

const fixedWidth = css({ boxSizing: 'content-box', width: '6ch' });

export const CopyButton = clientEntry(import.meta.url, function CopyButton(handle: Handle<{ value: string }>) {
  let label = 'copy';

  return () => (
    <button
      type="button"
      aria-live="polite"
      mix={[
        on('click', async () => {
          label =
            (await navigator.clipboard?.writeText(handle.props.value).then(
              () => 'copied',
              () => 'failed',
            )) ?? 'failed';
          handle.update();
          setTimeout(() => {
            label = 'copy';
            handle.update();
          }, 2000);
        }),
        fixedWidth,
        layout.fixed,
        text.alignCenter,
      ]}
    >
      {label}
    </button>
  );
});
