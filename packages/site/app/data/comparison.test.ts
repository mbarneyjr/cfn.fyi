import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { compare, type Line } from './comparison.ts';
import type { Specification } from './specification.ts';

const text = (line: Line) =>
  `${line.mark ?? ' '} ${'  '.repeat(line.depth - (line.dash ? 1 : 0))}${line.dash ? '- ' : ''}${line.key ? `${line.key.text}:` : ''}${line.value ? `${line.key ? ' ' : ''}${line.value.text}` : ''}${line.comment ? `${line.key || line.value ? '  ' : ''}# ${line.comment.text}` : ''}`;

const before: Specification = {
  ResourceSpecificationVersion: '1.0.0',
  ResourceTypes: {
    'AWS::Test::Thing': {
      Properties: {
        Name: { PrimitiveType: 'String', Required: false, UpdateType: 'Mutable' },
        Rule: { Type: 'Rule', UpdateType: 'Mutable' },
        Setting: { Type: 'Setting', Required: true, UpdateType: 'Mutable' },
      },
      Attributes: { 'Config.Arn': { PrimitiveType: 'String' } },
    },
    'AWS::Test::Gone': { Properties: { Id: { PrimitiveType: 'String' } } },
  },
  PropertyTypes: {
    'AWS::Test::Thing.Rule': {
      Properties: {
        Statement: { Type: 'Rule' },
        Values: { Type: 'List', PrimitiveItemType: 'String' },
      },
    },
    'AWS::Test::Thing.Orphan': { Properties: { Value: { PrimitiveType: 'String' } } },
    'AWS::Test::Thing.Setting': { Properties: { Mode: { PrimitiveType: 'String' } } },
  },
};

const after: Specification = {
  ResourceSpecificationVersion: '2.0.0',
  ResourceTypes: {
    'AWS::Test::Thing': {
      Properties: {
        Name: { PrimitiveType: 'String', Required: true, UpdateType: 'Immutable' },
        Rule: { Type: 'Rule', UpdateType: 'Mutable' },
        Setting: { Type: 'Setting', Required: false, UpdateType: 'Mutable' },
        Tags: { Type: 'List', ItemType: 'Tag', DuplicatesAllowed: true },
      },
      Attributes: { 'Config.Arn': { PrimitiveType: 'String' } },
    },
  },
  PropertyTypes: {
    'AWS::Test::Thing.Rule': {
      Properties: {
        Statement: { Type: 'Rule' },
        Values: { Type: 'Map', PrimitiveItemType: 'String' },
      },
    },
    'AWS::Test::Thing.Orphan': { Properties: { Value: { PrimitiveType: 'Integer' } } },
    'AWS::Test::Thing.Setting': { Properties: { Mode: { PrimitiveType: 'String' } } },
    Tag: { Properties: { Key: { PrimitiveType: 'String' }, Value: { PrimitiveType: 'String' } } },
  },
};

describe('compare', () => {
  const changelog = compare(before, after);
  const block = (name: string) => changelog.blocks.find((candidate) => candidate.name === name);

  it('renders a modified resource as YAML with marked changes', () => {
    assert.deepEqual(block('AWS::Test::Thing')?.lines.map(text), [
      '  Type: AWS::Test::Thing',
      '  Properties:',
      '    # Required: No → Yes',
      '    # Update requires: No interruption → Replacement',
      '~   Name: String',
      '    Rule:',
      '      Statement:  # Rule: see above',
      '~     Values: List of String → Map of String',
      '    # Required: Yes → No',
      '~   Setting: Setting',
      '+   Tags:',
      '+     - Key: String',
      '+       Value: String',
      '  PropertyTypes:',
      '    Orphan:',
      '~     Value: String → Integer',
    ]);
  });

  it('links see-above comments to the named property', () => {
    const lines = block('AWS::Test::Thing')?.lines ?? [];
    assert.equal(lines.find((line) => line.comment?.href)?.comment?.href, '#aws-test-thing-rule');
    assert.ok(lines.some((line) => line.id === 'aws-test-thing-rule'));
  });

  it('renders a removed resource', () => {
    assert.equal(block('AWS::Test::Gone')?.status, 'removed');
    assert.deepEqual(block('AWS::Test::Gone')?.lines.map(text), ['- Type: AWS::Test::Gone']);
  });

  it('lists added, then modified, then removed resources', () => {
    const statuses = compare(before, {
      ...after,
      ResourceTypes: { ...after.ResourceTypes, 'AWS::Test::New': { Properties: {} } },
    }).blocks.map((candidate) => candidate.status);
    assert.deepEqual(statuses, ['added', 'modified', 'removed']);
  });

  it('renders every resource as an addition for the first version', () => {
    const first = compare(undefined, after);
    assert.ok(first.blocks.every((candidate) => candidate.status === 'added'));
    assert.ok(first.blocks[0].lines.map(text).includes('+   Config.Arn: String'));
  });
});
