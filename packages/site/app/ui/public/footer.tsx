import type { Handle } from 'remix/component';
import { border, color, layout, space, text } from './styles.ts';

export function Footer(_handle: Handle) {
  return () => (
    <footer mix={[border.top, color.sheet, color.muted, space.padBlock3, text.small]}>
      <div mix={[layout.container, layout.cluster, space.gap2]}>
        <p>
          Data from the public{' '}
          <a href="https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/cfn-resource-specification.html">
            AWS CloudFormation resource specification
          </a>
          . Not affiliated with AWS.
        </p>
        <p mix={layout.pushEnd}>
          Made by <a href="https://barney.dev">Michael Barney</a>
        </p>
      </div>
    </footer>
  );
}
