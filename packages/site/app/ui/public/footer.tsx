import { css, type Handle } from 'remix/component';
import { border, color, layout, space, text } from './styles.ts';

const spread = css({ justifyContent: 'space-between' });

export function Footer(_handle: Handle) {
  return () => (
    <footer mix={[border.top, color.surface, color.muted, space.padBlock3, text.small]}>
      <div mix={[layout.container, layout.cluster, space.gap2, spread]}>
        <p>
          Data from the public{' '}
          <a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/cfn-resource-specification.html">
            AWS CloudFormation resource specification
          </a>
          . Not affiliated with AWS.
        </p>
        <p>
          Made by <a href="https://barney.dev">Michael Barney</a>
        </p>
      </div>
    </footer>
  );
}
