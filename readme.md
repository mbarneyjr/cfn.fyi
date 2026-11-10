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
1. Apply the database migrations
1. Invalidate the CloudFront distribution

## Database Migrations

Migrations live in `packages/site/db/migrations`.
Each migration is a directory with an `up.sql` and a `down.sql`.

Each file must contain one DDL statement.
The runner sends a file to the database as one query.
Aurora DSQL runs a multi-statement query as one implicit transaction and rejects more than one DDL statement in it.
The `-- data-table/transaction: none` directive does not change this.
The sqlite test database accepts multi-statement files, so tests do not catch the error.

To replace a table, write one migration that drops it and a second migration that creates it.
