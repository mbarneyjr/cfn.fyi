# cfn.fyi

A viewer for changes between versions of the AWS CloudFormation resource specification, at [cfn.fyi](https://cfn.fyi).

## Quick Start

### Prerequisites

- [Nix](https://nixos.org/download.html) with flakes enabled
- AWS credentials configured

### Local Development

```bash
# Enter the development environment
nix develop

# start the local development processes
nix run .#dev
```

The site will be available at `http://localhost:44100`.

## Deployment

Deploy to an environment (dev, qa, or prod):

```bash
./scripts/deploy.sh <environment>
```

This will:

1. Create a CloudFormation changeset
1. Execute the changeset
